import { detectLang, LANGS, type Lang } from './i18n';
import { TIMEFRAMES, type AssetType, type ExchangeId, type QuotePref, type Timeframe } from './types';

export type SortKey = 'name' | 'price' | 'change' | 'volume';
const SORT_KEYS: SortKey[] = ['name', 'price', 'change', 'volume'];
export const EXCHANGES: ExchangeId[] = ['kraken', 'binance', 'coinbase'];
export interface Sort {
  key: SortKey;
  dir: 1 | -1;
}

export type View = 'fav' | AssetType;
export const VIEWS: View[] = ['fav', 'crypto', 'stock', 'etf'];

export interface Prefs {
  favorites: string[]; // asset symbols (shared across exchanges), in the user's manual order
  exchange: ExchangeId;
  quote: QuotePref;
  compare: string[]; // assets overlaid on the chart, besides the selected one
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
 * Assets an exchange doesn't list are simply not shown there.
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
  exchange: 'kraken',
  quote: 'EUR',
  compare: [],
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
  if (p.sort && !SORT_KEYS.includes(p.sort.key)) p.sort = null;
  if (!EXCHANGES.includes(p.exchange)) p.exchange = 'kraken';
  if (p.quote !== 'USD') p.quote = 'EUR';
  if (!Array.isArray(p.compare)) p.compare = [];
  p.compare = [...new Set(p.compare.filter((b) => typeof b === 'string'))].slice(0, 10);
  return p;
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: preferences just won't persist */
  }
}
