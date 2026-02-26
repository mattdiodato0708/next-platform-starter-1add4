# Crypto Arbitrage Bot

A self-contained, multi-strategy crypto arbitrage bot ready to deploy on Replit or any Python 3.10+ environment.

---

## Quick Start

```bash
# 1. Clone / unzip into your project directory
cd crypto-arb-bot

# 2. (Optional) create a virtual environment
python -m venv .venv && source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure your settings
#    Edit config.json to match your capital, risk tolerance, and exchange keys.

# 5. Run the bot
python main.py
```

---

## Architecture

```
crypto-arb-bot/
├── main.py                  ← Entry point; spins up strategy threads
├── config.py                ← Loads & validates config.json; exports CONFIG
├── config.json              ← All tunable parameters
├── core/
│   ├── __init__.py
│   ├── logger.py            ← Centralised timestamped logging
│   ├── safety.py            ← Global circuit-breaker / stop logic
│   └── exchange.py          ← Exchange interface stubs (replace with live API)
├── strategies/
│   ├── __init__.py
│   ├── funding_arb.py       ← Delta-neutral funding-rate arbitrage
│   └── ambassador_arb.py    ← Cross-exchange spread arbitrage
└── requirements.txt
```

### Data flow

```
main.py
  │
  ├─ set_session_start_equity()          ← baseline for drawdown tracking
  │
  ├─ Thread: FundingMonitor  ──► monitor_funding_positions()
  │                               stop-loss / funding-drop / take-profit checks
  ├─ Thread: FundingScan     ──► scan_funding_opportunities()
  │                               find new delta-neutral setups
  └─ Thread: AmbassadorArb   ──► scan_ambassador_opportunities()
                                  cross-exchange spread detection
```

Each thread calls `enforce_global_safety()` before executing its strategy.  
If the portfolio drawdown breaches `GLOBAL_STOP_EQUITY_DROP_PCT`, all positions are closed, all strategies are disabled, and a `GlobalStopTriggered` exception causes every thread to exit cleanly.

---

## Configuration Reference

| Section | Key | Description |
|---|---|---|
| `GLOBAL` | `TOTAL_CAPITAL_USD` | Total capital under management (USD) |
| `GLOBAL` | `MAX_DRAWDOWN_DAILY_USD` | Hard daily loss limit |
| `GLOBAL` | `MAX_OPEN_POSITIONS` | Maximum concurrent open positions |
| `GLOBAL` | `LOG_LEVEL` | `"info"` or `"debug"` |
| `CAPITAL_SPLIT` | `FUNDING_ARB_PCT` | Fraction of capital for funding arb (must sum to 1.0 with `AMBASSADOR_ARB_PCT`) |
| `CAPITAL_SPLIT` | `AMBASSADOR_ARB_PCT` | Fraction of capital for ambassador arb |
| `SAFETY` | `ENABLE_GLOBAL_STOP` | Master kill-switch |
| `SAFETY` | `GLOBAL_STOP_EQUITY_DROP_PCT` | Drawdown threshold that triggers global stop (0–1) |
| `SAFETY` | `PER_TRADE_STOP_LOSS_PCT` | Per-position stop-loss fraction |
| `SAFETY` | `MAX_LEVERAGE` | Maximum allowed leverage (≥1) |
| `TOGGLES` | `ENABLE_FUNDING_ARB` | Enable/disable funding-rate strategy |
| `TOGGLES` | `ENABLE_AMBASSADOR_ARB` | Enable/disable ambassador-arb strategy |
| `FUNDING_ARB` | `MIN_FUNDING_RATE_PCT` | Minimum funding rate to enter a position |
| `FUNDING_ARB` | `MAX_POSITION_USD` | Maximum position size per symbol |
| `AMBASSADOR_ARB` | `MIN_SPREAD_PCT` | Minimum gross spread to consider |
| `AMBASSADOR_ARB` | `MIN_EFFECTIVE_EDGE_PCT` | Minimum net edge after fees |
| `AMBASSADOR_ARB` | `USE_MAKER_ONLY` | Use limit (maker) orders only |
| `EXCHANGE_FEE_PROFILE` | `EX1/EX2/EX3` | Per-exchange taker/maker fees and referral kickbacks |

---

## Before Going Live — Checklist

- [ ] **Exchange API keys**: Add keys to environment variables or a secrets manager; never hard-code them.
- [ ] **Replace stubs**: Every function in `core/exchange.py` marked with `# TODO` must be wired to a real exchange SDK (e.g. [ccxt](https://github.com/ccxt/ccxt)).
- [ ] **Test on paper-trading**: Run against a sandbox or testnet before committing real capital.
- [ ] **Validate fees**: Confirm `EXCHANGE_FEE_PROFILE` values match your actual tier on each exchange.
- [ ] **Monitor slippage**: Real order fills will differ from stub prices; add slippage tolerance.
- [ ] **Rate limits**: Implement back-off / retry logic for exchange API rate limits.
- [ ] **Audit logs**: Redirect logs to a persistent store (e.g. file, database, cloud logging).
- [ ] **Redundancy**: Consider multiple API keys / sub-accounts per exchange for failover.
- [ ] **Tax / compliance**: Understand the regulatory obligations in your jurisdiction.

---

## Replit Deployment

1. Create a new **Python** Repl.
2. Upload (or paste) all files maintaining the directory structure shown above.
3. Open **Secrets** (🔒 icon) and add your exchange API credentials as environment variables (e.g. `EX1_API_KEY`, `EX1_API_SECRET`).
4. In `core/exchange.py`, read secrets via `os.environ.get("EX1_API_KEY")` and pass them to your chosen SDK.
5. Set the **Run** command to `python main.py`.
6. Click **Run** — the bot will start and log output to the console.
7. Enable **Always On** (Replit paid tier) to keep the bot running 24/7.

---

## License

This project is provided as-is for educational purposes.  
**Use at your own risk.** Crypto trading involves significant financial risk.
