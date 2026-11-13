"""Loads the mapping files (taxonomy, formulas, policy, units, HSN rules) and API keys.

Everything the engine decides comes from ../../mappings, so Emergent can change behaviour by editing JSON.
"""
from __future__ import annotations

import csv
import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # extraction-handoff/
MAPPINGS = Path(os.environ["EXTRACTOR_MAPPINGS_DIR"]) if os.environ.get("EXTRACTOR_MAPPINGS_DIR") else ROOT / "mappings"
PROMPTS = ROOT / "prompts"


def _json(name: str) -> dict:
    return json.loads((MAPPINGS / name).read_text(encoding="utf-8"))


def load_env() -> None:
    """Read KEY=VALUE lines from EXTRACTOR_ENV_FILE (or testbench/.env) into os.environ without overriding."""
    candidates = [os.environ.get("EXTRACTOR_ENV_FILE"), str(ROOT / "testbench" / ".env")]
    for c in candidates:
        if c and Path(c).is_file():
            for line in Path(c).read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            return


def keys() -> dict[str, bool]:
    return {"anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "openrouter": bool(os.environ.get("OPENROUTER_API_KEY")),
            "openai": bool(os.environ.get("OPENAI_API_KEY"))}


@dataclass
class Taxonomy:
    raw: dict
    activities: dict[str, dict] = field(default_factory=dict)
    by_domain: dict[str, list[dict]] = field(default_factory=dict)

    def __post_init__(self):
        for a in self.raw["activities"]:
            self.activities[a["id"]] = a
            self.by_domain.setdefault(a["domain"], []).append(a)

    @property
    def domains(self) -> dict[str, str]:
        return self.raw["domains"]

    def get(self, activity_id: str) -> dict:
        return self.activities[activity_id]

    def context_key(self, activity_id: str) -> str | None:
        g = self.activities[activity_id]["ghg"]
        return g.get("by_context")

    def resolve_ghg(self, activity_id: str, context: dict | None = None) -> dict:
        """scope/category/subcategory (+labels, ids) for an activity, applying its context answer if any."""
        g = self.activities[activity_id]["ghg"]
        if "by_context" in g:
            ctx_val = (context or {}).get(g["by_context"]) or g["default"]
            g = g["options"].get(ctx_val) or g["options"][g["default"]]
        out = dict(g)
        out["scope_label"] = self.raw["scope_labels"].get(g["scope"], g["scope"])
        out["category_label"] = self.raw["category_labels"].get(g["category"], g["category"])
        out["subcategory_label"] = g["subcategory"]
        out.setdefault("category_id", None)      # filled from Emergent's export later
        out.setdefault("subcategory_id", None)
        return out


@dataclass
class Config:
    taxonomy: Taxonomy
    formulas: dict
    policy: dict
    units: dict
    hsn_rules: list[dict]
    parsing: dict
    factor_names: dict = field(default_factory=dict)

    def factor_name_list(self, subcategory: str | None, ef_method: str | None) -> list[str]:
        """Real emission-factor names (this system's tables) for a taxonomy subcategory and method, best first."""
        return (self.factor_names.get(subcategory or "") or {}).get("spend" if ef_method == "spend" else "activity", [])


@lru_cache(maxsize=1)
def load() -> Config:
    load_env()
    with open(MAPPINGS / "hsn_sac_rules.csv", encoding="utf-8") as f:
        hsn = [{**r, "confidence": float(r["confidence"])} for r in csv.DictReader(f)]
    hsn.sort(key=lambda r: -len(r["code_prefix"]))      # most specific code first
    return Config(taxonomy=Taxonomy(_json("activity_taxonomy.json")),
                  formulas=_json("formula_fields.json")["formulas"],
                  policy=_json("policy.json"), units=_json("unit_aliases.json"), hsn_rules=hsn,
                  parsing=_json("parsing.json"), factor_names=_json("factor_names.json")["map"])
