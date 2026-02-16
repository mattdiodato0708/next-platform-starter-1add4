# MEV Bot

A Maximal Extractable Value (MEV) bot for Ethereum that monitors the mempool for profitable opportunities including sandwich attacks, flash loan arbitrage, and liquidation detection.

## ⚠️ Security Warnings

**IMPORTANT: Read before using this bot!**

- **Never commit your `.env` file** - it contains sensitive credentials
- **Never share your private keys** - use a separate wallet for testing
- **Use a wallet with limited funds** - only deposit what you can afford to lose
- **Understand gas costs** - failed transactions still cost gas
- **Test on testnet first** - use Goerli or Sepolia before mainnet
- **Be aware of risks** - MEV trading can result in losses
- **Legal compliance** - ensure your activities comply with local regulations

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v14 or higher) installed
- **PostgreSQL** (v12 or higher) installed and running
- **Infura Account** - Sign up at [infura.io](https://infura.io) for a free project ID
- **Ethereum Wallet** - with a private key (use a dedicated wallet for this bot)
- Basic understanding of MEV, Ethereum, and DeFi protocols

## Installation

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository-url>
   cd bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` with your actual values:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` - PostgreSQL credentials
   - `INFURA_WS_URL` - Your Infura WebSocket URL with project ID
   - `PRIVATE_KEY` - Your Ethereum wallet private key (without 0x prefix)
   - `MIN_PROFIT_THRESHOLD_ETH` - Minimum profit in ETH to execute trades (e.g., 0.01)
   - `GAS_PRICE_MULTIPLIER` - Multiplier for gas price (e.g., 1.1 for 10% above base)

## Database Setup

Create the necessary PostgreSQL database and table:

```sql
-- Create database
CREATE DATABASE your_database;

-- Connect to the database
\c your_database

-- Create results table
CREATE TABLE results (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_results_created_at ON results(created_at);
CREATE INDEX idx_results_data ON results USING GIN(data);
```

## Configuration

### Environment Variables

- **PostgreSQL Configuration**:
  - `DB_HOST`: Database host (default: localhost)
  - `DB_USER`: Database username
  - `DB_PASSWORD`: Database password
  - `DB_NAME`: Database name
  - `DB_PORT`: Database port (default: 5432)

- **Ethereum Configuration**:
  - `INFURA_WS_URL`: Infura WebSocket URL (wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID)
  - `PRIVATE_KEY`: Your Ethereum wallet private key

- **Bot Configuration**:
  - `MIN_PROFIT_THRESHOLD_ETH`: Minimum profit threshold in ETH (e.g., 0.01)
  - `GAS_PRICE_MULTIPLIER`: Gas price multiplier (e.g., 1.1 = 10% above base)

## How to Run

### Development Mode (with auto-restart):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The bot will:
1. Connect to PostgreSQL
2. Connect to Ethereum mainnet via Infura WebSocket
3. Start monitoring the mempool for pending transactions
4. Analyze transactions for MEV opportunities
5. Execute profitable trades (when implemented)
6. Track results in the database

## Architecture Overview

### Core Components

1. **Mempool Listener** (`listenForMempool()`):
   - Monitors pending transactions in the Ethereum mempool
   - Filters for potential MEV opportunities
   - Calls analysis functions for each relevant transaction

2. **Opportunity Detection**:
   - `isUniswapTransaction()` - Identifies Uniswap V2/V3 transactions
   - `isPotentialSandwich()` - Detects sandwich attack opportunities
   - `isPotentialArbitrage()` - Identifies arbitrage opportunities
   - `isPotentialLiquidation()` - Finds liquidation opportunities

3. **Profitability Analysis** (`calculateProfitability()`):
   - Calculates estimated gas costs
   - Estimates potential profit
   - Compares against minimum threshold
   - Returns boolean indicating if trade is profitable

4. **Trade Execution** (`executeTrade()`):
   - Prepares transactions for Uniswap
   - Estimates gas and signs transactions
   - Executes on-chain (requires Uniswap integration)

5. **Result Tracking** (`trackResults()`):
   - Stores trade results in PostgreSQL
   - Enables performance analysis and optimization

### MEV Strategies

1. **Sandwich Attacks**:
   - Front-run large DEX trades
   - Execute your buy before victim's trade
   - Back-run with sell after victim's trade
   - Profit from price impact

2. **Flash Loan Arbitrage**:
   - Detect price differences across DEXs
   - Use flash loans for capital efficiency
   - Execute arbitrage trades
   - Repay loan and keep profit

3. **Liquidation Detection**:
   - Monitor lending protocols (Aave, Compound)
   - Identify under-collateralized positions
   - Execute liquidations for rewards

## Development Status

### ✅ Implemented
- Basic mempool monitoring
- PostgreSQL result tracking
- Environment variable configuration
- Error handling and graceful shutdown

### 🚧 TODO (Requires Implementation)
- Uniswap V2/V3 contract integration
- Flash loan integration (Aave, dYdX)
- Liquidation protocol integration
- Advanced gas optimization
- Multi-DEX arbitrage logic
- Machine learning for opportunity prediction

## Troubleshooting

### Common Issues

1. **Connection Errors**:
   - Check PostgreSQL is running: `pg_isready`
   - Verify Infura WebSocket URL is correct
   - Ensure network connectivity

2. **High Gas Costs**:
   - Adjust `GAS_PRICE_MULTIPLIER` lower
   - Increase `MIN_PROFIT_THRESHOLD_ETH`
   - Monitor gas prices before trading

3. **No Opportunities Found**:
   - MEV is highly competitive
   - May need faster infrastructure
   - Consider using Flashbots for private transactions

4. **Transaction Failures**:
   - Check wallet has sufficient ETH for gas
   - Verify private key is correct
   - Ensure slippage tolerance is appropriate

## Performance Tips

- Use a dedicated server close to Infura nodes
- Consider using Flashbots for MEV bundles
- Optimize gas estimation algorithms
- Implement transaction simulation before submission
- Use WebSocket instead of HTTP for lower latency

## Resources

- [Ethereum MEV Documentation](https://ethereum.org/en/developers/docs/mev/)
- [Flashbots Documentation](https://docs.flashbots.net/)
- [Uniswap V2 Documentation](https://docs.uniswap.org/protocol/V2/introduction)
- [Uniswap V3 Documentation](https://docs.uniswap.org/protocol/introduction)
- [ethers.js Documentation](https://docs.ethers.io/)

## License

This software is provided for educational purposes only. Use at your own risk.

## Disclaimer

This bot is provided as-is without any warranties. MEV trading involves significant risks including:
- Financial losses
- High gas costs
- Smart contract vulnerabilities
- Regulatory concerns

Always test thoroughly on testnets before using real funds. The authors are not responsible for any losses incurred through use of this software.
