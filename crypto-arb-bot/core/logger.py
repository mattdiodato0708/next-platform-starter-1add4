"""
core/logger.py — Timestamped structured logger.

The log() function always includes *args in output regardless of level,
and supports an optional keyword-only `level` parameter.
"""

import datetime

# Module-level log level, updated when the bot loads config.
_LOG_LEVEL: str = "info"


def set_log_level(level: str) -> None:
    """Set the active log level ('info' or 'debug')."""
    global _LOG_LEVEL
    _LOG_LEVEL = level.lower()


def log(message: str, *args, level: str = "info") -> None:
    """Print a timestamped log line.

    Debug messages are suppressed unless _LOG_LEVEL is 'debug'.
    All *args are always appended to the output when the message is printed.
    """
    if level == "debug" and _LOG_LEVEL != "debug":
        return
    ts = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    tag = level.upper()
    extra = " ".join(str(a) for a in args) if args else ""
    print(f"[{tag}] {ts} | {message} {extra}".rstrip())


def log_error(message: str, *args) -> None:
    """Convenience wrapper for error-level messages."""
    log(message, *args, level="error")
