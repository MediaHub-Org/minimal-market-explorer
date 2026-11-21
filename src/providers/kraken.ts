import { ETFS, NAMES } from '../names';
import type { History, Market, Provider, Timeframe, YearStats } from '../types';
import { DAY, FIAT, liveSocket, MIN, QUOTES, spacer, toHistory, toYearStats, type Candle } from './common';

const REST = 'https://api.kraken.com/0/public/';
const WS = 'wss://ws.kraken.com/v2';

/** REST `wsname` uses legacy codes; WebSocket v2 (and our UI) use the common ones. */
const RENAME: Record<string, string> = { XBT: 'BTC', XDG: 'DOGE' };

/** Kraken returns at most 720 candles per interval, so each timeframe picks one that covers it. */
const TF: Record<Timeframe, { interval: number; span: number }> = {
  '1D': { interval: 5, span: DAY }, // 720 × 5m  ≈ 2.5 days
  '1W': { interval: 15, span: 7 * DAY }, // 720 × 15m ≈ 7.5 days
  '1M': { interval: 240, span: 30 * DAY }, // 720 × 4h = 120 days
  '1Y': { interval: 1440, span: 365 * DAY }, // 720 × 1d ≈ 2 years
  ALL: { interval: 10080, span: Infinity }, // 720 × 1w ≈ 13.8 years
};
const CAP = 720;

// Public REST is rate limited (~1 req/s).
const slot = spacer(1000);

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  await slot(signal);
  const res = await fetch(REST + path, { signal });
  if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
  const body = (await res.json()) as { error?: string[]; result: T };
  if (body.error?.length) {
    throw new Error(body.error.some((e) => e.includes('Too many')) ? 'Kraken rate limit reached, try again shortly' : body.error.join(', '));
  }
  return body.result;
}

interface RawPair {
  wsname?: string;
  status: string;
  pair_decimals: number;
}

async function loadMarkets(): Promise<Market[]> {
  // Crypto is the default asset class; tokenized stocks and ETFs (xStocks) must be asked for.
  const crypto = await get<Record<string, RawPair>>('AssetPairs');
  const tokenized = await get<Record<string, RawPair>>('AssetPairs?aclass_base=tokenized_asset');
  const out = new Map<string, Market>();
  const add = (pairs: Record<string, RawPair>, tokenizedClass: boolean) => {
    for (const p of Object.values(pairs)) {
      // post_only xStocks still quote real prices; they just limit order types.
      const listed = p.status === 'online' || (tokenizedClass && p.status === 'post_only');
      if (!listed || !p.wsname) continue;
      const [base, quote] = p.wsname.split('/').map((s) => RENAME[s] ?? s);
      if (!base || !quote || FIAT.has(base) || !QUOTES.has(quote)) continue;
      const id = `${base}/${quote}`; // WebSocket v2 symbol; REST OHLC accepts it too
      const type = !tokenizedClass ? 'crypto' : ETFS.has(base) ? 'etf' : 'stock';
      out.set(id, { type, id, symbol: id, base, quote, name: NAMES[base] ?? base, decimals: p.pair_decimals });
    }
  };
  add(crypto, false);
  add(tokenized, true);
  return [...out.values()];
}

interface RawTicker {
  symbol: string;
  last: number;
  change: number;
  change_pct: number;
  high: number;
  low: number;
  volume: number;
  vwap: number;
}

const streamTickers: Provider['streamTickers'] = (ids, onTicker, onStatus) =>
  liveSocket({
    url: WS,
    onStatus,
    onOpen: (ws) => {
      for (let i = 0; i < ids.length; i += 250) {
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ids.slice(i, i + 250) } }));
      }
    },
    onMessage: (raw) => {
      const msg = raw as { channel?: string; data?: RawTicker[] };
      if (msg.channel !== 'ticker' || !msg.data) return;
      onStatus('live');
      for (const d of msg.data) {
        onTicker(d.symbol, {
          last: d.last, change: d.change, changePct: d.change_pct, high: d.high, low: d.low,
          volume: d.volume, quoteVolume: d.volume * d.vwap,
        });
      }
    },
  });

/** Up to the latest 720 candles. Tokenized assets need their asset class in the request. */
async function ohlc(m: Market, interval: number, signal?: AbortSignal): Promise<Candle[]> {
  const assetClass = m.type === 'crypto' ? '' : '&asset_class=tokenized_asset';
  const res = await get<Record<string, unknown>>(`OHLC?pair=${encodeURIComponent(m.id)}&interval=${interval}${assetClass}`, signal);
  const rows = Object.entries(res).find(([k]) => k !== 'last')?.[1];
  if (!Array.isArray(rows)) return [];
  return (rows as [number, string, string, string, string][]).map((r) => ({
    t: r[0] * 1000, o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]),
  }));
}

async function history(m: Market, tf: Timeframe, signal?: AbortSignal): Promise<History> {
  const { interval, span } = TF[tf];
  const rows = await ohlc(m, interval, signal);
  return toHistory(rows, interval * MIN, span, rows.length >= CAP);
}

async function yearStats(m: Market, signal?: AbortSignal): Promise<YearStats> {
  const daily = await ohlc(m, 1440, signal);
  return toYearStats(daily, daily.length < CAP);
}

export const kraken: Provider = {
  id: 'kraken',
  name: 'Kraken',
  loadMarkets,
  streamTickers,
  history,
  yearStats,
  tradeUrl: (m) => `https://pro.kraken.com/app/trade/${m.base.toLowerCase()}-${m.quote.toLowerCase()}`,
};
