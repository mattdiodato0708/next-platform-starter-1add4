"""
strategies/funding_arb.py — Funding-rate arbitrage strategy.

Monitors open delta-neutral positions and scans for new opportunities.
"""

from config import CONFIG
from core.exchange import (
    FundingPosition,
    close_funding_position,
    get_combined_pnl,
    get_current_funding_rate,
    get_open_funding_positions,
    get_perp_price,
    get_spot_price,
)
from core.logger import log, log_debug, log_warn

_FA_CFG = CONFIG["FUNDING_ARB"]
_SAFETY_CFG = CONFIG["SAFETY"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _calculate_basis_pct(perp_price: float, spot_price: float) -> float:
    """Return basis as a percentage: (perp - spot) / spot * 100.  Returns 0 if spot is 0."""
    if spot_price == 0:
        return 0.0
    return ((perp_price - spot_price) / spot_price) * 100


# ---------------------------------------------------------------------------
# Position monitoring
# ---------------------------------------------------------------------------


def monitor_funding_positions() -> None:
    """
    Iterate all open funding positions and apply exit rules:

    1. Stop-loss  — close if unrealised PnL <= -(PER_TRADE_STOP_LOSS_PCT * notional)
    2. Funding drop — close if abs(current_funding_rate) < CLOSE_ON_FUNDING_DROP_PCT
    3. Take-profit  — close if basis_pct <= -TAKE_PROFIT_BASIS_PCT
    4. Otherwise    — hold and emit a debug log
    """
    stop_loss_pct: float = _SAFETY_CFG["PER_TRADE_STOP_LOSS_PCT"]
    close_on_drop: float = _FA_CFG["CLOSE_ON_FUNDING_DROP_PCT"]
    take_profit_basis: float = _FA_CFG["TAKE_PROFIT_BASIS_PCT"]

    for pos in get_open_funding_positions():
        unrealised_pnl = get_combined_pnl(pos)
        stop_loss_threshold = -(stop_loss_pct * pos.notional_usd)

        # 1. Stop-loss check
        if unrealised_pnl <= stop_loss_threshold:
            log_warn(
                "STOP-LOSS triggered for %s (id=%s): PnL=%.2f USD <= threshold=%.2f USD",
                pos.symbol,
                pos.id,
                unrealised_pnl,
                stop_loss_threshold,
            )
            close_funding_position(pos)
            continue

        # 2. Funding-rate drop check
        funding_now = get_current_funding_rate(pos.symbol)
        if abs(funding_now) < close_on_drop:
            log_warn(
                "Funding rate dropped for %s (id=%s): rate=%.4f%% < threshold=%.4f%%",
                pos.symbol,
                pos.id,
                abs(funding_now) * 100,
                close_on_drop * 100,
            )
            close_funding_position(pos)
            continue

        # 3. Take-profit check (basis convergence)
        spot_price = get_spot_price(pos.symbol)
        perp_price = get_perp_price(pos.symbol)
        basis_pct = _calculate_basis_pct(perp_price, spot_price)

        if basis_pct <= -take_profit_basis:
            log(
                "TAKE-PROFIT triggered for %s (id=%s): basis_pct=%.4f%% <= -%.4f%%",
                pos.symbol,
                pos.id,
                basis_pct,
                take_profit_basis,
            )
            close_funding_position(pos)
            continue

        # 4. Hold
        log_debug(
            "Holding %s (id=%s): PnL=%.2f USD, funding=%.4f%%, basis=%.4f%%",
            pos.symbol,
            pos.id,
            unrealised_pnl,
            funding_now * 100,
            basis_pct,
        )


# ---------------------------------------------------------------------------
# Opportunity scanning
# ---------------------------------------------------------------------------


def scan_funding_opportunities() -> None:
    """
    Scan for new delta-neutral funding-rate arbitrage opportunities.

    TODO: Implement the following steps to go live:
      1. Fetch current funding rates for all symbols from the exchange API.
      2. Filter symbols where abs(funding_rate) >= MIN_FUNDING_RATE_PCT.
      3. For each candidate symbol, fetch spot and perp prices and compute
         basis_pct = (perp_price - spot_price) / spot_price * 100.
      4. Skip if basis_pct < MIN_BASIS_SPREAD_PCT or > MAX_BASIS_SPREAD_PCT.
      5. Estimate annualised yield (APY) from the funding rate and compare
         against TARGET_APY_PCT; skip if below target.
      6. Determine position sizing: min(MAX_POSITION_USD, available_capital)
         and ensure notional >= MIN_ORDER_USD * 2 (both legs).
      7. Open a delta-neutral position:
           - Buy spot leg  (to hedge the short-perp exposure, or vice-versa)
           - Open perp leg with appropriate side
         Register the position via exchange.register_funding_position() (to be
         implemented alongside the live exchange integration).
    """
    log_debug("scan_funding_opportunities: TODO — wire up live exchange API")
