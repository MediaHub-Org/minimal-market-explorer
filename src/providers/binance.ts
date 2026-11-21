import { NAMES } from '../names';
import type { History, Market, Provider, Ticker, Timeframe, YearStats } from '../types';
import { DAY, decimalsOf, FIAT, liveSocket, MIN, QUOTES, spacer, toHistory, toYearStats, type Candle } from './common';

const REST = 'https://api.binance.com/api/v3/';
const WS = 'wss://stream.binance.com:9443/ws/!miniTicker@arr'; // every pair that changed, once per second

/** Binance returns up to 1000 klines per request. */
const TF: Record<Timeframe, { interval: string; ms: number; span: number; limit: number }> = {
  '1D': { interval: '5m', ms: 5 * MIN, span: DAY, limit: 300 },
  '1W': { interval: '15m', ms: 15 * MIN, span: 7 * DAY, limit: 700 },
  '1M': { interval: '4h', ms: 240 * MIN, span: 30 * DAY, limit: 200 },
  '1Y': { interval: '1d', ms: DAY, span: 365 * DAY, limit: 370 },
  ALL: { interval: '1w', ms: 7 * DAY, span: Infinity, limit: 1000 },
};

const slot = spacer(100);

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  await slot(signal);
  const res = await fetch(REST + path, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.msg ? `Binance: ${body.msg}` : `Binance HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface RawSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  filters: { filterType: string; tickSize?: string }[];
}

async function loadMarkets(): Promise<Market[]> {
  const info = await get<{ symbols: RawSymbol[] }>('exchangeInfo?permissions=SPOT&symbolStatus=TRADING');
  return info.symbols
    .filter((s) => QUOTES.has(s.quoteAsset) && !FIAT.has(s.baseAsset))
    .map((s) => {
      const tick = s.filters.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? '0.01';
      return {
        type: 'crypto' as const,
        id: s.symbol,
        symbol: `${s.baseAsset}/${s.quoteAsset}`,
        base: s.baseAsset,
        quote: s.quoteAsset,
        name: NAMES[s.baseAsset] ?? s.baseAsset,
        decimals: decimalsOf(tick),
      };
    });
}

const ticker = (last: number, open: number, high: number, low: number, volume: number, quoteVolume: number): Ticker => ({
  last, high, low, volume, quoteVolume,
  change: last - open,
  changePct: open ? ((last - open) / open) * 100 : 0,
});

const streamTickers: Provider['streamTickers'] = (ids, onTicker, onStatus) => {
  const want = new Set(ids);
  // The stream only sends pairs that changed; start from a full REST snapshot.
  const snapshot = () =>
    get<{ symbol: string; openPrice: string; highPrice: string; lowPrice: string; lastPrice: string; volume: string; quoteVolume: string }[]>(
      'ticker/24hr?type=MINI',
    )
      .then((all) => {
        for (const r of all) {
          if (want.has(r.symbol)) onTicker(r.symbol, ticker(+r.lastPrice, +r.openPrice, +r.highPrice, +r.lowPrice, +r.volume, +r.quoteVolume));
        }
      })
      .catch(() => {});
  return liveSocket({
    url: WS,
    onStatus,
    onOpen: () => void snapshot(),
    onMessage: (raw) => {
      if (!Array.isArray(raw)) return;
      onStatus('live');
      for (const x of raw as { s: string; c: string; o: string; h: string; l: string; v: string; q: string }[]) {
        if (want.has(x.s)) onTicker(x.s, ticker(+x.c, +x.o, +x.h, +x.l, +x.v, +x.q));
      }
    },
  });
};

async function klines(m: Market, interval: string, limit: number, signal?: AbortSignal): Promise<Candle[]> {
  const rows = await get<[number, string, string, string, string][]>(
    `klines?symbol=${m.id}&interval=${interval}&limit=${limit}`,
    signal,
  );
  return rows.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
}

async function history(m: Market, tf: Timeframe, signal?: AbortSignal): Promise<History> {
  const { interval, ms, span, limit } = TF[tf];
  const rows = await klines(m, interval, limit, signal);
  return toHistory(rows, ms, span, rows.length >= limit);
}

async function yearStats(m: Market, signal?: AbortSignal): Promise<YearStats> {
  const daily = await klines(m, '1d', 1000, signal);
  return toYearStats(daily, daily.length < 1000);
}

export const binance: Provider = {
  id: 'binance',
  name: 'Binance',
  loadMarkets,
  streamTickers,
  history,
  yearStats,
  tradeUrl: (m) => `https://www.binance.com/en/trade/${m.base}_${m.quote}?type=spot`,
  // Binance's USD pairs are new and thin; its liquid dollar markets are USDT and USDC.
  quoteOrder: { USD: ['USDT', 'USDC', 'USD', 'EUR', 'BTC', 'ETH'] },
};
