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
};
