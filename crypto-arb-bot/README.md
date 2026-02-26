# Crypto Arbitrage Bot

A modular, deployment-ready Python crypto arbitrage bot that runs on Replit
(or any Python 3.10+ environment) with **zero external dependencies** by default.

---

## Architecture

```
crypto-arb-bot/
├── main.py                   ← Entry point, threads, graceful shutdown
├── config.py                 ← Config loader + validation
├── config.json               ← Single source of truth for all settings
├── strategies/
│   ├── funding_arb.py        ← Funding-rate arbitrage (monitor + scan)
│   └── ambassador_arb.py     ← Cross-exchange arb (scan + order placement)
├── core/
│   ├── logger.py             ← Timestamped structured logger
│   ├── safety.py             ← Global equity drawdown guard
│   └── exchange.py           ← Exchange interface (stub → real API)
├── requirements.txt          ← Optional dependencies (ccxt, etc.)
└── README.md                 ← This file
```

---

## Quick Start

```bash
# 1. Clone / open the project
cd crypto-arb-bot

# 2. (Optional) install real exchange libraries
pip install -r requirements.txt   # uncomment lines in requirements.txt first

# 3. Edit config.json to set your parameters
#    Set "DRY_RUN": false when ready to trade live.

# 4. Run
python main.py
```

---

## Configuration

All settings live in `config.json`.  Below is a summary of key fields.

| Section | Key | Description |
|---|---|---|
| `GLOBAL` | `LOG_LEVEL` | `"info"` or `"debug"` |
| `GLOBAL` | `POLL_INTERVAL_SEC` | Seconds between each strategy tick |
| `GLOBAL` | `DRY_RUN` | `true` = log only, no real orders |
| `CAPITAL_SPLIT` | `FUNDING_ARB` | Fraction of equity allocated to funding arb |
| `CAPITAL_SPLIT` | `AMBASSADOR_ARB` | Fraction of equity allocated to ambassador arb |
| `SAFETY` | `GLOBAL_STOP_EQUITY_DROP_PCT` | Max drawdown before all strategies halt (0–1) |
| `SAFETY` | `MAX_LEVERAGE` | Maximum allowed leverage (≥ 1) |
| `FUNDING_ARB` | `MIN_FUNDING_RATE_PCT` | Minimum funding rate to open a position |
| `FUNDING_ARB` | `CLOSE_ON_FUNDING_DROP_PCT` | Close when rate drops below this |
| `FUNDING_ARB` | `TAKE_PROFIT_BASIS_PCT` | Close when basis mean-reverts within this |
| `AMBASSADOR_ARB` | `MIN_SPREAD_PCT` | Minimum raw spread to consider a trade |
| `AMBASSADOR_ARB` | `MIN_EFFECTIVE_EDGE_PCT` | Minimum edge after fees/rebates |
| `AMBASSADOR_ARB` | `MAX_OPEN_ROUTES` | Maximum concurrent arb routes |

---

## Before Going Live Checklist

- [ ] Replace every `TODO` stub in `core/exchange.py` with real ccxt calls
- [ ] Set `"DRY_RUN": false` in `config.json`
- [ ] Store API keys in environment variables, **never** in `config.json`
- [ ] Test with small position sizes first
- [ ] Verify fee profiles in `EXCHANGE_FEE_PROFILE` match your account tier
- [ ] Set up error alerting (email / Telegram) so you know if the bot crashes
- [ ] Review `GLOBAL_STOP_EQUITY_DROP_PCT` — the default (15%) may be too loose

---

## Replit Deployment

1. Fork this repo or upload the `crypto-arb-bot/` folder to a new Replit.
2. Set the **Run** command to `python main.py`.
3. Add any API key secrets via **Replit Secrets** (not in source code).
4. Hit **Run** — the startup banner will confirm capital and strategy status.
5. For 24/7 operation enable **Always On** in Replit settings.

---

## Design Principles

- **Safety first** — `enforce_global_safety()` runs before every strategy tick.
- **Modularity** — each strategy is an isolated module with its own thread.
- **Graceful shutdown** — `SIGINT`/`SIGTERM` stops all threads cleanly.
- **No magic constants** — every parameter lives in `config.json`.
- **Zero deps by default** — runs on plain Python 3.10+; add ccxt when ready.
