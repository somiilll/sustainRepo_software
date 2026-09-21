"""OCR LLM gateway with native Anthropic Fast-mode transport."""
from __future__ import annotations

import os
import uuid
from typing import Iterable

from anthropic import AsyncAnthropic
from emergentintegrations.llm.chat import LlmChat, UserMessage

from .config import ExtractionMode


class OcrLlmGateway:
    def __init__(self, mode: ExtractionMode):
        self.mode = mode
        self.api_key = os.environ[mode.api_key_env]
        self.anthropic_client = (
            AsyncAnthropic(api_key=self.api_key)
            if mode.provider == "anthropic"
            else None
        )

    async def _send_anthropic(
        self,
        *,
        model: str,
        system_message: str,
        prompt: str,
        images: list[str],
        max_tokens: int,
    ) -> str:
        if self.anthropic_client is None:
            raise RuntimeError("Anthropic OCR client is not initialized.")

        content: str | list[dict]
        if images:
            content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image,
                    },
                }
                for image in images
            ]
            content.append({"type": "text", "text": prompt})
        else:
            content = prompt

        request = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        if system_message:
            request["system"] = system_message

        response = await self.anthropic_client.messages.create(**request)
        response_text = "".join(
            block.text
            for block in response.content
            if getattr(block, "type", "") == "text" and hasattr(block, "text")
        ).strip()
        if not response_text:
            raise RuntimeError("Anthropic returned an empty OCR response.")
        return response_text

    async def _send(
        self,
        *,
        model: str,
        system_message: str,
        prompt: str,
        images: Iterable[str] | None = None,
        max_tokens: int | None = 8192,
    ) -> str:
        image_values = list(images or [])
        if self.mode.provider == "anthropic":
            return await self._send_anthropic(
                model=model,
                system_message=system_message,
                prompt=prompt,
                images=image_values,
                max_tokens=max_tokens or 8192,
            )

        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"ocr-{uuid.uuid4()}",
            system_message=system_message,
        ).with_model(self.mode.provider, model)
        if max_tokens is not None:
            chat.with_params(max_completion_tokens=max_tokens)
        if not image_values:
            return await chat.send_message(UserMessage(text=prompt))

        messages = await chat.get_messages()
        content = [{"type": "text", "text": prompt}]
        content.extend({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image}", "detail": "high"},
        } for image in image_values)
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
