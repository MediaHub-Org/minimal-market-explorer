import { ETFS, NAMES } from './names';
import type { ConnStatus, History, Market, Provider, Ticker, Timeframe, YearStats } from './types';

const REST = 'https://api.kraken.com/0/public/';
const WS = 'wss://ws.kraken.com/v2';

/** REST `wsname` uses legacy codes; WebSocket v2 (and our UI) use the common ones. */
const RENAME: Record<string, string> = { XBT: 'BTC', XDG: 'DOGE' };
/** Fiat bases are FX pairs, not assets to explore. */
const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY']);
/** Preferred quote currency per asset, best first. EUR is the default. */
const QUOTES = ['EUR', 'USD', 'USDC', 'USDT', 'BTC', 'ETH'];

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** Kraken returns at most 720 candles per interval, so each timeframe picks one that covers it. */
const TF: Record<Timeframe, { interval: number; span: number }> = {
  '1D': { interval: 5, span: DAY }, // 720 × 5m  ≈ 2.5 days
  '1W': { interval: 15, span: 7 * DAY }, // 720 × 15m ≈ 7.5 days
  '1M': { interval: 240, span: 30 * DAY }, // 720 × 4h = 120 days
  '1Y': { interval: 1440, span: 365 * DAY }, // 720 × 1d ≈ 2 years
  ALL: { interval: 10080, span: Infinity }, // 720 × 1w ≈ 13.8 years
};

// Public REST is rate limited (~1 req/s); space calls out instead of getting throttled.
const GAP = 1000;
let nextSlot = 0;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const delay = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + GAP;
  if (delay) await wait(delay, signal);
  const res = await fetch(REST + path, { signal });
  if (!res.ok) throw new Error(`Kraken responded with HTTP ${res.status}`);
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
  const best = new Map<string, { m: Market; rank: number }>();
  const add = (pairs: Record<string, RawPair>, tokenizedClass: boolean) => {
    for (const p of Object.values(pairs)) {
      // post_only xStocks still quote real prices; they just limit order types.
      const listed = p.status === 'online' || (tokenizedClass && p.status === 'post_only');
      if (!listed || !p.wsname) continue;
      const [base, quote] = p.wsname.split('/').map((s) => RENAME[s] ?? s);
      if (!base || !quote || FIAT.has(base)) continue;
      const r = QUOTES.indexOf(quote);
      const rank = r < 0 ? QUOTES.length : r;
      const cur = best.get(base);
      if (cur && cur.rank <= rank) continue;
      const type = !tokenizedClass ? 'crypto' : ETFS.has(base) ? 'etf' : 'stock';
      best.set(base, {
        rank,
        m: { type, symbol: `${base}/${quote}`, base, quote, name: NAMES[base] ?? base, decimals: p.pair_decimals },
      });
    }
  };
  add(crypto, false);
  add(tokenized, true);
  return [...best.values()].map((b) => b.m);
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

function streamTickers(
  symbols: string[],
  onTicker: (symbol: string, t: Ticker) => void,
  onStatus: (s: ConnStatus) => void,
) {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let watchdog = 0;
  let retry = 0;

  // Kraken sends a heartbeat every second; silence means the connection is dead.
  const kick = () => {
    clearTimeout(watchdog);
    watchdog = window.setTimeout(() => ws?.close(), 15_000);
  };

  const open = () => {
    onStatus(attempt ? 'reconnecting' : 'connecting');
    const sock = (ws = new WebSocket(WS));
    kick();
    sock.onopen = () => {
      attempt = 0;
      for (let i = 0; i < symbols.length; i += 250) {
        sock.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: symbols.slice(i, i + 250) } }));
      }
    };
    sock.onmessage = (e) => {
      kick();
      const msg = JSON.parse(e.data as string);
      if (msg.channel !== 'ticker') return;
      onStatus('live');
      for (const d of msg.data as RawTicker[]) {
        onTicker(d.symbol, {
          last: d.last, change: d.change, changePct: d.change_pct,
          high: d.high, low: d.low, volume: d.volume, vwap: d.vwap,
        });
      }
    };
    sock.onerror = () => sock.close();
    sock.onclose = () => {
      if (ws !== sock) return;
      clearTimeout(watchdog);
      ws = null;
      onStatus(navigator.onLine ? 'reconnecting' : 'offline');
      retry = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt++));
    };
  };

  // Back online: skip the remaining backoff.
  window.addEventListener('online', () => {
    if (ws) return;
    clearTimeout(retry);
    open();
  });
  open();
}

/** [time (s), open, high, low, close, ...] */
type Candle = [number, string, string, string, string, ...unknown[]];

/** Up to the latest 720 candles. Tokenized assets need their asset class in the request. */
async function ohlc(m: Market, interval: number, signal?: AbortSignal): Promise<Candle[]> {
  const assetClass = m.type === 'crypto' ? '' : '&asset_class=tokenized_asset';
  const res = await get<Record<string, Candle[] | number>>(
    `OHLC?pair=${encodeURIComponent(m.symbol)}&interval=${interval}${assetClass}`,
    signal,
  );
  const rows = Object.entries(res).find(([k]) => k !== 'last')?.[1];
  return Array.isArray(rows) ? rows : [];
}

async function history(m: Market, tf: Timeframe, signal?: AbortSignal): Promise<History> {
  const { interval, span } = TF[tf];
  const rows = await ohlc(m, interval, signal);
  if (!rows.length) return { points: [], partial: true };
  const now = Date.now();
  const from = now - span;
  const candles = rows.filter((r) => r[0] * 1000 >= from && Number.isFinite(Number(r[4])));
  // One point per candle close (the last, still-open candle closes "now"),
  // preceded by the first candle's open so the line covers the whole range.
  const points: [number, number][] = candles.length
    ? [
        [candles[0][0] * 1000, Number(candles[0][1])],
        ...candles.map((r): [number, number] => [Math.min(now, (r[0] + interval * 60) * 1000), Number(r[4])]),
      ]
    : [];
  // Partial if the first candle starts noticeably after the requested window does
  // (newly listed asset), or the 720-candle cap cut off older history.
  const partial = span === Infinity ? rows.length >= 720 : !points.length || points[0][0] > from + 2 * interval * MIN;
  return { points, partial };
}

async function yearStats(m: Market, signal?: AbortSignal): Promise<YearStats> {
  const rows = (await ohlc(m, 1440, signal)).filter((r) => Number.isFinite(Number(r[2])) && Number.isFinite(Number(r[3])));
  if (!rows.length) throw new Error('No daily data');
  const from = Date.now() - 365 * DAY;
  const year = rows.filter((r) => r[0] * 1000 >= from);
  const range = year.length ? year : rows.slice(-1);
  const s: YearStats = {
    low: Math.min(...range.map((r) => Number(r[3]))),
    high: Math.max(...range.map((r) => Number(r[2]))),
  };
  const first = rows[0][0] * 1000;
  if (first > from + 2 * DAY) s.partialSince = first;
  // Fewer than 720 daily candles means this is the market's entire history on Kraken.
  if (rows.length < 720) {
    const top = rows.reduce((a, b) => (Number(b[2]) > Number(a[2]) ? b : a));
    s.firstAt = first;
    s.allHigh = Number(top[2]);
    s.allHighAt = top[0] * 1000;
  }
  return s;
}

export const kraken: Provider = { name: 'Kraken', loadMarkets, streamTickers, history, yearStats };
