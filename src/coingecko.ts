// Crypto fundamentals that exchanges don't publish (market cap, supply, rank,
// all-time high, launch date), from CoinGecko's free public API. Values are in EUR.
// Optional enrichment: on any failure the details page simply shows fewer rows.

const API = 'https://api.coingecko.com/api/v3/';
const TABLE_KEY = 'mme.cg.table.v1';
const GENESIS_KEY = 'mme.cg.genesis.v1';
const TTL = 10 * 60_000;
const RETRY_AFTER = 60_000;

export interface Fundamentals {
  id: string;
  rank: number;
  price: number; // EUR, used to verify the symbol match
  marketCap: number;
  dominance?: number; // % of total crypto market cap
  volume: number; // 24h, all markets
  circulating: number | null;
  maxSupply: number | null;
  ath: number;
  athAt: number;
}

interface RawCoin {
  id: string;
  symbol: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_date: string | null;
}

let table: Map<string, Fundamentals> | null = null;
let tableAt = 0;
let loading: Promise<void> | null = null;
let failedAt = 0;

async function json<T>(path: string): Promise<T> {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(TABLE_KEY) ?? 'null');
    if (c && Date.now() - c.at < TTL) {
      table = new Map(c.rows);
      tableAt = c.at;
    }
  } catch {
    /* ignore */
  }
}

async function fetchTable() {
  const pages = [await json<RawCoin[]>('coins/markets?vs_currency=eur&order=market_cap_desc&per_page=250&page=1')];
  pages.push(await json<RawCoin[]>('coins/markets?vs_currency=eur&order=market_cap_desc&per_page=250&page=2'));
  const global = await json<{ data: { total_market_cap: Record<string, number> } }>('global').catch(() => null);
  const total = global?.data.total_market_cap.eur;
  const map = new Map<string, Fundamentals>();
  for (const c of pages.flat()) {
    const sym = c.symbol.toUpperCase();
    // Symbols aren't unique; the list is sorted by market cap, so the largest wins.
    if (map.has(sym) || !c.market_cap || !c.market_cap_rank || !c.current_price) continue;
    map.set(sym, {
      id: c.id,
      rank: c.market_cap_rank,
      price: c.current_price,
      marketCap: c.market_cap,
      dominance: total ? (c.market_cap / total) * 100 : undefined,
      volume: c.total_volume ?? 0,
      circulating: c.circulating_supply,
      maxSupply: c.max_supply,
      ath: c.ath ?? 0,
      athAt: c.ath_date ? Date.parse(c.ath_date) : 0,
    });
  }
  table = map;
  tableAt = Date.now();
  try {
    localStorage.setItem(TABLE_KEY, JSON.stringify({ at: tableAt, rows: [...map] }));
  } catch {
    /* ignore */
  }
}

/** Load (or refresh) the top-500 table in the background; resolves when done. */
export function ensureTable(): Promise<void> {
  if (!table) readCache();
  const fresh = table && Date.now() - tableAt < TTL;
  if (fresh || loading || Date.now() - failedAt < RETRY_AFTER) return loading ?? Promise.resolve();
  loading = fetchTable()
    .catch(() => void (failedAt = Date.now()))
    .finally(() => (loading = null));
  return loading;
}

/**
 * Fundamentals for an asset symbol, or null. `eurPrice` (the exchange's own price
 * in EUR) guards against a different coin sharing the symbol: the match is only
 * accepted when both prices agree within 10%.
 */
export function lookup(symbol: string, eurPrice: number | undefined): Fundamentals | null {
  const f = table?.get(symbol.toUpperCase());
  if (!f || !eurPrice || Math.abs(f.price / eurPrice - 1) > 0.1) return null;
  return f;
}

/* ---------- Launch date (one request per coin, cached forever) ---------- */

const genesis: Record<string, string | null> = (() => {
  try {
    return JSON.parse(localStorage.getItem(GENESIS_KEY) ?? '{}');
  } catch {
    return {};
  }
})();
const pendingGenesis = new Set<string>();
let genesisFailedAt = 0;

/** undefined = not known yet, null = CoinGecko has no launch date for this coin. */
export const genesisDate = (id: string): string | null | undefined => genesis[id];

export async function loadGenesis(id: string): Promise<void> {
  if (id in genesis || pendingGenesis.has(id) || Date.now() - genesisFailedAt < RETRY_AFTER) return;
  pendingGenesis.add(id);
  try {
    const c = await json<{ genesis_date: string | null }>(
      `coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
    );
    genesis[id] = c.genesis_date ?? null;
    localStorage.setItem(GENESIS_KEY, JSON.stringify(genesis));
  } catch {
    genesisFailedAt = Date.now(); // rate limited or offline: back off, then try again
  } finally {
    pendingGenesis.delete(id);
  }
}
