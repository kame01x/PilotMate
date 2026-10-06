"""Shared Gemini chat helper: system prompt, tool declarations, function-calling loop.
Reused by PreflightAgent and TechnicalAgent so the client/tool-call logic lives once.

FALLBACK NOTE (quality): when Gemini is unavailable (429 quota / persistent 503),
the same request is retried against a LOCAL Ollama model. Local models are
meaningfully weaker than Gemini for aviation reasoning and instruction following.
This fallback exists so development/testing is not blocked by a quota wall — it is
NOT a quality-equal swap and should not be trusted as one in production."""

import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import GEMINI_API_KEY, GEMINI_MODEL, OLLAMA_HOST, OLLAMA_MODEL

DEFAULT_MODEL = GEMINI_MODEL


class GeminiChat:
    def __init__(self, system_prompt: str, tool_declarations: list | None = None,
                 tool_implementations: dict | None = None, model: str = DEFAULT_MODEL):
        self.system_prompt = system_prompt
        self.tool_declarations = tool_declarations or []
        self.tool_implementations = tool_implementations or {}
        self.model = model
        self.history: list[dict] = []
        self._ollama_msgs: list[dict] = []
        self._client = None
        if GEMINI_API_KEY:
            from google import genai
            from google.genai import types

            self._client = genai.Client(api_key=GEMINI_API_KEY)
            self._types = types

    def _generate(self, config, attempts: int = 5):
        for i in range(attempts):
            try:
                return self._client.models.generate_content(model=self.model, contents=self.history, config=config)
            except Exception as exc:
                msg = str(exc)
                transient = ("503" in msg or "UNAVAILABLE" in msg)
                rate_limited = "429" in msg or "RESOURCE_EXHAUSTED" in msg
                # 429: retry twice quickly (30s), then fall back to Ollama (quota wall).
                # 503: persist longer (overloads clear in seconds-to-a-minute).
                max_attempts = 2 if rate_limited else attempts
                if i >= max_attempts - 1 or not (transient or rate_limited):
                    raise
                time.sleep(15 if rate_limited else 5 * (i + 1))

    def chat(self, message: str) -> str:
        self._ollama_msgs.append({"role": "user", "content": message})
        if self._client is None:
            print(f"[fallback] GEMINI_API_KEY not configured — using local Ollama model {OLLAMA_MODEL}")
            return self._chat_ollama()
        types = self._types
        self.history.append({"role": "user", "parts": [{"text": message}]})
        tools = [types.Tool(function_declarations=self.tool_declarations)] if self.tool_declarations else None
        config = types.GenerateContentConfig(system_instruction=self.system_prompt, tools=tools)
        try:
            response = self._generate(config)
            while response.function_calls:
                parts = []
                for call in response.function_calls:
                    fn = self.tool_implementations[call.name]
                    result = fn(**(call.args or {}))
                    parts.append(types.Part.from_function_response(name=call.name, response={"result": json.dumps(result, default=str)}))
                self.history.append(response.candidates[0].content)
                self.history.append({"role": "user", "parts": parts})
                response = self._generate(config)
            text = response.text or ""
            self.history.append({"role": "model", "parts": [{"text": text}]})
            self._ollama_msgs.append({"role": "assistant", "content": text})
            return text
        except Exception as exc:
            reason = self._fallback_reason(exc)
            if reason is None:
                raise
            print(f"[fallback] Gemini {reason} — using local Ollama model {OLLAMA_MODEL} for this response")
            return self._chat_ollama()

    def _fallback_reason(self, exc: Exception) -> str | None:
        msg = str(exc)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            return "quota exhausted/rate-limited (429)"
        if "503" in msg or "UNAVAILABLE" in msg:
            return "overloaded (503 after retries)"
        return None

    def _ollama_tools(self) -> list[dict]:
        tools = []
        for decl in self.tool_declarations:
            params = getattr(decl, "parameters", None)
            try:
                schema = params.model_dump() if hasattr(params, "model_dump") else (params or {})
            except Exception:
                schema = {}
            tools.append({
                "type": "function",
                "function": {"name": decl.name, "description": getattr(decl, "description", ""), "parameters": schema},
            })
        return tools

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

    def _chat_ollama(self) -> str:
        if not self._ollama_msgs or self._ollama_msgs[0]["role"] != "system":
            self._ollama_msgs.insert(0, {"role": "system", "content": self.system_prompt})
        for _ in range(8):
            try:
                resp = httpx.post(
                    f"{OLLAMA_HOST}/api/chat",
                    json={
                        "model": OLLAMA_MODEL,
                        "messages": self._ollama_msgs,
                        "tools": self._ollama_tools() or None,
                        "stream": False,
                    },
                    timeout=300,
                )
                resp.raise_for_status()
            except httpx.ConnectError:
                raise RuntimeError(
                    f"Ollama is not reachable at {OLLAMA_HOST}. Start it (e.g. `ollama serve`) and retry — the local fallback needs it running."
                )
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
                    impl = self.tool_implementations.get(fn_name)
                    result = impl(**args) if impl else {"error": f"unknown tool {fn_name}"}
                    self._ollama_msgs.append({"role": "tool", "name": fn_name, "content": json.dumps(result, default=str)})
                continue
            content = msg.get("content", "") or ""
            self._ollama_msgs.append({"role": "assistant", "content": content})
            return content
        raise RuntimeError("Ollama tool-call loop exceeded 8 rounds")
