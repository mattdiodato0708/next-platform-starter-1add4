/**
 * Lending protocol configuration
 * Addresses for supported lending platforms
 */

const protocols = {
  aaveV3: {
    name: 'Aave V3',
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    poolDataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    flashLoanFee: 0.0009, // 0.09%
  },

  compound: {
    name: 'Compound V2',
    comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    oracle: '0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5',
    // Individual cToken addresses
    cTokens: {
      cETH: '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5',
      cUSDC: '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
      cDAI: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
    },
  },

  maker: {
    name: 'MakerDAO',
    cdpManager: '0x5ef30b9986345249bc32d8928B7ee64DE9435E39',
    vat: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
    spot: '0x65C79fcB50Ca1594B025960e539eD7A9a6D434A3',
    // Collateral types
    ilks: {
      ETH_A: '0x4554482d41000000000000000000000000000000000000000000000000000000',
      ETH_B: '0x4554482d42000000000000000000000000000000000000000000000000000000',
      ETH_C: '0x4554482d43000000000000000000000000000000000000000000000000000000',
    },
  },
};

// Helper function to get protocol by name
function getProtocolByName(name) {
  return protocols[name];
}

// Get all lending protocols
function getAllProtocols() {
  return Object.entries(protocols).map(([key, protocol]) => ({
    key,
    ...protocol,
  }));
}

module.exports = {
  protocols,
  getProtocolByName,
  getAllProtocols,
};
