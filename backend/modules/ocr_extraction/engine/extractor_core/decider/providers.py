"""Classifier providers: TypeSafe Jev (direct TypeSafe API key, or an OpenRouter key), OpenAI Decisions API, Claude (last resort)."""
from __future__ import annotations

import os
import time

import requests

from .. import llm
from ..config import load
from .base import Answer, Provider, ProviderError, Question


class JevOpenRouter(Provider):
    """Same request shape the prototype uses in jev_processor.call_jev_decisions."""
    name = "jev"

    @staticmethod
    def _key() -> str:
        return os.environ.get("TYPESAFE_API_KEY") or os.environ.get("OPENROUTER_API_KEY") or ""

    def available(self) -> bool:
        return bool(self._key())

    def decide(self, state, questions):
        cfg = load().policy["jev"]
        key = self._key()
        via_openrouter = key.startswith("sk-or-")
        url, model = (cfg["openrouter_url"], cfg["model"]) if via_openrouter else (cfg["url"], cfg["api_model"])
        payload = {"model": model, "state": state,
                   "questions": {q.name: {"type": "choice", "instructions": q.instructions, "criteria": q.choices} for q in questions}}
        t0 = time.time()
        try:
            r = requests.post(url, json=payload, timeout=cfg["timeout_s"],
                              headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "X-Title": "SustainRepo extractor"})
        except requests.RequestException as e:
            raise ProviderError(f"Jev network error: {e}") from e
        if r.status_code != 200:
            raise ProviderError(f"Jev HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        raw = data.get("answers") or {}
        if isinstance(raw, list):
            raw = {a.get("name"): a for a in raw}
        out = {}
        for q in questions:
            a = raw.get(q.name) or {}
            ch = a.get("choice")
            if ch not in q.choices:
                raise ProviderError(f"Jev gave no valid answer for {q.name}")
            probs = a.get("probabilities") or {}
            if isinstance(probs, list):
                probs = {p.get("value"): p.get("probability") for p in probs}
            out[q.name] = Answer(ch, float(a.get("confidence", probs.get(ch, 0.5)) or 0.0), probs)
        return out, {"provider": self.name, "model": cfg["model"], "seconds": round(time.time() - t0, 3),
                     "cost_usd": float((data.get("usage") or {}).get("cost", 0.0) or 0.0)}


class OpenAIDecisions(Provider):
    name = "openai_decisions"

    def available(self) -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def decide(self, state, questions):
        cfg = load().policy["openai_decisions"]
        payload = {"model": cfg["model"], "input": state,
                   "questions": [{"type": "choice", "name": q.name, "instructions": q.instructions,
                                  "choices": [{"value": v, "description": d} for v, d in q.choices.items()]} for q in questions]}
        t0 = time.time()
        for attempt in range(3):
            try:
                r = requests.post(cfg["url"], json=payload, timeout=cfg["timeout_s"],
                                  headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"})
            except requests.RequestException as e:
                raise ProviderError(f"OpenAI Decisions network error: {e}") from e
            if r.status_code != 429 or "insufficient_quota" in r.text or attempt == 2:      # only a plain rate limit is worth waiting for
                break
            time.sleep(min(float(r.headers.get("retry-after") or 2 ** attempt), 10))
        if r.status_code != 200:
            raise ProviderError(f"OpenAI Decisions HTTP {r.status_code}: {r.text[:200]}")
        ans = {a["name"]: a for a in r.json().get("answers", [])}
        out = {}
        for q in questions:
            a = ans.get(q.name)
            if not a or a.get("choice") not in q.choices:
                raise ProviderError(f"OpenAI Decisions gave no valid answer for {q.name}")
            probs = {p["value"]: p["probability"] for p in a.get("probabilities", [])}
            out[q.name] = Answer(a["choice"], float(a.get("confidence", probs.get(a["choice"], 0.5))), probs)
        return out, {"provider": self.name, "model": cfg["model"], "seconds": round(time.time() - t0, 3)}


class ClaudeChooser(Provider):
    name = "claude"
    calibrated = False

    def available(self) -> bool:
        return llm.enabled()

    def decide(self, state, questions):
        props = {q.name: llm.obj({"choice": {"type": "string", "enum": list(q.choices)},
                                  "level": {"type": "string", "enum": ["certain", "likely", "uncertain", "guess"]},
                                  "tags": {"type": "array", "items": {"type": "string", "enum": FACTOR_TAGS}}}) for q in questions}
        system = ("You identify which existing emission factor best matches one line item from a company's invoices or registers. Use the company and "
                  "facility context. Answer every question with exactly one allowed value, a level (certain = the wording names it outright, likely = strong "
                  "evidence, uncertain = plausible but another option could fit, guess) and short evidence tags. Never give a number.")
        text = state + "\n\nQuestions:\n" + "\n".join(
            f"- {q.name}: {q.instructions}\n" + "\n".join(f"    {v}: {d}" for v, d in q.choices.items()) for q in questions)
        t0 = time.time()
        try:
            d, usage = llm.call_provider("claude", load().policy["models"]["classify_fallback"], system, text, llm.obj(props), max_tokens=1500, task="classify_fallback")
        except llm.AIUnavailable as e:
            raise ProviderError(str(e)) from e
        out = {q.name: Answer(d[q.name]["choice"], None, {}, d[q.name]["level"], d[q.name].get("tags") or []) for q in questions}
        return out, {"provider": self.name, "seconds": round(time.time() - t0, 3), **usage}


FACTOR_TAGS = ["exact_name", "product_inferred", "material_inferred", "brand_unknown", "org_context_used", "ambiguous_between_options",
               "needs_disposal_route", "no_good_option", "spend_proxy"]
PROVIDERS = {"jev": JevOpenRouter, "openai_decisions": OpenAIDecisions, "claude": ClaudeChooser}
