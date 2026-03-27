"""
strategies/funding_arb.py — Funding-rate arbitrage strategy.

Monitors open positions and scans for new funding-rate opportunities.
"""

import datetime
import threading

from core.logger import log, log_error
from core import exchange
from core.safety import GlobalStopTriggered, enforce_global_safety


def monitor_funding_positions(cfg: dict, stop_event: threading.Event) -> None:
    """Monitor open funding-arb positions and close them when appropriate.

    Close conditions (checked in priority order):
    1. Funding rate drops below ``CLOSE_ON_FUNDING_DROP_PCT``
    2. Basis has mean-reverted past ``TAKE_PROFIT_BASIS_PCT``
    3. Otherwise, hold and log debug info.
    """
    arb_cfg = cfg["FUNDING_ARB"]
    close_on_drop = arb_cfg["CLOSE_ON_FUNDING_DROP_PCT"]
    take_profit = arb_cfg["TAKE_PROFIT_BASIS_PCT"]

    while not stop_event.is_set():
        try:
            enforce_global_safety(cfg)
        except GlobalStopTriggered:
            log("Global stop triggered — funding monitor exiting", level="error")
            stop_event.set()
            return

        positions = exchange.get_open_funding_positions()
        for pos in positions:
            funding_now = exchange.get_current_funding_rate(pos.symbol, pos.exchange)
            spot = exchange.get_spot_price(pos.symbol, pos.exchange)
            perp = exchange.get_perp_price(pos.symbol, pos.exchange)
            basis_now = (perp - spot) / spot if spot != 0 else 0.0

            if abs(funding_now) < close_on_drop:
                log(
                    f"Closing {pos.symbol} on {pos.exchange}: "
                    f"funding {funding_now:.4%} dropped below threshold {close_on_drop:.4%}",
                )
                exchange.close_funding_position(pos)
                continue

            if abs(basis_now) <= take_profit:
                log(
                    f"Closing {pos.symbol} on {pos.exchange}: "
                    f"basis {basis_now:.4%} mean-reverted within take-profit {take_profit:.4%}",
                )
                exchange.close_funding_position(pos)
                continue

            pnl = exchange.get_combined_pnl(pos)
            log(
                f"Hold {pos.symbol} on {pos.exchange} | "
                f"funding={funding_now:.4%} basis={basis_now:.4%} pnl=${pnl:,.2f}",
                level="debug",
            )

        stop_event.wait(cfg["GLOBAL"]["POLL_INTERVAL_SEC"])


def scan_funding_opportunities(cfg: dict, stop_event: threading.Event) -> None:
    """Scan for new funding-rate arbitrage opportunities and open positions.

    A position is opened when the current funding rate on a watched symbol
    exceeds ``MIN_FUNDING_RATE_PCT`` and the total allocated capital stays
    within ``MAX_POSITION_USD``.
    """
    arb_cfg = cfg["FUNDING_ARB"]
    min_rate = arb_cfg["MIN_FUNDING_RATE_PCT"]
    max_pos_usd = arb_cfg["MAX_POSITION_USD"]
    capital = cfg["CAPITAL_SPLIT"]["FUNDING_ARB"]

    while not stop_event.is_set():
        try:
            enforce_global_safety(cfg)
        except GlobalStopTriggered:
            log("Global stop triggered — funding scanner exiting", level="error")
            stop_event.set()
            return

        total_equity = exchange.get_total_equity_usd()
        allocated = total_equity * capital
        open_positions = exchange.get_open_funding_positions()
        open_symbols = {p.symbol for p in open_positions}

        for symbol in arb_cfg["WATCHED_SYMBOLS"]:
            if symbol in open_symbols:
                continue

            # TODO: iterate exchanges; using a single placeholder here
            exch = "binance"
            funding_rate = exchange.get_current_funding_rate(symbol, exch)

            if abs(funding_rate) < min_rate:
                log(
                    f"Skip {symbol}: funding {funding_rate:.4%} below min {min_rate:.4%}",
                    level="debug",
                )
                continue

            size_usd = min(allocated, max_pos_usd)
            if size_usd <= 0:
                log(f"Skip {symbol}: no capital available", level="debug")
                continue

            spot = exchange.get_spot_price(symbol, exch)
            perp = exchange.get_perp_price(symbol, exch)
            basis = (perp - spot) / spot if spot != 0 else 0.0

            if not cfg["GLOBAL"]["DRY_RUN"]:
                exchange.place_market_order(symbol, exch, "buy", size_usd)
            else:
                log(f"[DRY RUN] Would open funding arb: {symbol} size=${size_usd:,.0f} "
                    f"funding={funding_rate:.4%} basis={basis:.4%}")
                continue

            pos = exchange.FundingPosition(
                symbol=symbol,
                exchange=exch,
                side="long",
                size_usd=size_usd,
                entry_funding_rate=funding_rate,
                entry_basis=basis,
                opened_at=datetime.datetime.utcnow().isoformat(),
            )
            # Register only when not in dry-run
            exchange._funding_positions.append(pos)
            log(f"Opened funding arb: {symbol} size=${size_usd:,.0f} "
                f"funding={funding_rate:.4%} basis={basis:.4%}")

        stop_event.wait(cfg["GLOBAL"]["POLL_INTERVAL_SEC"])
