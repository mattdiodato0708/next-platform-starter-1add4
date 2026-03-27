"""
core/exchange.py — Stub exchange interface.

Replace every TODO stub with real exchange API calls (e.g. via ccxt)
before going live.
"""

from dataclasses import dataclass, field
from typing import List, Optional


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class FundingPosition:
    symbol: str
    exchange: str
    side: str          # 'long' or 'short'
    size_usd: float
    entry_funding_rate: float
    entry_basis: float
    opened_at: str     # ISO-8601 timestamp


@dataclass
class AmbArbTrade:
    symbol: str
    buy_exchange: str
    sell_exchange: str
    size_usd: float
    buy_price: float
    sell_price: float
    opened_at: str     # ISO-8601 timestamp


# ─── In-memory registries (replace with DB/Redis in production) ───────────────

_funding_positions: List[FundingPosition] = []
_amb_arb_trades: List[AmbArbTrade] = []
_session_start_equity: float = 0.0
_strategies_enabled: bool = True


# ─── Equity / session ─────────────────────────────────────────────────────────

def get_total_equity_usd() -> float:
    """Return current total account equity in USD.

    TODO: replace stub with real exchange API call.
    """
    return 10_000.0


def get_session_start_equity_usd() -> float:
    """Return the equity captured at session start.

    TODO: replace stub with persistent storage read.
    """
    return _session_start_equity


def set_session_start_equity(value: float) -> None:
    """Record equity at the start of a trading session.

    TODO: persist to DB/Redis for crash recovery.
    """
    global _session_start_equity
    _session_start_equity = value


# ─── Positions ────────────────────────────────────────────────────────────────

def get_open_funding_positions() -> List[FundingPosition]:
    """Return all open funding arbitrage positions.

    TODO: replace stub with real exchange API call.
    """
    return list(_funding_positions)


def close_funding_position(position: FundingPosition) -> bool:
    """Close a single funding arbitrage position.

    TODO: replace stub with real order submission.
    """
    if position in _funding_positions:
        _funding_positions.remove(position)
    return True


def close_all_positions() -> None:
    """Close every open position immediately.

    TODO: replace stub with real order submission for all positions.
    """
    _funding_positions.clear()
    _amb_arb_trades.clear()


# ─── Strategy enable/disable ──────────────────────────────────────────────────

def disable_all_strategies() -> None:
    """Disable all running strategies.

    TODO: replace stub with real strategy lifecycle management.
    """
    global _strategies_enabled
    _strategies_enabled = False


def strategies_enabled() -> bool:
    """Return True if strategies are currently enabled."""
    return _strategies_enabled


# ─── Market data ──────────────────────────────────────────────────────────────

def get_current_funding_rate(symbol: str, exchange_name: str) -> float:
    """Fetch the current funding rate for a perp contract.

    TODO: replace stub with real exchange API call.
    """
    return 0.01  # 1% stub


def get_spot_price(symbol: str, exchange_name: str) -> float:
    """Fetch current spot price for a symbol.

    TODO: replace stub with real exchange API call.
    """
    return 100.0


def get_perp_price(symbol: str, exchange_name: str) -> float:
    """Fetch current perpetual contract price for a symbol.

    TODO: replace stub with real exchange API call.
    """
    return 100.05


def get_combined_pnl(position: FundingPosition) -> float:
    """Calculate combined realised + unrealised PnL for a position.

    TODO: replace stub with real PnL calculation from exchange.
    """
    return 0.0


def get_best_bid(symbol: str, exchange_name: str) -> float:
    """Fetch the best (highest) bid price on an exchange.

    TODO: replace stub with real orderbook fetch.
    """
    return 99.95


def get_best_ask(symbol: str, exchange_name: str) -> float:
    """Fetch the best (lowest) ask price on an exchange.

    TODO: replace stub with real orderbook fetch.
    """
    return 100.05


# ─── Order placement ──────────────────────────────────────────────────────────

def place_limit_order(
    symbol: str,
    exchange_name: str,
    side: str,
    size_usd: float,
    price: float,
) -> Optional[str]:
    """Place a limit order and return the order ID, or None on failure.

    TODO: replace stub with real order submission.
    """
    return f"stub-limit-{symbol}-{side}"


def place_market_order(
    symbol: str,
    exchange_name: str,
    side: str,
    size_usd: float,
) -> Optional[str]:
    """Place a market order and return the order ID, or None on failure.

    TODO: replace stub with real order submission.
    """
    return f"stub-market-{symbol}-{side}"


# ─── Ambassador arb registry ──────────────────────────────────────────────────

def register_amb_arb_trade(trade: AmbArbTrade) -> None:
    """Record an ambassador arb trade in the registry.

    TODO: replace stub with real DB/Redis write.
    """
    _amb_arb_trades.append(trade)


def get_open_amb_arb_routes() -> List[AmbArbTrade]:
    """Return all open ambassador arb trades.

    TODO: replace stub with real DB/Redis read.
    """
    return list(_amb_arb_trades)
