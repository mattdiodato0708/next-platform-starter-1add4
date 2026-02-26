"""
strategies/ambassador_arb.py — Cross-exchange ambassador arbitrage strategy.

Scans for price discrepancies across exchange pairs and places offsetting
orders to capture the spread after fees, rebates, and referral kickbacks.
"""

import datetime
import threading

from core.logger import log, log_error
from core import exchange
from core.safety import GlobalStopTriggered, enforce_global_safety


def scan_ambassador_opportunities(cfg: dict, stop_event: threading.Event) -> None:
    """Scan all watched symbols across configured exchange pairs for arb edges.

    For every (symbol, exchange_A, exchange_B) combination the function
    checks both directions:
    - Buy on A, sell on B
    - Buy on B, sell on A

    A trade is placed when:
    - Effective edge (spread minus fees plus rebates/kickbacks) exceeds
      ``MIN_EFFECTIVE_EDGE_PCT``
    - Raw spread exceeds ``MIN_SPREAD_PCT``
    - Order size is within [``MIN_ORDER_USD``, ``MAX_POSITION_USD``]
    - Number of open routes is below ``MAX_OPEN_ROUTES``
    """
    arb_cfg = cfg["AMBASSADOR_ARB"]
    fee_profiles = cfg["EXCHANGE_FEE_PROFILE"]
    min_spread = arb_cfg["MIN_SPREAD_PCT"] / 100
    min_edge = arb_cfg["MIN_EFFECTIVE_EDGE_PCT"] / 100
    min_order_usd = arb_cfg["MIN_ORDER_USD"]
    max_pos_usd = arb_cfg["MAX_POSITION_USD"]
    max_routes = arb_cfg["MAX_OPEN_ROUTES"]
    referral_rebate = arb_cfg.get("REFERRAL_REBATE_PCT", 0) / 100
    capital_frac = cfg["CAPITAL_SPLIT"]["AMBASSADOR_ARB"]

    while not stop_event.is_set():
        try:
            enforce_global_safety(cfg)
        except GlobalStopTriggered:
            log("Global stop triggered — ambassador scanner exiting", level="error")
            stop_event.set()
            return

        open_routes = exchange.get_open_amb_arb_routes()
        if len(open_routes) >= max_routes:
            log(
                f"Max open routes ({max_routes}) reached — skipping scan",
                level="debug",
            )
            stop_event.wait(cfg["GLOBAL"]["POLL_INTERVAL_SEC"])
            continue

        total_equity = exchange.get_total_equity_usd()
        allocated = total_equity * capital_frac
        size_usd = min(allocated / max(max_routes, 1), max_pos_usd)
        size_usd = max(size_usd, 0)

        if size_usd < min_order_usd:
            log(
                f"Insufficient capital for ambassador arb "
                f"(${size_usd:,.2f} < min ${min_order_usd:,.2f})",
                level="debug",
            )
            stop_event.wait(cfg["GLOBAL"]["POLL_INTERVAL_SEC"])
            continue

        for symbol in arb_cfg["WATCHED_SYMBOLS"]:
            if len(open_routes) >= max_routes:
                break

            for exch_a, exch_b in arb_cfg["EXCHANGE_PAIRS"]:
                if len(open_routes) >= max_routes:
                    break

                fee_a = fee_profiles.get(exch_a, {"maker": 0, "taker": 0})
                fee_b = fee_profiles.get(exch_b, {"maker": 0, "taker": 0})

                ask_a = exchange.get_best_ask(symbol, exch_a)
                bid_b = exchange.get_best_bid(symbol, exch_b)
                ask_b = exchange.get_best_ask(symbol, exch_b)
                bid_a = exchange.get_best_bid(symbol, exch_a)

                if ask_a <= 0 or bid_b <= 0 or ask_b <= 0 or bid_a <= 0:
                    continue

                # Direction 1: buy on A (taker), sell on B (maker)
                spread_ab = (bid_b - ask_a) / ask_a
                cost_ab = (fee_a["taker"] + fee_b["maker"]) / 100
                edge_ab = spread_ab - cost_ab + referral_rebate

                # Direction 2: buy on B (taker), sell on A (maker)
                spread_ba = (bid_a - ask_b) / ask_b
                cost_ba = (fee_b["taker"] + fee_a["maker"]) / 100
                edge_ba = spread_ba - cost_ba + referral_rebate

                for direction, spread, edge, buy_exch, sell_exch, buy_price, sell_price in [
                    ("A→B", spread_ab, edge_ab, exch_a, exch_b, ask_a, bid_b),
                    ("B→A", spread_ba, edge_ba, exch_b, exch_a, ask_b, bid_a),
                ]:
                    if spread < min_spread:
                        log(
                            f"Skip {symbol} {direction}: spread {spread:.4%} < min {min_spread:.4%}",
                            level="debug",
                        )
                        continue

                    if edge < min_edge:
                        log(
                            f"Skip {symbol} {direction}: edge {edge:.4%} < min {min_edge:.4%}",
                            level="debug",
                        )
                        continue

                    log(
                        f"Opportunity {symbol} {direction} | "
                        f"spread={spread:.4%} edge={edge:.4%} "
                        f"buy={buy_exch}@{buy_price:.4f} sell={sell_exch}@{sell_price:.4f}",
                    )

                    if cfg["GLOBAL"]["DRY_RUN"]:
                        log(f"[DRY RUN] Would place {symbol} {direction} size=${size_usd:,.0f}")
                        continue

                    buy_ok = exchange.place_limit_order(
                        symbol, buy_exch, "buy", size_usd, buy_price
                    )
                    sell_ok = exchange.place_limit_order(
                        symbol, sell_exch, "sell", size_usd, sell_price
                    )

                    if buy_ok and sell_ok:
                        trade = exchange.AmbArbTrade(
                            symbol=symbol,
                            buy_exchange=buy_exch,
                            sell_exchange=sell_exch,
                            size_usd=size_usd,
                            buy_price=buy_price,
                            sell_price=sell_price,
                            opened_at=datetime.datetime.utcnow().isoformat(),
                        )
                        exchange.register_amb_arb_trade(trade)
                        open_routes = exchange.get_open_amb_arb_routes()
                        log(
                            f"Opened {symbol} {direction} size=${size_usd:,.0f} "
                            f"edge={edge:.4%}"
                        )
                    else:
                        log_error(
                            f"Order placement failed for {symbol} {direction}"
                        )

        stop_event.wait(cfg["GLOBAL"]["POLL_INTERVAL_SEC"])


def place_ambassador_arb_orders(
    symbol: str,
    buy_exchange: str,
    sell_exchange: str,
    size_usd: float,
    buy_price: float,
    sell_price: float,
    cfg: dict,
) -> bool:
    """Place a single ambassador arb trade (buy on one exchange, sell on another).

    Returns True if both orders were submitted successfully.
    """
    if cfg["GLOBAL"]["DRY_RUN"]:
        log(
            f"[DRY RUN] Ambassador arb {symbol}: "
            f"buy {buy_exchange}@{buy_price:.4f} / sell {sell_exchange}@{sell_price:.4f} "
            f"size=${size_usd:,.0f}"
        )
        return True

    buy_ok = exchange.place_limit_order(symbol, buy_exchange, "buy", size_usd, buy_price)
    sell_ok = exchange.place_limit_order(symbol, sell_exchange, "sell", size_usd, sell_price)

    if buy_ok and sell_ok:
        trade = exchange.AmbArbTrade(
            symbol=symbol,
            buy_exchange=buy_exchange,
            sell_exchange=sell_exchange,
            size_usd=size_usd,
            buy_price=buy_price,
            sell_price=sell_price,
            opened_at=datetime.datetime.utcnow().isoformat(),
        )
        exchange.register_amb_arb_trade(trade)
        log(f"Placed ambassador arb {symbol} size=${size_usd:,.0f}")
        return True

    log_error(f"Ambassador arb order placement failed for {symbol}")
    return False
