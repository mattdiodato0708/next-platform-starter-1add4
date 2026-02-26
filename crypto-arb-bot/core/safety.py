"""
core/safety.py — Global safety checks for the crypto-arb bot.
"""

from core.logger import log, log_error
from core import exchange


class GlobalStopTriggered(Exception):
    """Raised when the global equity drawdown threshold is breached."""


def enforce_global_safety(cfg: dict) -> None:
    """Check equity drawdown and halt all strategies if the threshold is hit.

    Raises:
        GlobalStopTriggered: when the account equity has fallen more than
            ``SAFETY.GLOBAL_STOP_EQUITY_DROP_PCT`` below the session start.
    """
    equity_start = exchange.get_session_start_equity_usd()
    if equity_start == 0:
        log_error("Session start equity is 0 — cannot compute drawdown")
        return

    equity_now = exchange.get_total_equity_usd()
    drop_pct = (equity_start - equity_now) / equity_start

    threshold = cfg["SAFETY"]["GLOBAL_STOP_EQUITY_DROP_PCT"]
    if drop_pct >= threshold:
        log(
            f"GLOBAL STOP triggered: equity dropped {drop_pct:.2%} "
            f"(threshold {threshold:.2%})",
            level="error",
        )
        exchange.close_all_positions()
        exchange.disable_all_strategies()
        raise GlobalStopTriggered(
            f"Equity drawdown {drop_pct:.2%} exceeded limit {threshold:.2%}"
        )

    log(
        f"Safety OK — equity ${equity_now:,.2f} "
        f"(start ${equity_start:,.2f}, drop {drop_pct:.2%})",
        level="debug",
    )
