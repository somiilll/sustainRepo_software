"""Provider-neutral LLM gateway backed by Emergent integrations."""
from __future__ import annotations

import os
import uuid
from typing import Iterable

from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

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
        max_tokens: int = 8192,
    ) -> str:
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"ocr-{uuid.uuid4()}",
            system_message=system_message,
        ).with_model(self.mode.provider, model)
        token_param = "max_completion_tokens" if self.mode.provider == "openai" else "max_tokens"
        chat.with_params(**{token_param: max_tokens})
        files = [ImageContent(image_base64=image) for image in (images or [])]
        return await chat.send_message(UserMessage(text=prompt, file_contents=files))

    async def extract_document(self, system_message: str, prompt: str, images: list[str]) -> str:
        return await self._send(
            model=self.mode.vision_model,
            system_message=system_message,
            prompt=prompt,
            images=images,
            max_tokens=8192,
        )

    async def reason(self, system_message: str, prompt: str, max_tokens: int = 1800) -> str:
        return await self._send(
            model=self.mode.reasoning_model,
            system_message=system_message,
            prompt=prompt,
            max_tokens=max_tokens,
        )
