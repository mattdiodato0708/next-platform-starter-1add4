// Import necessary libraries
require('dotenv').config();
const { ethers } = require('ethers');
const { Client } = require('pg');

// Connect to PostgreSQL
const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432
});

// PostgreSQL connection with error handling
client.connect()
    .then(() => console.log('✓ Connected to PostgreSQL'))
    .catch(err => {
        console.error('✗ PostgreSQL connection error:', err.message);
        process.exit(1);
    });

// Handle PostgreSQL connection errors
client.on('error', (err) => {
    console.error('PostgreSQL client error:', err.message);
});

// Set up provider and wallet
const provider = new ethers.providers.WebSocketProvider(process.env.INFURA_WS_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Configuration
const MIN_PROFIT_THRESHOLD = ethers.utils.parseEther(process.env.MIN_PROFIT_THRESHOLD_ETH || '0.01');
const GAS_PRICE_MULTIPLIER = parseFloat(process.env.GAS_PRICE_MULTIPLIER || '1.1');
const LARGE_TRADE_THRESHOLD_ETH = 1.0; // Threshold for detecting significant trades
const SANDWICH_PROFIT_PERCENTAGE = 1; // Expected profit percentage for sandwich attacks

console.log('🤖 MEV Bot Starting...');
console.log('Wallet Address:', wallet.address);
console.log('Min Profit Threshold:', ethers.utils.formatEther(MIN_PROFIT_THRESHOLD), 'ETH');
console.log('Gas Price Multiplier:', GAS_PRICE_MULTIPLIER);

// WebSocket provider reconnection logic
provider._websocket.on('error', (error) => {
    console.error('WebSocket error:', error.message);
});

provider._websocket.on('close', () => {
    console.log('WebSocket closed. Attempting to reconnect...');
    setTimeout(() => {
        process.exit(1); // Exit and let process manager restart
    }, 5000);
});

// Helper function to check if transaction is a Uniswap transaction
function isUniswapTransaction(transaction) {
    if (!transaction || !transaction.to) return false;
    
    // Uniswap V2 Router addresses
    const uniswapV2Router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'.toLowerCase();
    // Uniswap V3 Router addresses
    const uniswapV3Router = '0xE592427A0AEce92De3Edee1F18E0157C05861564'.toLowerCase();
    const uniswapV3Router2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'.toLowerCase();
    
    const to = transaction.to.toLowerCase();
    return to === uniswapV2Router || to === uniswapV3Router || to === uniswapV3Router2;
}

// Helper function to detect potential sandwich attack opportunities
function isPotentialSandwich(transaction) {
    if (!isUniswapTransaction(transaction)) return false;
    
    // Check if transaction has significant value (potential large trade)
    // Large trades create price impact that can be exploited
    if (transaction.value) {
        const valueInEth = ethers.utils.formatEther(transaction.value);
        if (parseFloat(valueInEth) > LARGE_TRADE_THRESHOLD_ETH) {
            return true;
        }
    }
    
    // Could also check transaction data for swap function signatures
    // and token amounts, but this requires ABI decoding
    return false;
}

// Helper function to detect potential arbitrage opportunities
function isPotentialArbitrage(transaction) {
    if (!isUniswapTransaction(transaction)) return false;
    
    // Arbitrage detection would require:
    // 1. Monitoring multiple DEXs simultaneously
    // 2. Comparing prices across DEXs
    // 3. Calculating profit after gas costs
    // This is a placeholder for now
    
    return false; // TODO: Implement multi-DEX price comparison
}

// Helper function to detect potential liquidation opportunities
function isPotentialLiquidation(transaction) {
    if (!transaction || !transaction.to) return false;
    
    // Common lending protocol addresses (Aave, Compound, etc.)
    const lendingProtocols = [
        '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', // Aave V2
        '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B', // Compound
        // Add more protocol addresses as needed
    ];
    
    const to = transaction.to.toLowerCase();
    return lendingProtocols.some(addr => addr.toLowerCase() === to);
}

// Function to listen for pending transactions
async function listenForMempool() {
    console.log('👂 Listening to mempool for MEV opportunities...\n');
    
    provider.on('pending', async (txHash) => {
        try {
            const transaction = await provider.getTransaction(txHash);
            
            // Null check for transaction
            if (!transaction) {
                return;
            }
            
            // Check for different MEV opportunities
            let opportunityType = null;
            
            if (isPotentialSandwich(transaction)) {
                opportunityType = 'sandwich';
                console.log(`🥪 Potential Sandwich Attack: ${txHash}`);
            } else if (isPotentialArbitrage(transaction)) {
                opportunityType = 'arbitrage';
                console.log(`💱 Potential Arbitrage: ${txHash}`);
            } else if (isPotentialLiquidation(transaction)) {
                opportunityType = 'liquidation';
                console.log(`⚡ Potential Liquidation: ${txHash}`);
            }
            
            // If an opportunity is detected, calculate profitability
            if (opportunityType) {
                const isProfitable = await calculateProfitability(transaction);
                
                if (isProfitable) {
                    console.log(`✓ Profitable opportunity detected! Type: ${opportunityType}`);
                    
                    // Execute the trade
                    const result = await executeTrade(transaction, opportunityType);
                    
                    // Track results in database
                    await trackResults({
                        txHash,
                        opportunityType,
                        profitable: isProfitable,
                        executed: result.success,
                        timestamp: new Date().toISOString(),
                        ...result
                    });
                } else {
                    console.log(`✗ Not profitable after gas costs. Type: ${opportunityType}`);
                }
            }
        } catch (error) {
            // Silently ignore common errors (transaction not found, etc.)
            if (error.code !== 'CALL_EXCEPTION' && !error.message.includes('transaction not found')) {
                console.error('Error processing transaction:', error.message);
            }
        }
    });
}

// Function to calculate profitability
async function calculateProfitability(transaction) {
    try {
        // Estimate gas cost for the transaction
        const gasPrice = await provider.getGasPrice();
        const estimatedGasLimit = transaction.gasLimit || ethers.BigNumber.from('300000'); // Default estimate
        
        // Calculate gas cost with multiplier for faster execution
        const gasCost = gasPrice.mul(estimatedGasLimit).mul(Math.floor(GAS_PRICE_MULTIPLIER * 100)).div(100);
        
        // Estimate potential profit (simplified calculation)
        // In a real implementation, this would:
        // 1. Simulate the transaction to see price impact
        // 2. Calculate the profit from front-running and back-running
        // 3. Account for slippage and other factors
        
        const transactionValue = transaction.value || ethers.BigNumber.from('0');
        
        // Rough estimate: assume configured profit percentage on transaction value for sandwich attacks
        // This is a simplified heuristic - real calculation requires simulation
        const estimatedProfit = transactionValue.mul(SANDWICH_PROFIT_PERCENTAGE).div(100);
        
        // Net profit = estimated profit - gas cost
        const netProfit = estimatedProfit.sub(gasCost);
        
        console.log(`  Gas Cost: ${ethers.utils.formatEther(gasCost)} ETH`);
        console.log(`  Est. Profit: ${ethers.utils.formatEther(estimatedProfit)} ETH`);
        console.log(`  Net Profit: ${ethers.utils.formatEther(netProfit)} ETH`);
        console.log(`  Threshold: ${ethers.utils.formatEther(MIN_PROFIT_THRESHOLD)} ETH`);
        
        // Return true if net profit exceeds threshold
        return netProfit.gte(MIN_PROFIT_THRESHOLD);
    } catch (error) {
        console.error('Error calculating profitability:', error.message);
        return false;
    }
}

// Function to execute trades on Uniswap
async function executeTrade(transaction, opportunityType) {
    console.log(`🚀 Attempting to execute ${opportunityType} trade...`);
    
    try {
        // TODO: Implement Uniswap V2/V3 integration
        // This requires:
        // 1. Import Uniswap Router ABI
        // 2. Create contract instance
        // 3. Encode swap function calls
        // 4. Calculate optimal amounts and slippage
        
        // For sandwich attacks, you would need to:
        // - Send front-run transaction (buy before victim)
        // - Wait for victim transaction to execute
        // - Send back-run transaction (sell after victim)
        
        // Estimate gas for the trade
        const gasPrice = await provider.getGasPrice();
        const adjustedGasPrice = gasPrice.mul(Math.floor(GAS_PRICE_MULTIPLIER * 100)).div(100);
        
        console.log('  Gas Price:', ethers.utils.formatUnits(adjustedGasPrice, 'gwei'), 'gwei');
        
        // TODO: Prepare transaction parameters
        // const txParams = {
        //     to: UNISWAP_ROUTER_ADDRESS,
        //     data: encodedFunctionData,
        //     gasLimit: estimatedGasLimit,
        //     gasPrice: adjustedGasPrice,
        //     nonce: await wallet.getTransactionCount()
        // };
        
        // TODO: Sign and send transaction
        // const signedTx = await wallet.signTransaction(txParams);
        // const receipt = await provider.sendTransaction(signedTx);
        // await receipt.wait();
        
        // Placeholder response - replace with actual transaction result
        console.log('  ⚠️  Trade execution not fully implemented');
        console.log('  TODO: Add Uniswap Router contract integration');
        
        return {
            success: false,
            reason: 'Not implemented - requires Uniswap ABI integration',
            gasPrice: ethers.utils.formatUnits(adjustedGasPrice, 'gwei')
        };
        
    } catch (error) {
        console.error('Error executing trade:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Function to track results in PostgreSQL
async function trackResults(result) {
    const query = 'INSERT INTO results(data) VALUES($1) RETURNING *';
    const values = [JSON.stringify(result)];
    const res = await client.query(query, values);
    console.log(res.rows[0]);
}

// Start listening to mempool
listenForMempool();

// Graceful shutdown handlers
async function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    
    try {
        // Close PostgreSQL connection
        await client.end();
        console.log('✓ PostgreSQL connection closed');
        
        // Close WebSocket provider
        provider.removeAllListeners();
        await provider.destroy();
        console.log('✓ WebSocket connection closed');
        
        console.log('👋 MEV Bot stopped');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});