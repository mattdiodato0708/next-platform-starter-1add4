# Production MEV Bot

A sophisticated Maximum Extractable Value (MEV) bot for Ethereum that implements advanced strategies for profitable transaction execution.

## 🎯 Features

- **Advanced MEV Strategies**
  - Sandwich attacks (front-run + back-run)
  - Flash loan arbitrage across multiple DEXes
  - Lending protocol liquidations

- **Professional Architecture**
  - Modular service-based design
  - Real-time mempool monitoring
  - Flashbots integration for MEV protection
  - Comprehensive error handling

- **Risk Management**
  - Dry-run mode for testing
  - Emergency stop mechanism
  - Maximum gas price limits
  - Profit validation before execution

- **Monitoring & Alerts**
  - Telegram notifications
  - Discord webhooks
  - PostgreSQL tracking
  - Performance metrics

## 📋 Prerequisites

- Node.js >= 16.x
- PostgreSQL >= 13
- Ethereum RPC endpoint (Infura/Alchemy)
- Wallet with ETH for gas fees

## 🚀 Installation

1. **Clone the repository**
```bash
git clone https://github.com/mattdiodato0708/next-platform-starter-1add4.git
cd next-platform-starter-1add4/bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up PostgreSQL database**
```bash
# Create database
createdb mev_bot

# Import schema
psql mev_bot < schema.sql
```

4. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your credentials
```

## ⚙️ Configuration

### Required Environment Variables

```env
# Network
INFURA_WS_URL=wss://mainnet.infura.io/ws/v3/YOUR_KEY
ALCHEMY_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
FLASHBOTS_RELAY_URL=https://relay.flashbots.net

# Wallet
PRIVATE_KEY=your_private_key_here

# Database
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=mev_bot
DB_PORT=5432

# Strategy Parameters
MIN_PROFIT_USD=50
MAX_GAS_PRICE_GWEI=300
MIN_TRANSACTION_VALUE_USD=10000

# Risk Management
DRY_RUN_MODE=true
EMERGENCY_STOP=false
```

### Optional Configuration

- **TELEGRAM_BOT_TOKEN**: For Telegram alerts
- **TELEGRAM_CHAT_ID**: Your Telegram chat ID
- **DISCORD_WEBHOOK_URL**: For Discord notifications

## 🏃 Running the Bot

### Dry Run Mode (Recommended for Testing)
```bash
DRY_RUN_MODE=true npm start
```

### Production Mode
```bash
DRY_RUN_MODE=false npm start
```

### Development Mode (with auto-reload)
```bash
npm run dev
```

## 📚 Architecture

### Directory Structure
```
bot/
├── index.js                 # Main orchestrator
├── strategies/              # MEV strategies
│   ├── base.js             # Base strategy class
│   ├── sandwich.js         # Sandwich attack strategy
│   ├── arbitrage.js        # Flash loan arbitrage
│   └── liquidation.js      # Liquidation strategy
├── services/                # Core services
│   ├── mempool.js          # Mempool monitoring
│   ├── dex.js              # DEX interactions
│   ├── gas.js              # Gas optimization
│   ├── pricing.js          # Price feeds
│   ├── flashloan.js        # Aave flash loans
│   └── flashbots.js        # Flashbots integration
├── utils/                   # Utilities
│   ├── logger.js           # Structured logging
│   ├── profit-calculator.js # Profit calculations
│   ├── simulation.js       # Transaction simulation
│   └── alerts.js           # Notification system
├── config/                  # Configuration
│   ├── tokens.js           # Token addresses
│   ├── dexes.js            # DEX configurations
│   └── protocols.js        # Protocol addresses
├── contracts/               # Smart contracts
│   ├── MEVExecutor.sol     # Main execution contract
│   └── deploy.js           # Deployment script
└── schema.sql              # Database schema
```

### Strategy Flow

1. **Detection**: Monitor mempool or market state for opportunities
2. **Calculation**: Calculate expected profit after all costs
3. **Validation**: Simulate transaction to ensure success
4. **Execution**: Execute via Flashbots or public mempool
5. **Monitoring**: Track execution and record results

## 🔐 Security

### Best Practices

- **Never commit private keys** to version control
- **Use environment variables** for sensitive data
- **Test in dry-run mode** before live execution
- **Set gas price limits** to prevent excessive costs
- **Monitor bot activity** regularly
- **Use hardware wallet** for production deployments

### Risk Warnings

⚠️ **IMPORTANT**: This bot interacts with real funds on Ethereum mainnet.

- MEV opportunities are highly competitive
- Gas costs can exceed profits
- Smart contract bugs can lead to fund loss
- Market conditions change rapidly
- **Never risk more than you can afford to lose**

## 📊 Monitoring

### View Statistics
```javascript
// Query strategy performance
SELECT * FROM strategy_performance;

// Query daily performance
SELECT * FROM daily_performance;
```

### Check Logs
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

## 🛠️ Smart Contract Deployment

### Prerequisites
```bash
npm install --save-dev hardhat
npm install @aave/core-v3 @openzeppelin/contracts
```

### Compile & Deploy
```bash
# Initialize Hardhat
npx hardhat init

# Copy contract to contracts/
cp contracts/MEVExecutor.sol ../contracts/

# Compile
npx hardhat compile

# Deploy (after configuring hardhat.config.js)
npx hardhat run scripts/deploy.js --network mainnet
```

### Update Configuration
After deployment, update `.env`:
```env
MEV_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

## 🔧 Troubleshooting

### Common Issues

**Bot not detecting transactions**
- Check WebSocket connection
- Verify RPC endpoint is working
- Lower `MIN_TRANSACTION_VALUE_USD` threshold

**High gas costs**
- Reduce `MAX_GAS_PRICE_GWEI`
- Increase `MIN_PROFIT_USD`
- Use Flashbots to avoid failed transactions

**Database connection errors**
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure schema is imported

**No profitable opportunities**
- MEV is highly competitive
- Adjust profit thresholds
- Monitor during high-volatility periods

## 📈 Performance Optimization

### Tips for Better Results

1. **Use fast RPC endpoints** (dedicated nodes preferred)
2. **Run on low-latency servers** (close to validators)
3. **Optimize gas calculations** for your specific strategies
4. **Monitor mempool in real-time** without delays
5. **Use Flashbots** to avoid failed transactions
6. **Start with conservative parameters** and adjust based on results

## 🤝 Contributing

This is a production system. Contributions should:
- Follow existing code style
- Include comprehensive tests
- Update documentation
- Consider security implications

## ⚖️ Legal Disclaimer

This software is provided "as is" without warranty of any kind. The authors are not responsible for any losses incurred through use of this software.

- **Not financial advice**
- **Use at your own risk**
- **Comply with local regulations**
- **MEV may be considered frontrunning** in some jurisdictions

## 📞 Support

For issues and questions:
- Open a GitHub issue
- Review existing documentation
- Check logs for error messages

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ for the Ethereum MEV community**
