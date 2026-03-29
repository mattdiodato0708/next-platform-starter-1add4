"""
main.py — Entry point for the crypto arbitrage bot.

Starts funding-rate and ambassador-arb threads and runs until a shutdown
signal (SIGINT / SIGTERM) is received.
"""

import signal
import sys
import threading
import time

from config import CONFIG
from core.exchange import (
    get_session_start_equity_usd,
    get_total_equity_usd,
    set_session_start_equity,
)
from core.logger import log, log_error, log_warn
from core.safety import GlobalStopTriggered, enforce_global_safety
from strategies.ambassador_arb import scan_ambassador_opportunities
from strategies.funding_arb import monitor_funding_positions, scan_funding_opportunities

# ---------------------------------------------------------------------------
# Watched symbols
# ---------------------------------------------------------------------------

WATCHED_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "ARB/USDT"]

# ---------------------------------------------------------------------------
# Shutdown coordination
# ---------------------------------------------------------------------------

_shutdown_event = threading.Event()


def _handle_signal(signum, frame):  # noqa: ANN001
    log_warn("Signal %d received — initiating clean shutdown…", signum)
    _shutdown_event.set()


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


# ---------------------------------------------------------------------------
# Generic loop runner
# ---------------------------------------------------------------------------


def _run_loop(name: str, interval_sec: float, func, *args) -> None:
    """
    Run *func* in a loop, sleeping *interval_sec* between calls.

    Checks the global safety condition before each invocation.
    Exits cleanly on GlobalStopTriggered or when the shutdown event is set.

    Parameters
    ----------
    name         : Human-readable thread name for logging.
    interval_sec : Seconds to sleep between iterations.
    func         : Callable to invoke each iteration.
    *args        : Positional arguments forwarded to *func*.
    """
    log("Thread '%s' started (interval=%.1fs)", name, interval_sec)
    while not _shutdown_event.is_set():
        try:
            equity_start = get_session_start_equity_usd()
            equity_now = get_total_equity_usd()
            enforce_global_safety(equity_start, equity_now)
            func(*args)
        except GlobalStopTriggered as exc:
            log_error("GlobalStopTriggered in '%s': %s — thread exiting", name, exc)
            _shutdown_event.set()
            return
        except Exception as exc:  # noqa: BLE001
            log_error("Unhandled exception in '%s': %s", name, exc)

        _shutdown_event.wait(timeout=interval_sec)

    log("Thread '%s' exiting", name)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    """Start all strategy threads and block until shutdown."""

    print(
        "\n"
        "╔══════════════════════════════════════════════╗\n"
        "║        Crypto Arbitrage Bot — Starting       ║\n"
        "╚══════════════════════════════════════════════╝\n",
        flush=True,
    )

    # Capture the equity baseline for drawdown tracking
    set_session_start_equity()
    log(
        "Session start equity: $%.2f USD",
        get_session_start_equity_usd(),
    )

    toggles = CONFIG["TOGGLES"]
    fa_cfg = CONFIG["FUNDING_ARB"]
    amb_cfg = CONFIG["AMBASSADOR_ARB"]

    threads: list[threading.Thread] = []

    # ── Funding-rate monitor (always on if strategy enabled) ──────────────
    if toggles.get("ENABLE_FUNDING_ARB", False):
        rebalance_interval_sec = fa_cfg["REBALANCE_INTERVAL_MIN"] * 60
        t_monitor = threading.Thread(
            target=_run_loop,
            args=("FundingMonitor", rebalance_interval_sec, monitor_funding_positions),
            daemon=True,
            name="FundingMonitor",
        )
        threads.append(t_monitor)

        funding_check_interval_sec = fa_cfg["FUNDING_CHECK_INTERVAL_MIN"] * 60
        t_scan = threading.Thread(
            target=_run_loop,
            args=("FundingScan", funding_check_interval_sec, scan_funding_opportunities),
            daemon=True,
            name="FundingScan",
        )
        threads.append(t_scan)
    else:
        log("Funding-rate arbitrage is DISABLED (TOGGLES.ENABLE_FUNDING_ARB=false)")

    # ── Ambassador arb scanner ────────────────────────────────────────────
    if toggles.get("ENABLE_AMBASSADOR_ARB", False):
        amb_interval_sec = amb_cfg["CHECK_INTERVAL_SEC"]
        t_amb = threading.Thread(
            target=_run_loop,
            args=(
                "AmbassadorArb",
                amb_interval_sec,
                scan_ambassador_opportunities,
                WATCHED_SYMBOLS,
            ),
            daemon=True,
            name="AmbassadorArb",
        )
        threads.append(t_amb)
    else:
        log("Ambassador arbitrage is DISABLED (TOGGLES.ENABLE_AMBASSADOR_ARB=false)")

    if not threads:
        log_warn("No strategies are enabled — nothing to do.  Exiting.")
        return

    for t in threads:
        t.start()

    log("All threads started.  Press Ctrl+C to stop.")

    # Block the main thread until shutdown is signalled
    _shutdown_event.wait()

    log("Shutdown signal received — waiting for threads to finish…")
    for t in threads:
        t.join(timeout=10)

    print(
        "\n"
        "╔══════════════════════════════════════════════╗\n"
        "║          Crypto Arbitrage Bot — Stopped      ║\n"
        "╚══════════════════════════════════════════════╝\n",
        flush=True,
    )


if __name__ == "__main__":
    main()
