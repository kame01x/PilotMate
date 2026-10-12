"""Shared chat helper: system prompt, tool declarations, function-calling loop.
Fallback chain: Groq (primary) -> Gemini (secondary) -> Ollama (local)."""

import json
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import GEMINI_API_KEY, GEMINI_MODEL, GROQ_API_KEY, GROQ_MODEL, OLLAMA_HOST, OLLAMA_MODEL


# google-genai's Schema.model_dump() yields python-style JSON schema:
# uppercase types ("OBJECT"), snake_case keywords ("any_of") and null noise,
# which Groq's strict validator rejects (HTTP 400 metaschema failure).
_SCHEMA_KEEP = {
    "type": "type", "description": "description", "properties": "properties",
    "required": "required", "items": "items", "enum": "enum", "default": "default",
    "format": "format", "minimum": "minimum", "maximum": "maximum",
    "min_length": "minLength", "max_length": "maxLength",
    "min_items": "minItems", "max_items": "maxItems",
    "any_of": "anyOf", "all_of": "allOf", "one_of": "oneOf",
    "ref": "$ref", "defs": "$defs",
}


def _clean_json_schema(node):
    if isinstance(node, list):
        return [_clean_json_schema(item) for item in node]
    if not isinstance(node, dict):
        return node
    out: dict = {}
    for key, value in node.items():
        if value is None:
            continue
        if key in ("properties", "defs") and isinstance(value, dict):
            # maps keyed by name, not by schema keyword
            out["properties" if key == "properties" else "$defs"] = {
                name: _clean_json_schema(sub) for name, sub in value.items()
            }
            continue
        mapped = _SCHEMA_KEEP.get(key)
        if mapped is None:
            continue
        cleaned = _clean_json_schema(value)
        if mapped == "type" and isinstance(cleaned, str):
            cleaned = cleaned.lower()
        out[mapped] = cleaned
    return out


class GeminiChat:
    def __init__(self, system_prompt: str, tool_declarations: list | None = None,
                 tool_implementations: dict | None = None, model: str | None = None):
        self.system_prompt = system_prompt
        self.tool_declarations = tool_declarations or []
        self.tool_implementations = tool_implementations or {}
        self.model = model or GROQ_MODEL
        self.history: list[dict] = []
        self._ollama_msgs: list[dict] = []
        self.last_notice: str | None = None
        self._groq_tools = self._build_tools()
        self._gemini_types = None
        if GEMINI_API_KEY:
            try:
                from google import genai
                from google.genai import types
                self._gemini_client = genai.Client(api_key=GEMINI_API_KEY)
                self._gemini_types = types
            except Exception:
                self._gemini_client = None

    def _build_tools(self) -> list[dict]:
        tools = []
        for decl in self.tool_declarations:
            params = getattr(decl, "parameters", None)
            try:
                schema = params.model_dump() if hasattr(params, "model_dump") else (params or {})
            except Exception:
                schema = {}
            schema = _clean_json_schema(schema)
            tools.append({
                "type": "function",
                "function": {
                    "name": decl.name,
                    "description": getattr(decl, "description", ""),
                    "parameters": schema,
                },
            })
        return tools

    def _groq_messages(self) -> list[dict]:
        """Convert self.history (Gemini-style entries mixed with OpenAI-style
        ones) to the message format the OpenAI-compatible Groq API expects.
        The system prompt is prepended — Groq paths previously dropped it,
        so the model never saw its instructions/format contract."""
        messages = [{"role": "system", "content": self.system_prompt}]
        for m in self.history:
            role = "assistant" if m.get("role") == "model" else m.get("role", "user")
            content = m.get("content")
            if content is None:
                parts = m.get("parts") or []
                content = "".join(
                    p.get("text", "") for p in parts if isinstance(p, dict)
                )
            msg: dict = {"role": role, "content": content or ""}
            if m.get("tool_calls"):
                msg["tool_calls"] = m["tool_calls"]
            if m.get("tool_call_id"):
                msg["tool_call_id"] = m["tool_call_id"]
            messages.append(msg)
        return messages

    def _run_tool(self, fn_name: str, args: dict) -> dict:
        impl = self.tool_implementations.get(fn_name)
        if impl is None:
            return {"error": f"unknown tool {fn_name}"}
        try:
            return impl(**args)
        except Exception as exc:
            # A bad/hallucinated argument must not kill the request — tell the
            # model so it can correct itself or continue without that tool.
            return {"error": f"{fn_name} failed: {exc}"}

    def _call_groq(self) -> str:
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        for _round in range(8):
            response = None
            for attempt in range(5):
                response = httpx.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": GROQ_MODEL,
                        "messages": self._groq_messages(),
                        "tools": self._groq_tools,
                        "tool_choice": "auto",
                        "max_tokens": 8192,
                    },
                    timeout=120,
                )
                if response.status_code == 429 and attempt < 4:
                    # Free tier TPM limit — wait out the window (Groq says how long).
                    match = re.search(r"try again in ([\d.]+)s", response.text)
                    delay = min(float(match.group(1)), 60.0) + 2.0 if match else min(5.0 * (attempt + 1), 30.0)
                    print(f"[groq] rate limited, retrying in {delay:.0f}s (attempt {attempt + 1})")
                    time.sleep(delay)
                    continue
                break
            if response is None or response.status_code >= 400:
                raise RuntimeError(f"Groq HTTP {response.status_code}: {response.text[:300]}")
            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError("Groq returned empty choices")
            msg = choices[0].get("message", {})
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                text = msg.get("content") or ""
                self.history.append({"role": "assistant", "content": text})
                return text
            self.history.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})
            for call in tool_calls:
                fn_name = call["function"]["name"]
                args = call["function"].get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except ValueError:
                        args = {}
                result = self._run_tool(fn_name, args)
                self.history.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(result, default=str)})
        raise RuntimeError("Groq tool-call loop exceeded 8 rounds")

    def _gemini_contents(self) -> list[dict]:
        """History filtered to Gemini-shaped turns. Groq-style entries
        (content/tool_calls/tool roles) are mapped or skipped so a fallback
        call still works after accumulated Groq turns."""
        contents: list[dict] = []
        for m in self.history:
            if "parts" in m:
                contents.append(m)
                continue
            role = "model" if m.get("role") == "assistant" else m.get("role")
            content = m.get("content")
            if role in ("user", "model") and content:
                contents.append({"role": role, "parts": [{"text": str(content)}]})
        return contents

    def _call_gemini(self) -> str:
        types = self._gemini_types
        tools = [types.Tool(function_declarations=self.tool_declarations)] if self.tool_declarations else None
        config = types.GenerateContentConfig(system_instruction=self.system_prompt, tools=tools)
        contents = self._gemini_contents()
        response = self._gemini_client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=config)
        while response.function_calls:
            parts = []
            for call in response.function_calls:
                result = self._run_tool(call.name, call.args or {})
                parts.append(types.Part.from_function_response(name=call.name, response={"result": json.dumps(result, default=str)}))
            contents.append(response.candidates[0].content)
            contents.append({"role": "user", "parts": parts})
            response = self._gemini_client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=config)
        text = response.text or ""
        self.history.append({"role": "model", "parts": [{"text": text}]})
        return text

    def _ollama_tools(self) -> list[dict]:
        return self._groq_tools

    def _parse_tool_call_from_text(self, content: str) -> dict | None:
        text = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            data = json.loads(text)
        except (ValueError, json.JSONDecodeError):
            return None
        if isinstance(data, dict) and "name" in data and "arguments" in data:
            args = data["arguments"]
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except ValueError:
                    return None
            return {"name": data["name"], "arguments": args}
        return None

    def _call_ollama(self) -> str:
        if not self._ollama_msgs or self._ollama_msgs[0]["role"] != "system":
            self._ollama_msgs.insert(0, {"role": "system", "content": self.system_prompt})
        for attempt in range(8):
            try:
                resp = httpx.post(
                    f"{OLLAMA_HOST}/api/chat",
                    json={"model": OLLAMA_MODEL, "messages": self._ollama_msgs, "tools": self._ollama_tools() or None, "stream": False},
                    timeout=300,
                )
                resp.raise_for_status()
            except httpx.ConnectError:
                raise RuntimeError(f"Ollama is not reachable at {OLLAMA_HOST}. Start it (e.g. `ollama serve`) and retry.")
            data = resp.json()
            msg = data.get("message", {})
            tool_calls = msg.get("tool_calls") or []
            parsed = None if tool_calls else self._parse_tool_call_from_text(msg.get("content", "") or "")
            if not tool_calls and parsed:
                tool_calls = [{"function": {"name": parsed["name"], "arguments": parsed["arguments"]}}]
            if tool_calls:
                self._ollama_msgs.append({"role": "assistant", "content": msg.get("content", ""), "tool_calls": tool_calls})
                for call in tool_calls:
                    fn_name = call["function"]["name"]
                    args = call["function"].get("arguments", {})
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except ValueError:
                            args = {}
                    result = self._run_tool(fn_name, args)
                    self._ollama_msgs.append({"role": "tool", "name": fn_name, "content": json.dumps(result, default=str)})
                continue
            content = msg.get("content", "") or ""
            if not content.strip():
                raise RuntimeError(f"Ollama returned empty response (attempt {attempt + 1})")
            self._ollama_msgs.append({"role": "assistant", "content": content})
            return content
        raise RuntimeError("Ollama tool-call loop exceeded 8 rounds")

    def chat(self, message: str) -> str:
        self._ollama_msgs.append({"role": "user", "content": message})
        # Accumulate turns so multi-turn chats keep context (the Groq/Gemini
        # paths used to reset history every call, losing prior turns).
        self.history.append({"role": "user", "parts": [{"text": message}]})
        self.last_notice = None
        errors = []
        if GROQ_API_KEY:
            try:
                return self._call_groq()
            except Exception as exc:
                errors.append(f"Groq: {exc}")
                print(f"[fallback] Groq failed: {exc}")
        else:
            self.last_notice = f"No GROQ_API_KEY configured — continuing with fallback providers."
        if self._gemini_client is not None:
            try:
                text = self._call_gemini()
                if self.last_notice is None:
                    self.last_notice = "Groq unavailable — this response was generated by Gemini."
                return text
            except Exception as exc:
                errors.append(f"Gemini: {exc}")
                print(f"[fallback] Gemini failed: {exc}")
        try:
            text = self._call_ollama()
            reason = " and ".join(err.split(":")[0] for err in errors) or "Primary providers"
            self.last_notice = f"{reason} unavailable — used local Ollama model {OLLAMA_MODEL} for this response."
            return text
        except Exception as exc:
            errors.append(f"Ollama: {exc}")
            raise RuntimeError(f"All providers failed: {'; '.join(errors)}")
