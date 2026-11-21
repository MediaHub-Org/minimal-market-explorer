export type AssetType = 'crypto' | 'stock' | 'etf';

/** A tradable market pair, e.g. BTC/EUR. One per underlying asset. */
export interface Market {
  type: AssetType;
  symbol: string; // market pair, "BTC/EUR"
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
  vwap: number;
}

export type Timeframe = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y', 'ALL'];

export interface History {
  points: [time: number, close: number][]; // ms since epoch, ascending
  /** True when the provider has less history than the timeframe asks for. */
  partial: boolean;
}

export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** The whole surface a market-data provider has to implement. */
export interface Provider {
  name: string;
  loadMarkets(): Promise<Market[]>;
  streamTickers(
    symbols: string[],
    onTicker: (symbol: string, t: Ticker) => void,
    onStatus: (s: ConnStatus) => void,
  ): void;
  history(market: Market, tf: Timeframe, signal?: AbortSignal): Promise<History>;
}
