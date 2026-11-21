import { TIMEFRAMES, type Timeframe } from './types';

export type SortKey = 'name' | 'price' | 'change';
export interface Sort {
  key: SortKey;
  dir: 1 | -1;
}

export interface Prefs {
  favorites: string[]; // asset symbols, in the user's manual order
  view: 'fav' | 'all';
  sort: Sort | null; // null = manual order (favorites) / volume (all)
  selected: string | null;
  timeframe: Timeframe;
  theme: 'system' | 'light' | 'dark';
}

export const MAX_FAVORITES = 50;
const KEY = 'mme.prefs.v1';

const DEFAULTS: Prefs = {
  favorites: ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'LINK', 'DOT'],
  view: 'fav',
  sort: null,
  selected: 'BTC',
  timeframe: '1M',
  theme: 'system',
};

export function loadPrefs(): Prefs {
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    /* corrupted or blocked storage: use defaults */
  }
  const p = { ...DEFAULTS, ...saved };
  if (!Array.isArray(p.favorites)) p.favorites = [...DEFAULTS.favorites];
  p.favorites = [...new Set(p.favorites.filter((f) => typeof f === 'string'))].slice(0, MAX_FAVORITES);
  if (!TIMEFRAMES.includes(p.timeframe)) p.timeframe = DEFAULTS.timeframe;
  if (p.view !== 'all') p.view = 'fav';
  if (p.sort && !['name', 'price', 'change'].includes(p.sort.key)) p.sort = null;
  return p;
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: preferences just won't persist */
  }
}
