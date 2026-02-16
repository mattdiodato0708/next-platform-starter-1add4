-- MEV Bot Database Schema
-- PostgreSQL database for tracking opportunities and executions

-- Create opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  strategy VARCHAR(50) NOT NULL,
  detected_at TIMESTAMP NOT NULL,
  tx_hash VARCHAR(66),
  profit_usd DECIMAL(18,2),
  executed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create executions table
CREATE TABLE IF NOT EXISTS executions (
  id SERIAL PRIMARY KEY,
  opportunity_id INTEGER REFERENCES opportunities(id),
  bundle_hash VARCHAR(66),
  block_number INTEGER,
  gas_used BIGINT,
  gas_price BIGINT,
  profit_usd DECIMAL(18,2),
  status VARCHAR(20) NOT NULL,
  error TEXT,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_opportunities_strategy ON opportunities(strategy);
CREATE INDEX IF NOT EXISTS idx_opportunities_executed ON opportunities(executed);
CREATE INDEX IF NOT EXISTS idx_opportunities_detected_at ON opportunities(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_block ON executions(block_number);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_opportunity ON executions(opportunity_id);

-- Create view for strategy performance
CREATE OR REPLACE VIEW strategy_performance AS
SELECT 
  strategy,
  COUNT(*) as total_opportunities,
  SUM(CASE WHEN executed THEN 1 ELSE 0 END) as successful_executions,
  SUM(CASE WHEN executed THEN profit_usd ELSE 0 END) as total_profit,
  AVG(CASE WHEN executed THEN profit_usd ELSE NULL END) as avg_profit,
  (SUM(CASE WHEN executed THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT * 100) as success_rate
FROM opportunities
GROUP BY strategy;

-- Create view for daily performance
CREATE OR REPLACE VIEW daily_performance AS
SELECT 
  DATE(detected_at) as date,
  COUNT(*) as total_opportunities,
  SUM(CASE WHEN executed THEN 1 ELSE 0 END) as successful_executions,
  SUM(CASE WHEN executed THEN profit_usd ELSE 0 END) as total_profit
FROM opportunities
GROUP BY DATE(detected_at)
ORDER BY date DESC;

-- Insert sample data (optional, for testing)
-- INSERT INTO opportunities (strategy, detected_at, tx_hash, profit_usd, executed)
-- VALUES ('Sandwich', NOW(), '0x1234...', 125.50, TRUE);
