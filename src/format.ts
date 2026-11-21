import type { Market } from './types';

const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY']);
const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, opts: Intl.NumberFormatOptions) {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(undefined, opts)));
  return f;
}

/** Price in the market's quote currency, at the pair's precision. */
export function price(m: Market, v: number | undefined, signed = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const max = Math.max(2, m.decimals);
  const sign = signed ? 'exceptZero' : 'auto';
  if (FIAT.has(m.quote)) {
    return nf(`c${m.quote}${max}${sign}`, {
      style: 'currency', currency: m.quote, minimumFractionDigits: 2, maximumFractionDigits: max, signDisplay: sign,
    }).format(v);
  }
  return `${nf(`n${max}${sign}`, { minimumFractionDigits: 2, maximumFractionDigits: max, signDisplay: sign }).format(v)} ${m.quote}`;
}

export function pct(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return nf('pct', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(v) + '%';
}

export function compact(v: number | undefined, unit: string, currency = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  if (currency && FIAT.has(unit)) {
    return nf(`cc${unit}`, { style: 'currency', currency: unit, notation: 'compact', maximumFractionDigits: 2 }).format(v);
  }
  return `${nf('compact', { notation: 'compact', maximumFractionDigits: 2 }).format(v)} ${unit}`;
}

/** Plain number with a fixed number of decimals (chart axis). */
export function num(v: number, decimals: number): string {
  return nf(`d${decimals}`, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export function trend(v: number | undefined): 'up' | 'down' | '' {
  return !v ? '' : v > 0 ? 'up' : 'down';
}
