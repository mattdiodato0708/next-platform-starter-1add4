"""
core/logger.py — Centralized logging with timestamp and level support.

Levels: debug, info, warn, error
Debug messages are suppressed unless LOG_LEVEL is set to "debug".
"""

import sys
from datetime import datetime, timezone

from config import CONFIG

_LOG_LEVEL: str = CONFIG["GLOBAL"].get("LOG_LEVEL", "info").lower()


def _now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _emit(level: str, msg: str, *args: object) -> None:
    """Format and write a log line to stdout."""
    # Interpolate positional args if provided (fixes silent-drop bug)
    if args:
        try:
            msg = msg % args
        except (TypeError, ValueError):
            # Fall back to space-joining so nothing is ever silently dropped
            extra = " ".join(str(a) for a in args)
            msg = f"{msg} {extra}"
    print(f"[{_now()}] [{level.upper():5s}] {msg}", flush=True)


def log(msg: str, *args: object) -> None:
    """Log at INFO level. Always emitted (unless level would suppress, but INFO is baseline)."""
    _emit("info", msg, *args)


def log_debug(msg: str, *args: object) -> None:
    """Log at DEBUG level. Suppressed unless LOG_LEVEL == 'debug'."""
    if _LOG_LEVEL == "debug":
        _emit("debug", msg, *args)


def log_warn(msg: str, *args: object) -> None:
    """Log at WARN level."""
    _emit("warn", msg, *args)


def log_error(msg: str, *args: object) -> None:
    """Log at ERROR level."""
    if args:
        try:
            formatted = msg % args
        except (TypeError, ValueError):
            extra = " ".join(str(a) for a in args)
            formatted = f"{msg} {extra}"
    else:
        formatted = msg
    print(f"[{_now()}] [ERROR] {formatted}", file=sys.stderr, flush=True)
