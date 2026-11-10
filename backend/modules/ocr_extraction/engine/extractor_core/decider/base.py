"""The Decider interface. Every classifier provider answers the same choice questions in the same shape, so
Jev, OpenAI Decisions and Claude are interchangeable (and a new one is one small class)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Question:
    name: str
    instructions: str
    choices: dict[str, str]          # value -> description


@dataclass
class Answer:
    choice: str
    confidence: float
    probabilities: dict[str, float] = field(default_factory=dict)


class ProviderError(Exception):
    pass


class Provider:
    name = "base"
    calibrated = True                # self-reported confidences from chat models are not; they get capped

    def available(self) -> bool:
        raise NotImplementedError

    def decide(self, state: str, questions: list[Question]) -> tuple[dict[str, Answer], dict]:
        """Returns ({question name: Answer}, usage). Raises ProviderError on any failure."""
        raise NotImplementedError
