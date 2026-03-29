"""
core/exchange.py — Stub exchange interface.

All functions contain TODO comments indicating where real exchange API calls
should be inserted.  The module uses in-memory registries so the rest of the
codebase can be exercised end-to-end without live credentials.
"""

import uuid
from dataclasses import dataclass, field
from typing import List, Optional

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class FundingPosition:
    """Represents a delta-neutral funding-rate arbitrage position."""

    symbol: str
    side: str  # "long_spot_short_perp" or "short_spot_long_perp"
    notional_usd: float
    entry_funding_rate: float
    spot_entry_price: float
    perp_entry_price: float
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class AmbArbTrade:
    """Represents a cross-exchange ambassador arbitrage trade."""

    symbol: str
    exchange_buy: str
    exchange_sell: str
    qty: float
    buy_price: float
    sell_price: float
    edge_pct: float
    order_id_buy: str
    order_id_sell: str


# ---------------------------------------------------------------------------
# In-memory registries
# ---------------------------------------------------------------------------

_funding_positions: List[FundingPosition] = []
_amb_arb_trades: List[AmbArbTrade] = []
_session_start_equity: Optional[float] = None
_strategies_enabled: bool = True

# ---------------------------------------------------------------------------
# Equity helpers
# ---------------------------------------------------------------------------


def get_total_equity_usd() -> float:
    """Return current total portfolio equity in USD.

    TODO: Replace stub with real exchange API calls to sum balances across
          all connected exchanges.
    """
    return 10_000.0


def get_session_start_equity_usd() -> float:
    """Return the equity captured at session start.

    Captures equity on first call and returns the cached value thereafter.
    """
    global _session_start_equity
    if _session_start_equity is None:
        _session_start_equity = get_total_equity_usd()
    return _session_start_equity


def set_session_start_equity() -> None:
    """Explicitly (re-)capture the session-start equity snapshot."""
    global _session_start_equity
    _session_start_equity = get_total_equity_usd()


# ---------------------------------------------------------------------------
# Funding-position management
# ---------------------------------------------------------------------------


def get_open_funding_positions() -> List[FundingPosition]:
    """Return all currently open funding positions."""
    return list(_funding_positions)


def close_funding_position(pos: FundingPosition) -> None:
    """Close a single funding position and remove it from the registry.

    TODO: Replace stub with real API calls to close both the spot leg and the
          perpetual leg of the position.
    """
    if pos in _funding_positions:
        _funding_positions.remove(pos)


def close_all_positions() -> None:
    """Emergency-close every open position across all strategies.

    TODO: Replace stub with real API calls to close all open orders and
          positions on every connected exchange.
    """
    _funding_positions.clear()
    _amb_arb_trades.clear()


# ---------------------------------------------------------------------------
# Strategy enable / disable
# ---------------------------------------------------------------------------


def disable_all_strategies() -> None:
    """Disable all trading strategies (called by the global stop)."""
    global _strategies_enabled
    _strategies_enabled = False


def strategies_enabled() -> bool:
    """Return True if strategies are currently permitted to trade."""
    return _strategies_enabled


# ---------------------------------------------------------------------------
# Market-data stubs
# ---------------------------------------------------------------------------


def get_current_funding_rate(symbol: str) -> float:
    """Return the current perpetual funding rate for *symbol*.

    TODO: Replace stub with a real exchange API call.
    Returns a positive value for longs-pay-shorts, negative for shorts-pay-longs.
    """
    return 0.03  # stub: 0.03 % per 8-hour period


def get_spot_price(symbol: str) -> float:
    """Return the current spot mid-price for *symbol* in USD.

    TODO: Replace stub with a real exchange API call.
    """
    return 50_000.0  # stub


def get_perp_price(symbol: str) -> float:
    """Return the current perpetual mid-price for *symbol* in USD.

    TODO: Replace stub with a real exchange API call.
    """
    return 50_050.0  # stub — small positive basis


def get_combined_pnl(pos: FundingPosition) -> float:
    """Return the combined unrealised PnL (spot + perp legs) for *pos* in USD.

    TODO: Replace stub with real mark-to-market calculations using live prices.
    """
    return 0.0  # stub


def get_best_bid(exchange: str, symbol: str) -> float:
    """Return the best bid price on *exchange* for *symbol*.

    TODO: Replace stub with a real order-book API call.
    """
    return 50_000.0  # stub


def get_best_ask(exchange: str, symbol: str) -> float:
    """Return the best ask price on *exchange* for *symbol*.

    TODO: Replace stub with a real order-book API call.
    """
    return 50_010.0  # stub


# ---------------------------------------------------------------------------
# Order placement stubs
# ---------------------------------------------------------------------------


def place_limit_order(
    exchange: str, symbol: str, side: str, qty: float, price: float
) -> str:
    """Place a limit order and return the exchange-assigned order ID.

    TODO: Replace stub with a real exchange API call (e.g. via ccxt).
    """
    order_id = f"LMT-{uuid.uuid4().hex[:8].upper()}"
    return order_id


def place_market_order(exchange: str, symbol: str, side: str, qty: float) -> str:
    """Place a market order and return the exchange-assigned order ID.

    TODO: Replace stub with a real exchange API call (e.g. via ccxt).
    """
    order_id = f"MKT-{uuid.uuid4().hex[:8].upper()}"
    return order_id


# ---------------------------------------------------------------------------
# Ambassador-arb trade registry
# ---------------------------------------------------------------------------


def register_amb_arb_trade(
    symbol: str,
    exchange_buy: str,
    exchange_sell: str,
    qty: float,
    buy_price: float,
    sell_price: float,
    edge_pct: float,
    order_id_buy: str,
    order_id_sell: str,
) -> AmbArbTrade:
    """Create and register a new ambassador-arb trade record."""
    trade = AmbArbTrade(
        symbol=symbol,
        exchange_buy=exchange_buy,
        exchange_sell=exchange_sell,
        qty=qty,
        buy_price=buy_price,
        sell_price=sell_price,
        edge_pct=edge_pct,
        order_id_buy=order_id_buy,
        order_id_sell=order_id_sell,
    )
    _amb_arb_trades.append(trade)
    return trade


def get_open_amb_arb_routes() -> int:
    """Return the number of currently open ambassador-arb routes."""
    return len(_amb_arb_trades)
