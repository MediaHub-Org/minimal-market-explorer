import { detectLang, LANGS, type Lang } from './i18n';
import { TIMEFRAMES, type AssetType, type Timeframe } from './types';

export type SortKey = 'name' | 'price' | 'change';
export interface Sort {
  key: SortKey;
  dir: 1 | -1;
}

export type View = 'fav' | AssetType;
export const VIEWS: View[] = ['fav', 'crypto', 'stock', 'etf'];

export interface Prefs {
  favorites: string[]; // asset symbols, in the user's manual order
  view: View;
  sort: Sort | null; // null = manual order (favorites) / volume (all)
  selected: string | null;
  timeframe: Timeframe;
  theme: 'system' | 'light' | 'dark';
  lang: Lang;
}

export const MAX_FAVORITES = 50;
const KEY = 'mme.prefs.v2';

/**
 * Starter favorites, chosen by size (market capitalization) rather than as
 * recommendations: the largest cryptocurrencies (stablecoins excluded), the
 * largest companies, and broad index, bond and commodity funds.
 * Anything Kraken doesn't list is dropped at startup.
 */
const DEFAULT_FAVORITES = [
  // 10 cryptocurrencies
  'BTC', 'ETH', 'XRP', 'BNB', 'SOL', 'TRX', 'DOGE', 'ADA', 'HYPE', 'LINK',
  // 30 companies (tokenized stocks)
  'NVDAx', 'MSFTx', 'AAPLx', 'GOOGLx', 'AMZNx', 'METAx', 'AVGOx', 'TSMx', 'BRK.Bx', 'TSLAx',
  'LLYx', 'JPMx', 'Vx', 'ORCLx', 'XOMx', 'NFLXx', 'JNJx', 'ABBVx', 'PGx', 'BACx',
  'ASMLx', 'PLTRx', 'AMDx', 'KOx', 'UNHx', 'CSCOx', 'MUx', 'IBMx', 'CRMx', 'AZNx',
  // Funds: broad indexes, Treasury bills, gold and silver (tokenized ETFs/ETPs)
  'SPYx', 'QQQx', 'VTIx', 'VXUSx', 'IEMGx', 'SGOVx', 'GLDx', 'SLVx',
];

const DEFAULTS: Prefs = {
  favorites: DEFAULT_FAVORITES,
  view: 'fav',
  sort: null,
  selected: 'BTC',
  timeframe: '1M',
  theme: 'system',
  lang: detectLang(),
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
  if (!VIEWS.includes(p.view)) p.view = 'fav';
  if (!LANGS.includes(p.lang)) p.lang = detectLang();
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
