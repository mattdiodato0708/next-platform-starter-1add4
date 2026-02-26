"""
main.py — Crypto Arbitrage Bot entry point.

Starts strategy threads and runs the main safety/loop-control logic.
Handles SIGINT/SIGTERM for graceful shutdown.
"""

import signal
import sys
import threading
import time

from config import load_config
from core import exchange
from core.logger import log, log_error, set_log_level
from core.safety import GlobalStopTriggered, enforce_global_safety
from strategies import funding_arb, ambassador_arb

# ─── Global stop event ────────────────────────────────────────────────────────

_stop_event = threading.Event()


def _shutdown(signum, frame):  # noqa: ANN001
    log(f"Received signal {signum} — initiating graceful shutdown...")
    _stop_event.set()


signal.signal(signal.SIGINT, _shutdown)
signal.signal(signal.SIGTERM, _shutdown)


# ─── Startup banner ───────────────────────────────────────────────────────────

def _print_banner(cfg: dict) -> None:
    total = exchange.get_total_equity_usd()
    toggles = cfg["TOGGLES"]
    split = cfg["CAPITAL_SPLIT"]
    safety = cfg["SAFETY"]

    lines = [
        "=" * 60,
        "  Crypto Arbitrage Bot",
        "=" * 60,
        f"  Capital          : ${total:>12,.2f} USD",
        f"  Funding Arb      : {'ON ' if toggles['FUNDING_ARB_ENABLED'] else 'OFF'}"
        f"  ({split['FUNDING_ARB']*100:.0f}% of capital)",
        f"  Ambassador Arb   : {'ON ' if toggles['AMBASSADOR_ARB_ENABLED'] else 'OFF'}"
        f"  ({split['AMBASSADOR_ARB']*100:.0f}% of capital)",
        f"  Max Leverage     : {safety['MAX_LEVERAGE']}x",
        f"  Global Stop Drop : {safety['GLOBAL_STOP_EQUITY_DROP_PCT']*100:.1f}%",
        f"  Dry Run          : {cfg['GLOBAL']['DRY_RUN']}",
        "=" * 60,
    ]
    print("\n".join(lines))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    cfg = load_config()
    set_log_level(cfg["GLOBAL"]["LOG_LEVEL"])

    _print_banner(cfg)

    # Capture session start equity before any trades are opened.
    start_equity = exchange.get_total_equity_usd()
    exchange.set_session_start_equity(start_equity)
    log(f"Session start equity: ${start_equity:,.2f}")

    threads: list[threading.Thread] = []
    toggles = cfg["TOGGLES"]

    if toggles["FUNDING_ARB_ENABLED"]:
        t_monitor = threading.Thread(
            target=funding_arb.monitor_funding_positions,
            args=(cfg, _stop_event),
            name="funding-monitor",
            daemon=True,
        )
        t_scan = threading.Thread(
            target=funding_arb.scan_funding_opportunities,
            args=(cfg, _stop_event),
            name="funding-scan",
            daemon=True,
        )
        threads.extend([t_monitor, t_scan])

    if toggles["AMBASSADOR_ARB_ENABLED"]:
        t_amb = threading.Thread(
            target=ambassador_arb.scan_ambassador_opportunities,
            args=(cfg, _stop_event),
            name="ambassador-scan",
            daemon=True,
        )
        threads.append(t_amb)

    for t in threads:
        t.start()
        log(f"Started thread: {t.name}")

    log("Bot running — press Ctrl+C to stop")

    try:
        while not _stop_event.is_set():
            time.sleep(1)
    except KeyboardInterrupt:
        _stop_event.set()

    log("Waiting for threads to finish...")
    for t in threads:
        t.join(timeout=15)

    log("Shutdown complete.")


if __name__ == "__main__":
    main()
