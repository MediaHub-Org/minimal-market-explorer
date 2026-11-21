export type AssetType = 'crypto' | 'stock' | 'etf';
export type ExchangeId = 'kraken' | 'binance' | 'coinbase';
export type QuotePref = 'EUR' | 'USD';

/** A tradable market pair on one exchange, e.g. BTC/EUR. */
export interface Market {
  type: AssetType;
  id: string; // the exchange's own pair id: "BTC/EUR", "BTCEUR", "BTC-EUR"
  symbol: string; // display pair, "BTC/EUR"
  base: string; // traded asset, "BTC" (or "AAPLx" for a tokenized stock)
  quote: string; // quote currency, "EUR"
  name: string; // human name, "Bitcoin" (falls back to the symbol)
  decimals: number; // price precision of the pair
}

/** Rolling 24-hour market statistics. */
export interface Ticker {
  last: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number; // in base asset
  quoteVolume: number; // in quote currency
}

export type Timeframe = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y', 'ALL'];

export interface History {
  points: [time: number, close: number][]; // ms since epoch, ascending
  /** True when the provider has less history than the timeframe asks for. */
  partial: boolean;
}

/** Derived from the provider's daily candles. */
export interface YearStats {
  low: number; // lowest price over the past year
  high: number;
  /** First daily candle when the provider has less than a year of data. */
  partialSince?: number;
  /** Set only when the provider's whole history fits in the request. */
  firstAt?: number; // first candle = "on the exchange since"
  allHigh?: number;
  allHighAt?: number;
}

export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** The whole surface an exchange has to implement. */
export interface Provider {
  id: ExchangeId;
  name: string;
  /** Every candidate spot pair (supported quotes only); the app picks one per asset. */
  loadMarkets(): Promise<Market[]>;
  /** Streams live tickers for the given pair ids. Returns a function that stops the stream. */
  streamTickers(ids: string[], onTicker: (id: string, t: Ticker) => void, onStatus: (s: ConnStatus) => void): () => void;
  history(market: Market, tf: Timeframe, signal?: AbortSignal): Promise<History>;
  yearStats(market: Market, signal?: AbortSignal): Promise<YearStats>;
  tradeUrl(market: Market): string;
  /** Optional quote preference per currency, when the default order picks illiquid markets. */
  quoteOrder?: Partial<Record<QuotePref, string[]>>;
}
