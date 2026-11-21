import { NAMES } from '../names';
import type { History, Market, Provider, Timeframe, YearStats } from '../types';
import { DAY, decimalsOf, FIAT, liveSocket, QUOTES, spacer, toHistory, toYearStats, type Candle } from './common';

const REST = 'https://api.exchange.coinbase.com/';
const WS = 'wss://ws-feed.exchange.coinbase.com';

/** Coinbase returns at most 300 candles per request, so longer ranges are fetched in pages. */
const TF: Record<Timeframe, { granularity: number; span: number }> = {
  '1D': { granularity: 300, span: DAY },
  '1W': { granularity: 3600, span: 7 * DAY },
  '1M': { granularity: 21600, span: 30 * DAY },
  '1Y': { granularity: 86400, span: 365 * DAY },
  ALL: { granularity: 86400, span: Infinity },
};
const PAGE = 300;
const MAX_PAGES = 20; // 20 × 300 days ≈ 16 years of daily candles

// Public endpoints allow ~10 requests/s.
const slot = spacer(150);

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  await slot(signal);
  const res = await fetch(REST + path, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ? `Coinbase: ${body.message}` : `Coinbase HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface RawProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  quote_increment: string;
  status: string;
  trading_disabled: boolean;
  cancel_only: boolean;
}

async function loadMarkets(): Promise<Market[]> {
  const products = await get<RawProduct[]>('products');
  return products
    .filter((p) => p.status === 'online' && !p.trading_disabled && !p.cancel_only)
    .filter((p) => QUOTES.has(p.quote_currency) && !FIAT.has(p.base_currency))
    .map((p) => ({
      type: 'crypto' as const,
      id: p.id,
      symbol: `${p.base_currency}/${p.quote_currency}`,
      base: p.base_currency,
      quote: p.quote_currency,
      name: NAMES[p.base_currency] ?? p.base_currency,
      decimals: decimalsOf(p.quote_increment),
    }));
}

interface RawTicker {
  type: string;
  product_id: string;
  price: string;
  open_24h: string;
  high_24h: string;
  low_24h: string;
  volume_24h: string;
}

// The ticker channel sends each product's latest ticker right after subscribing, then one per trade.
const streamTickers: Provider['streamTickers'] = (ids, onTicker, onStatus) =>
  liveSocket({
    url: WS,
    onStatus,
    onOpen: (ws) =>
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          product_ids: ids,
          // A one-product heartbeat keeps quiet periods from looking like a dead connection.
          channels: ['ticker', { name: 'heartbeat', product_ids: ids.slice(0, 1) }],
        }),
      ),
    onMessage: (raw) => {
      const d = raw as RawTicker;
      if (d.type !== 'ticker') return;
      onStatus('live');
      const last = +d.price;
      const open = +d.open_24h;
      const volume = +d.volume_24h;
      onTicker(d.product_id, {
        last, high: +d.high_24h, low: +d.low_24h, volume, quoteVolume: volume * last,
        change: last - open,
        changePct: open ? ((last - open) / open) * 100 : 0,
      });
    },
  });

/** Candles from `from` to now, newest pages first, stopping when a page comes back empty. */
async function candles(m: Market, granularity: number, from: number, signal?: AbortSignal): Promise<Candle[]> {
  const out: Candle[] = [];
  let end = Date.now();
  for (let page = 0; page < MAX_PAGES && end > from; page++) {
    const start = Math.max(from, end - PAGE * granularity * 1000);
    const rows = await get<[number, number, number, number, number, number][]>(
      `products/${m.id}/candles?granularity=${granularity}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`,
      signal,
    );
    if (!rows.length) break;
    // [time, low, high, open, close, volume], newest first
    for (const r of rows) out.push({ t: r[0] * 1000, l: r[1], h: r[2], o: r[3], c: r[4] });
    end = start;
  }
  const seen = new Set<number>();
  return out.filter((k) => !seen.has(k.t) && seen.add(k.t)).sort((a, b) => a.t - b.t);
}

async function history(m: Market, tf: Timeframe, signal?: AbortSignal): Promise<History> {
  const { granularity, span } = TF[tf];
  const rows = await candles(m, granularity, span === Infinity ? 0 : Date.now() - span, signal);
  return toHistory(rows, granularity * 1000, span, false);
}

async function yearStats(m: Market, signal?: AbortSignal): Promise<YearStats> {
  // The full history would take many requests; crypto gets its all-time high from CoinGecko instead.
  return toYearStats(await candles(m, 86400, Date.now() - 366 * DAY, signal), false);
}

export const coinbase: Provider = {
  id: 'coinbase',
  name: 'Coinbase',
  loadMarkets,
  streamTickers,
  history,
  yearStats,
  tradeUrl: (m) => `https://www.coinbase.com/advanced-trade/spot/${m.id}`,
};
