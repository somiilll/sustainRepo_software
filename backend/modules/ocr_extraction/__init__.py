import sys
from pathlib import Path

_ENGINE = str(Path(__file__).resolve().parent / "engine")
if _ENGINE not in sys.path:
    sys.path.insert(0, _ENGINE)
