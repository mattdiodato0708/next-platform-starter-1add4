/**
 * DEX configuration
 * Router and factory addresses for supported DEXes
 */

const dexes = {
  uniswapV2: {
    name: 'Uniswap V2',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    fee: 0.003, // 0.3%
    version: 2,
  },
  
  uniswapV3: {
    name: 'Uniswap V3',
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    fees: [0.0001, 0.0005, 0.003, 0.01], // 0.01%, 0.05%, 0.3%, 1%
    version: 3,
  },

  sushiswap: {
    name: 'SushiSwap',
    router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    fee: 0.003, // 0.3%
    version: 2,
  },

  // Additional DEXes can be added here
  // pancakeswap: { ... },
  // curve: { ... },
  // balancer: { ... },
};

// Helper function to get DEX by name
function getDexByName(name) {
  return dexes[name];
}

// Get all V2-compatible DEXes
function getV2Dexes() {
  return Object.entries(dexes)
    .filter(([_, dex]) => dex.version === 2)
    .map(([key, dex]) => ({ key, ...dex }));
}

// Get all V3-compatible DEXes
function getV3Dexes() {
  return Object.entries(dexes)
    .filter(([_, dex]) => dex.version === 3)
    .map(([key, dex]) => ({ key, ...dex }));
}

module.exports = {
  dexes,
  getDexByName,
  getV2Dexes,
  getV3Dexes,
};
