"""
config.py — Load and validate config.json.
"""

import json
import os

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

REQUIRED_SECTIONS = [
    "GLOBAL",
    "CAPITAL_SPLIT",
    "SAFETY",
    "TOGGLES",
    "FUNDING_ARB",
    "AMBASSADOR_ARB",
    "EXCHANGE_FEE_PROFILE",
]


def load_config(path: str = _CONFIG_PATH) -> dict:
    """Load config.json and return validated config dict."""
    with open(path, "r") as fh:
        cfg = json.load(fh)

    _validate(cfg)
    return cfg


def _validate(cfg: dict) -> None:
    """Raise ValueError for any missing or invalid config values."""
    for section in REQUIRED_SECTIONS:
        if section not in cfg:
            raise ValueError(f"config.json is missing required section: {section}")

    split = cfg["CAPITAL_SPLIT"]
    total = sum(split.values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(
            f"CAPITAL_SPLIT percentages must sum to 1.0 (got {total:.6f})"
        )

    max_lev = cfg["SAFETY"].get("MAX_LEVERAGE")
    if max_lev is None or max_lev < 1:
        raise ValueError(
            f"SAFETY.MAX_LEVERAGE must be >= 1 (got {max_lev!r})"
        )

    stop_pct = cfg["SAFETY"].get("GLOBAL_STOP_EQUITY_DROP_PCT")
    if stop_pct is None or not (0 < stop_pct < 1):
        raise ValueError(
            f"SAFETY.GLOBAL_STOP_EQUITY_DROP_PCT must be between 0 and 1 (got {stop_pct!r})"
        )
