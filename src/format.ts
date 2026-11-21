import { locale } from './i18n';
import type { Market } from './types';

const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY']);
const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, opts: Intl.NumberFormatOptions) {
  const k = `${locale()}|${key}`;
  let f = cache.get(k);
  if (!f) cache.set(k, (f = new Intl.NumberFormat(locale(), opts)));
  return f;
}

/** Price in the market's quote currency, at the pair's precision. */
export function price(m: Market, v: number | undefined, signed = false): string {
  return money(v, m.quote, Math.max(2, m.decimals), signed);
}

/** Amount in a currency (or "1.23 BTC" for non-fiat units). */
export function money(v: number | undefined, unit: string, maxDecimals?: number, signed = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  // Without a known precision: 2 decimals, or 4 significant digits below 1.
  const max = maxDecimals ?? (Math.abs(v) >= 1 || v === 0 ? 2 : Math.min(10, 3 - Math.floor(Math.log10(Math.abs(v)))));
  const sign = signed ? 'exceptZero' : 'auto';
  if (FIAT.has(unit)) {
    return nf(`c${unit}${max}${sign}`, {
      style: 'currency', currency: unit, minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max, signDisplay: sign,
    }).format(v);
  }
  return `${nf(`n${max}${sign}`, { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max, signDisplay: sign }).format(v)} ${unit}`;
}

export function pct(v: number | undefined, signed = true): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return nf(`pct${signed}`, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: signed ? 'exceptZero' : 'auto' }).format(v) + '%';
}

/** Short large numbers: "1.1T €", "52.6B €" ("1,1 B €", "52,6 mil M €" in Spanish). */
export function compact(v: number | undefined, unit: string, currency = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  if (currency && FIAT.has(unit)) {
    return nf(`cc${unit}`, { style: 'currency', currency: unit, notation: 'compact', maximumFractionDigits: 2 }).format(v);
  }
  const n = nf('compact', { notation: 'compact', maximumFractionDigits: 2 }).format(v);
  return unit ? `${n} ${unit}` : n;
}

/** Plain number with a fixed number of decimals (chart axis). */
export function num(v: number, decimals: number): string {
  return nf(`d${decimals}`, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export function trend(v: number | undefined): 'up' | 'down' | '' {
  return !v ? '' : v > 0 ? 'up' : 'down';
}
