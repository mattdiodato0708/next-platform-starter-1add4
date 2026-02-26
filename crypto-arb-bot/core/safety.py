"""
core/safety.py — Global safety / circuit-breaker logic.
"""

from config import CONFIG
from core.exchange import close_all_positions, disable_all_strategies
from core.logger import log, log_warn, log_error


class GlobalStopTriggered(Exception):
    """Raised when the global equity stop-loss fires and trading is halted."""


def enforce_global_safety(equity_start: float, equity_now: float) -> None:
    """
    Check whether the global stop condition has been breached.

    Parameters
    ----------
    equity_start : float
        Portfolio equity at the start of the trading session (USD).
    equity_now : float
        Current portfolio equity (USD).

    Raises
    ------
    GlobalStopTriggered
        If ENABLE_GLOBAL_STOP is true and the equity drawdown exceeds
        GLOBAL_STOP_EQUITY_DROP_PCT.
    """
    safety_cfg = CONFIG["SAFETY"]

    # Honour the kill-switch toggle
    if not safety_cfg.get("ENABLE_GLOBAL_STOP", True):
        return

    # Guard against division-by-zero
    if equity_start == 0:
        log_warn("enforce_global_safety: equity_start is 0, skipping drawdown check")
        return

    drop_pct = (equity_start - equity_now) / equity_start
    threshold = safety_cfg["GLOBAL_STOP_EQUITY_DROP_PCT"]

    if drop_pct >= threshold:
        log_error(
            "GLOBAL STOP triggered: drawdown %.4f%% exceeds threshold %.4f%%",
            drop_pct * 100,
            threshold * 100,
        )
        close_all_positions()
        disable_all_strategies()
        raise GlobalStopTriggered(
            f"Equity dropped {drop_pct * 100:.2f}% (threshold {threshold * 100:.2f}%)"
        )

    log(
        "Safety check OK: drawdown %.4f%% < threshold %.4f%%",
        drop_pct * 100,
        threshold * 100,
    )
