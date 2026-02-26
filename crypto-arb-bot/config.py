"""
config.py — Loads and validates config.json, exports a singleton CONFIG dict.
"""

import json
import os

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

_REQUIRED_SECTIONS = [
    "GLOBAL",
    "CAPITAL_SPLIT",
    "SAFETY",
    "TOGGLES",
    "FUNDING_ARB",
    "AMBASSADOR_ARB",
    "EXCHANGE_FEE_PROFILE",
]


def _load_and_validate() -> dict:
    with open(_CONFIG_PATH, "r") as fh:
        cfg = json.load(fh)

    # Check all required top-level sections are present
    for section in _REQUIRED_SECTIONS:
        if section not in cfg:
            raise ValueError(f"config.json is missing required section: '{section}'")

    # CAPITAL_SPLIT must sum to 1.0 (allow small floating-point tolerance)
    capital_split = cfg["CAPITAL_SPLIT"]
    total_split = capital_split.get("FUNDING_ARB_PCT", 0) + capital_split.get(
        "AMBASSADOR_ARB_PCT", 0
    )
    if abs(total_split - 1.0) > 1e-9:
        raise ValueError(
            f"CAPITAL_SPLIT percentages must sum to 1.0, got {total_split}"
        )

    # MAX_LEVERAGE must be >= 1
    max_leverage = cfg["SAFETY"].get("MAX_LEVERAGE", 0)
    if max_leverage < 1:
        raise ValueError(
            f"SAFETY.MAX_LEVERAGE must be >= 1, got {max_leverage}"
        )

    # GLOBAL_STOP_EQUITY_DROP_PCT must be between 0 and 1 (exclusive)
    stop_pct = cfg["SAFETY"].get("GLOBAL_STOP_EQUITY_DROP_PCT", -1)
    if not (0 < stop_pct < 1):
        raise ValueError(
            f"SAFETY.GLOBAL_STOP_EQUITY_DROP_PCT must be between 0 and 1, got {stop_pct}"
        )

    return cfg


CONFIG: dict = _load_and_validate()
