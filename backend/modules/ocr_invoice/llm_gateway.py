"""Provider-neutral LLM gateway backed by Emergent integrations."""
from __future__ import annotations

import os
import uuid
from typing import Iterable

from emergentintegrations.llm.chat import LlmChat, UserMessage

from .config import ExtractionMode


class OcrLlmGateway:
    def __init__(self, mode: ExtractionMode):
        self.mode = mode
        self.api_key = os.environ[mode.api_key_env]

    async def _send(
        self,
        *,
        model: str,
        system_message: str,
        prompt: str,
        images: Iterable[str] | None = None,
        max_tokens: int | None = 8192,
    ) -> str:
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"ocr-{uuid.uuid4()}",
            system_message=system_message,
        ).with_model(self.mode.provider, model)
        if max_tokens is not None:
            token_param = "max_completion_tokens" if self.mode.provider == "openai" else "max_tokens"
            chat.with_params(**{token_param: max_tokens})
        image_values = list(images or [])
        if not image_values:
            return await chat.send_message(UserMessage(text=prompt))

        messages = await chat.get_messages()
        if self.mode.provider == "openai":
            content = [{"type": "text", "text": prompt}]
            content.extend({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image}", "detail": "high"},
            } for image in image_values)
        else:
            content = [{
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image}"},
            } for image in image_values]
            content.append({"type": "text", "text": prompt})
        messages.append({"role": "user", "content": content})
        response = await chat._execute_completion(messages)
        return await chat._extract_response_text(response)

    async def extract_document(self, system_message: str, prompt: str, images: list[str]) -> str:
        return await self._send(
            model=self.mode.vision_model,
            system_message=system_message,
            prompt=prompt,
            images=images,
            max_tokens=None if self.mode.provider == "openai" else 8192,
        )

    async def reason(self, system_message: str, prompt: str, max_tokens: int = 1800) -> str:
        return await self._send(
            model=self.mode.reasoning_model,
            system_message=system_message,
            prompt=prompt,
            max_tokens=max_tokens,
        )
