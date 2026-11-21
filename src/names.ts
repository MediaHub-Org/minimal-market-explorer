// Kraken's public API exposes tickers only, not asset names.
// A short list of well-known names; anything else falls back to its symbol.
export const NAMES: Record<string, string> = {
  AAVE: 'Aave', ADA: 'Cardano', AERO: 'Aerodrome', AKT: 'Akash', ALGO: 'Algorand', APE: 'ApeCoin',
  APT: 'Aptos', AR: 'Arweave', ARB: 'Arbitrum', ATOM: 'Cosmos', AVAX: 'Avalanche', AXS: 'Axie Infinity',
  BAT: 'Basic Attention Token', BCH: 'Bitcoin Cash', BLUR: 'Blur', BNB: 'BNB', BONK: 'Bonk', BTC: 'Bitcoin',
  CHZ: 'Chiliz', COMP: 'Compound', CRV: 'Curve', DAI: 'Dai', DASH: 'Dash', DOGE: 'Dogecoin', DOT: 'Polkadot',
  DYDX: 'dYdX', EGLD: 'MultiversX', ENA: 'Ethena', ENS: 'Ethereum Name Service', EOS: 'EOS',
  ETC: 'Ethereum Classic', ETH: 'Ethereum', ETHFI: 'Ether.fi', EUL: 'Euler', FET: 'Artificial Superintelligence Alliance',
  FIL: 'Filecoin', FLOKI: 'Floki', FLOW: 'Flow', FLR: 'Flare', GALA: 'Gala', GRT: 'The Graph', HBAR: 'Hedera',
  ICP: 'Internet Computer', IMX: 'Immutable', INJ: 'Injective', JASMY: 'JasmyCoin', JTO: 'Jito', JUP: 'Jupiter',
  KAS: 'Kaspa', KSM: 'Kusama', LDO: 'Lido DAO', LINK: 'Chainlink', LRC: 'Loopring', LTC: 'Litecoin',
  MANA: 'Decentraland', MINA: 'Mina', MKR: 'Maker', MOG: 'Mog Coin', NEAR: 'NEAR Protocol', ONDO: 'Ondo',
  OP: 'Optimism', PAXG: 'PAX Gold', PENDLE: 'Pendle', PEPE: 'Pepe', POL: 'Polygon', PYTH: 'Pyth Network',
  QNT: 'Quant', RENDER: 'Render', RUNE: 'THORChain', SAND: 'The Sandbox', SEI: 'Sei', SHIB: 'Shiba Inu',
  SNX: 'Synthetix', SOL: 'Solana', STRK: 'Starknet', STX: 'Stacks', SUI: 'Sui', TAO: 'Bittensor', TIA: 'Celestia',
  TON: 'Toncoin', TRX: 'TRON', TRUMP: 'Official Trump', UNI: 'Uniswap', USDC: 'USD Coin', USDT: 'Tether',
  USDG: 'Global Dollar', PYUSD: 'PayPal USD', RLUSD: 'Ripple USD', EURC: 'Euro Coin', WIF: 'dogwifhat',
  WLD: 'Worldcoin', XLM: 'Stellar', XMR: 'Monero', XRP: 'XRP', XTZ: 'Tezos', YFI: 'yearn.finance',
  ZEC: 'Zcash', ZRX: '0x', HYPE: 'Hyperliquid', KAITO: 'Kaito', VIRTUAL: 'Virtuals Protocol', W: 'Wormhole',
  XAUT: 'Tether Gold',

  // Tokenized stocks (xStocks): tokens tracking the share, not the share itself.
  AAPLx: 'Apple', ABBVx: 'AbbVie', ABTx: 'Abbott', ACNx: 'Accenture', ADBEx: 'Adobe', AMATx: 'Applied Materials',
  AMDx: 'AMD', AMZNx: 'Amazon', ANETx: 'Arista Networks', APPx: 'AppLovin', ARMx: 'Arm Holdings', ASMLx: 'ASML',
  AVGOx: 'Broadcom', AZNx: 'AstraZeneca', BACx: 'Bank of America', 'BRK.Bx': 'Berkshire Hathaway',
  CEGx: 'Constellation Energy', COINx: 'Coinbase', CMCSAx: 'Comcast', CRMx: 'Salesforce', CRWDx: 'CrowdStrike',
  CSCOx: 'Cisco', CVXx: 'Chevron', DELLx: 'Dell', DHRx: 'Danaher', ETNx: 'Eaton', GEVx: 'GE Vernova',
  GMEx: 'GameStop', GOOGLx: 'Alphabet', GSx: 'Goldman Sachs', HONx: 'Honeywell', HOODx: 'Robinhood', IBMx: 'IBM',
  INTCx: 'Intel', JNJx: 'Johnson & Johnson', JPMx: 'JPMorgan Chase', KLACx: 'KLA', KOx: 'Coca-Cola', LINx: 'Linde',
  LLYx: 'Eli Lilly', LRCXx: 'Lam Research', MCDx: "McDonald's", MDTx: 'Medtronic', METAx: 'Meta Platforms',
  MRKx: 'Merck', MRVLx: 'Marvell', MSFTx: 'Microsoft', MSTRx: 'Strategy', MUx: 'Micron', NETx: 'Cloudflare',
  NFLXx: 'Netflix', NVDAx: 'NVIDIA', NVOx: 'Novo Nordisk', ORCLx: 'Oracle', PANWx: 'Palo Alto Networks',
  PEPx: 'PepsiCo', PFEx: 'Pfizer', PGx: 'Procter & Gamble', PLTRx: 'Palantir', PMx: 'Philip Morris',
  PYPLx: 'PayPal', SHOPx: 'Shopify', TMOx: 'Thermo Fisher', TMUSx: 'T-Mobile US', TSLAx: 'Tesla',
  TSMx: 'TSMC', UBERx: 'Uber', UNHx: 'UnitedHealth', Vx: 'Visa', XOMx: 'Exxon Mobil', CRCLx: 'Circle',
  PLx: 'Planet Labs', SMCIx: 'Super Micro Computer', MRNAx: 'Moderna', RBLXx: 'Roblox', SPCEx: 'Virgin Galactic',

  // Tokenized ETFs and ETPs (short names; the ticker identifies the fund).
  SPYx: 'S&P 500 SPDR', VOOx: 'S&P 500 Vanguard', QQQx: 'Nasdaq-100', VTIx: 'US Total Market',
  VTx: 'World Total Market', VXUSx: 'International ex-US', IEMGx: 'Emerging Markets', IWMx: 'Russell 2000',
  IJRx: 'S&P Small-Cap 600', VUGx: 'US Growth', VGKx: 'Europe', SCHFx: 'Intl Developed', FEZx: 'Euro Stoxx 50',
  EWGx: 'Germany', EWQx: 'France', EWUx: 'United Kingdom', EWYx: 'South Korea', DAXx: 'Germany DAX',
  SMHx: 'Semiconductors VanEck', SOXXx: 'Semiconductors iShares', XLEx: 'US Energy', XOPx: 'Oil & Gas E&P',
  ITAx: 'Aerospace & Defense', URAx: 'Uranium', COPXx: 'Copper Miners', GDXx: 'Gold Miners',
  NLRx: 'Uranium & Nuclear', MOOx: 'Agribusiness', GLDx: 'Gold', SLVx: 'Silver', PPLTx: 'Platinum',
  PALLx: 'Palladium', SGOVx: 'US T-Bills 0-3M', TBLLx: 'US Treasury Collateral', JPSTx: 'Ultra-Short Income',
  JAAAx: 'AAA CLOs', TQQQx: 'Nasdaq-100 3× Long', SOXLx: 'Semiconductors 3× Long', BITXx: 'Bitcoin 2× Long',};

/** Tokenized assets that are funds (ETFs/ETPs) rather than company shares. */
export const ETFS = new Set([
  'SPYx', 'VOOx', 'QQQx', 'VTIx', 'VTx', 'VXUSx', 'IEMGx', 'IWMx', 'IJRx', 'VUGx', 'VGKx', 'SCHFx', 'FEZx',
  'EWGx', 'EWQx', 'EWUx', 'EWYx', 'DAXx', 'SMHx', 'SOXXx', 'XLEx', 'XOPx', 'ITAx', 'URAx', 'COPXx', 'GDXx',
  'NLRx', 'MOOx', 'GLDx', 'SLVx', 'PPLTx', 'PALLx', 'SGOVx', 'TBLLx', 'JPSTx', 'JAAAx', 'TQQQx', 'SOXLx',
  'BITXx', 'FAAAx', 'FLQMx', 'FSMLx', 'FGDLx', 'FLBLx', 'IQMx',
]);
