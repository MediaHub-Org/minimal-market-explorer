// Helpers shared by the exchange providers.
import type { ConnStatus, History, QuotePref, YearStats } from '../types';

export const MIN = 60_000;
export const DAY = 24 * 60 * MIN;

/** Fiat bases are FX pairs, not assets to explore. */
export const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY']);
/** Quote currencies we load; everything else (TRY, GBP, …) is skipped. */
export const QUOTES = new Set(['EUR', 'USD', 'USDC', 'USDT', 'BTC', 'ETH']);

const PREFERENCE: Record<QuotePref, string[]> = {
  EUR: ['EUR', 'USD', 'USDC', 'USDT', 'BTC', 'ETH'],
  USD: ['USD', 'USDC', 'USDT', 'EUR', 'BTC', 'ETH'],
};
/**
 * Lower is better: which pair represents an asset for the chosen currency.
 * A provider can override the order (Binance's USD markets are thin; USDT is its liquid one).
 */
export function quoteRank(quote: string, pref: QuotePref, override?: Partial<Record<QuotePref, string[]>>) {
  const i = (override?.[pref] ?? PREFERENCE[pref]).indexOf(quote);
  return i < 0 ? 99 : i;
}

/** "0.01000" → 2 */
export function decimalsOf(step: string) {
  const s = step.includes('.') ? step.replace(/0+$/, '') : step;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });
}

/** Space out REST calls to stay under an exchange's rate limit. */
export function spacer(gap: number) {
  let next = 0;
  return (signal?: AbortSignal) => {
    const now = Date.now();
    const delay = Math.max(0, next - now);
    next = Math.max(now, next) + gap;
    return delay ? wait(delay, signal) : Promise.resolve();
  };
}

/** Normalized candle: open time in ms. */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/**
 * Chart points from ascending candles: the first candle's open, then each close
 * (the last, still-open candle closes "now").
 */
export function toHistory(candles: Candle[], interval: number, span: number, capped: boolean): History {
  const now = Date.now();
  const from = now - span;
  const rows = candles.filter((k) => k.t >= from && Number.isFinite(k.c));
  const points: [number, number][] = rows.length
    ? [[rows[0].t, rows[0].o], ...rows.map((k): [number, number] => [Math.min(now, k.t + interval), k.c])]
    : [];
  // Partial: the market started after the window did, or the provider's cap cut off older data.
  const partial = span === Infinity ? capped : !rows.length || rows[0].t > from + 2 * interval;
  return { points, partial };
}

/** 1-year range from ascending daily candles; all-time figures only if `complete` (whole history). */
export function toYearStats(daily: Candle[], complete: boolean): YearStats {
  const rows = daily.filter((k) => Number.isFinite(k.h) && Number.isFinite(k.l));
  if (!rows.length) throw new Error('No daily data');
  const from = Date.now() - 365 * DAY;
  const year = rows.filter((k) => k.t >= from);
  const range = year.length ? year : rows.slice(-1);
  const s: YearStats = { low: Math.min(...range.map((k) => k.l)), high: Math.max(...range.map((k) => k.h)) };
  if (rows[0].t > from + 2 * DAY) s.partialSince = rows[0].t;
  if (complete) {
    const top = rows.reduce((a, b) => (b.h > a.h ? b : a));
    s.firstAt = rows[0].t;
    s.allHigh = top.h;
    s.allHighAt = top.t;
  }
  return s;
}

/**
 * A WebSocket that reconnects with exponential backoff, treats silence as a dead
 * connection, and reconnects immediately when the browser comes back online.
 * Returns a function that closes it for good.
 */
export function liveSocket(o: {
  url: string;
  onOpen: (ws: WebSocket) => void;
  onMessage: (msg: unknown) => void;
  onStatus: (s: ConnStatus) => void;
  staleMs?: number;
}): () => void {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let watchdog = 0;
  let retry = 0;
  let stopped = false;

  const kick = () => {
    clearTimeout(watchdog);
    watchdog = window.setTimeout(() => ws?.close(), o.staleMs ?? 15_000);
  };
  const open = () => {
    if (stopped) return;
    o.onStatus(attempt ? 'reconnecting' : 'connecting');
    const sock = (ws = new WebSocket(o.url));
    kick();
    sock.onopen = () => {
      attempt = 0;
      o.onOpen(sock);
    };
    sock.onmessage = (e) => {
      kick();
      o.onMessage(JSON.parse(e.data as string));
    };
    sock.onerror = () => sock.close();
    sock.onclose = () => {
      if (ws !== sock) return;
      clearTimeout(watchdog);
      ws = null;
      if (stopped) return;
      o.onStatus(navigator.onLine ? 'reconnecting' : 'offline');
      retry = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt++));
    };
  };
  const online = () => {
    if (ws || stopped) return;
    clearTimeout(retry);
    open();
  };
  window.addEventListener('online', online);
  open();

  return () => {
    stopped = true;
    window.removeEventListener('online', online);
    clearTimeout(retry);
    clearTimeout(watchdog);
    const s = ws;
    ws = null;
    s?.close();
  };
}
