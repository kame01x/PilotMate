"""Shared Gemini chat helper: system prompt, tool declarations, function-calling loop.
Reused by PreflightAgent and TechnicalAgent so the client/tool-call logic lives once."""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import GEMINI_API_KEY, GEMINI_MODEL

DEFAULT_MODEL = GEMINI_MODEL


class GeminiChat:
    def __init__(self, system_prompt: str, tool_declarations: list | None = None,
                 tool_implementations: dict | None = None, model: str = DEFAULT_MODEL):
        self.system_prompt = system_prompt
        self.tool_declarations = tool_declarations or []
        self.tool_implementations = tool_implementations or {}
        self.model = model
        self.history: list[dict] = []
        self._client = None
        if GEMINI_API_KEY:
            from google import genai
            from google.genai import types

            self._client = genai.Client(api_key=GEMINI_API_KEY)
            self._types = types

    def _generate(self, config, attempts: int = 4):
        for i in range(attempts):
            try:
                return self._client.models.generate_content(model=self.model, contents=self.history, config=config)
            except Exception as exc:
                if i == attempts - 1 or "503" not in str(exc) and "UNAVAILABLE" not in str(exc):
                    raise
                time.sleep(5 * (i + 1))

    def chat(self, message: str) -> str:
        if self._client is None:
            return "GEMINI_API_KEY not configured in .env — agent chat unavailable."
        types = self._types
        self.history.append({"role": "user", "parts": [{"text": message}]})
        tools = [types.Tool(function_declarations=self.tool_declarations)] if self.tool_declarations else None
        config = types.GenerateContentConfig(system_instruction=self.system_prompt, tools=tools)
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
        return text
