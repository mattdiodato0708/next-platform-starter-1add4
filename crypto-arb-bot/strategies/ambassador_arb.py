"""
strategies/ambassador_arb.py — Cross-exchange ambassador (spread) arbitrage strategy.

Identifies price discrepancies across exchanges and places offsetting orders.
"""

from itertools import permutations
from typing import List

from config import CONFIG
from core.exchange import (
    get_best_ask,
    get_best_bid,
    get_open_amb_arb_routes,
    place_limit_order,
    place_market_order,
    register_amb_arb_trade,
)
from core.logger import log, log_debug, log_warn

_AMB_CFG = CONFIG["AMBASSADOR_ARB"]
_FEE_CFG = CONFIG["EXCHANGE_FEE_PROFILE"]

# Exchanges known to the fee profile
_EXCHANGES: List[str] = list(_FEE_CFG.keys())


# ---------------------------------------------------------------------------
# Fee / edge calculation
# ---------------------------------------------------------------------------


def _effective_edge(
    buy_price: float,
    sell_price: float,
    buy_exchange: str,
    sell_exchange: str,
    use_maker: bool,
) -> float:
    """
    Compute the net effective edge percentage after fees and referral kickbacks.

    Parameters
    ----------
    buy_price  : Price paid on the buy exchange.
    sell_price : Price received on the sell exchange.
    buy_exchange  : Exchange key in EXCHANGE_FEE_PROFILE (e.g. "EX1").
    sell_exchange : Exchange key in EXCHANGE_FEE_PROFILE (e.g. "EX2").
    use_maker  : If True, apply maker fees; otherwise apply taker fees.

    Returns
    -------
    Net edge as a fraction (e.g. 0.001 == 0.1 %).
    """
    if buy_price <= 0:
        return 0.0

    # Gross edge as a fraction
    gross_edge = (sell_price - buy_price) / buy_price

    buy_fee_profile = _FEE_CFG.get(buy_exchange, {})
    sell_fee_profile = _FEE_CFG.get(sell_exchange, {})

    fee_key = "MAKER_FEE_PCT" if use_maker else "TAKER_FEE_PCT"

    # Fees are expressed as percentages in config — convert to fractions
    buy_fee = buy_fee_profile.get(fee_key, 0.0) / 100.0
    sell_fee = sell_fee_profile.get(fee_key, 0.0) / 100.0

    # Referral kickbacks reduce effective cost (expressed as percentages)
    buy_kickback = buy_fee_profile.get("REFERRAL_KICKBACK_PCT", 0.0) / 100.0
    sell_kickback = sell_fee_profile.get("REFERRAL_KICKBACK_PCT", 0.0) / 100.0

    net_edge = gross_edge - buy_fee - sell_fee + buy_kickback + sell_kickback
    return net_edge


# ---------------------------------------------------------------------------
# Order placement
# ---------------------------------------------------------------------------


def place_ambassador_arb_orders(
    symbol: str,
    ex_buy: str,
    ex_sell: str,
    qty: float,
    buy_price: float,
    sell_price: float,
    liq_type: str,
    edge_pct: float,
) -> None:
    """
    Place the paired buy/sell orders for an ambassador-arb opportunity.

    Parameters
    ----------
    symbol     : Trading pair, e.g. "BTC/USDT".
    ex_buy     : Exchange to buy on.
    ex_sell    : Exchange to sell on.
    qty        : Quantity to trade.
    buy_price  : Target buy price.
    sell_price : Target sell price.
    liq_type   : "maker" or "taker".
    edge_pct   : Effective edge (fraction) for logging.
    """
    use_maker = liq_type == "maker"

    if use_maker:
        # Passive limit orders: buy slightly above best ask, sell slightly below best bid
        limit_buy_price = buy_price * 1.0001
        limit_sell_price = sell_price * 0.9999
        order_id_buy = place_limit_order(ex_buy, symbol, "buy", qty, limit_buy_price)
        order_id_sell = place_limit_order(ex_sell, symbol, "sell", qty, limit_sell_price)
    else:
        order_id_buy = place_market_order(ex_buy, symbol, "buy", qty)
        order_id_sell = place_market_order(ex_sell, symbol, "sell", qty)

    register_amb_arb_trade(
        symbol=symbol,
        exchange_buy=ex_buy,
        exchange_sell=ex_sell,
        qty=qty,
        buy_price=buy_price,
        sell_price=sell_price,
        edge_pct=edge_pct,
        order_id_buy=order_id_buy,
        order_id_sell=order_id_sell,
    )

    log(
        "Ambassador arb placed: %s | buy@%s %.6f → sell@%s | edge=%.4f%% | liq=%s",
        symbol,
        ex_buy,
        qty,
        ex_sell,
        edge_pct * 100,
        liq_type,
    )


# ---------------------------------------------------------------------------
# Opportunity scanning
# ---------------------------------------------------------------------------


def scan_ambassador_opportunities(symbols: List[str]) -> None:
    """
    Scan all symbol/exchange-pair combinations for profitable spread opportunities.

    Parameters
    ----------
    symbols : List of trading pairs to scan, e.g. ["BTC/USDT", "ETH/USDT"].
    """
    max_routes: int = _AMB_CFG["MAX_OPEN_ROUTES"]
    min_edge_pct: float = _AMB_CFG["MIN_EFFECTIVE_EDGE_PCT"] / 100.0
    min_spread_pct: float = _AMB_CFG["MIN_SPREAD_PCT"] / 100.0
    min_order_usd: float = _AMB_CFG["MIN_ORDER_USD"]
    max_position_usd: float = _AMB_CFG["MAX_POSITION_USD"]
    use_maker: bool = _AMB_CFG["USE_MAKER_ONLY"]
    liq_type: str = "maker" if use_maker else "taker"

    # Enforce maximum open routes before scanning
    if get_open_amb_arb_routes() >= max_routes:
        log_debug(
            "scan_ambassador_opportunities: max open routes (%d) reached, skipping scan",
            max_routes,
        )
        return

    for symbol in symbols:
        if get_open_amb_arb_routes() >= max_routes:
            break

        # Evaluate every directed exchange pair (A→B and B→A are separate)
        for ex_buy, ex_sell in permutations(_EXCHANGES, 2):
            if get_open_amb_arb_routes() >= max_routes:
                break

            ask_price = get_best_ask(ex_buy, symbol)   # price to buy at
            bid_price = get_best_bid(ex_sell, symbol)  # price to sell at

            if ask_price <= 0 or bid_price <= 0:
                log_warn(
                    "Invalid price for %s on %s/%s, skipping",
                    symbol,
                    ex_buy,
                    ex_sell,
                )
                continue

            # Gross spread check (quick filter before fee calculation)
            raw_spread = (bid_price - ask_price) / ask_price
            if raw_spread < min_spread_pct:
                log_debug(
                    "%s %s→%s: raw_spread=%.4f%% < min=%.4f%%, skipping",
                    symbol,
                    ex_buy,
                    ex_sell,
                    raw_spread * 100,
                    min_spread_pct * 100,
                )
                continue

            # Net edge after fees
            edge = _effective_edge(ask_price, bid_price, ex_buy, ex_sell, use_maker)
            if edge < min_edge_pct:
                log_debug(
                    "%s %s→%s: net_edge=%.4f%% < min=%.4f%%, skipping",
                    symbol,
                    ex_buy,
                    ex_sell,
                    edge * 100,
                    min_edge_pct * 100,
                )
                continue

            # Size check: use max allowed position, but respect min order size
            notional_usd = max_position_usd
            if notional_usd < min_order_usd:
                log_debug(
                    "%s %s→%s: notional=%.2f USD < min_order=%.2f USD, skipping",
                    symbol,
                    ex_buy,
                    ex_sell,
                    notional_usd,
                    min_order_usd,
                )
                continue

            qty = notional_usd / ask_price

            place_ambassador_arb_orders(
                symbol=symbol,
                ex_buy=ex_buy,
                ex_sell=ex_sell,
                qty=qty,
                buy_price=ask_price,
                sell_price=bid_price,
                liq_type=liq_type,
                edge_pct=edge,
            )
