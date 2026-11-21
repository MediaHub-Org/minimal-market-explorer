// Crypto fundamentals that exchanges don't publish (market cap, supply, rank,
// all-time high, launch date), from CoinGecko's free public API.
// Optional enrichment: on any failure the details page simply shows fewer rows.

const API = 'https://api.coingecko.com/api/v3/';
const GENESIS_KEY = 'mme.cg.genesis.v1';
const TTL = 10 * 60_000;
const RETRY_AFTER = 60_000;

/** Currency the figures are expressed in. */
export type Currency = 'eur' | 'usd';

export interface Fundamentals {
  id: string;
  rank: number;
  price: number; // used to verify the symbol match
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

interface Table {
  at: number;
  map: Map<string, Fundamentals>;
}
const tables: Partial<Record<Currency, Table>> = {};
const loading: Partial<Record<Currency, Promise<void>>> = {};
const failedAt: Partial<Record<Currency, number>> = {};
const tableKey = (cur: Currency) => `mme.cg.table.${cur}.v1`;

async function json<T>(path: string): Promise<T> {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function readCache(cur: Currency) {
  try {
    const c = JSON.parse(localStorage.getItem(tableKey(cur)) ?? 'null');
    if (c && Date.now() - c.at < TTL) tables[cur] = { at: c.at, map: new Map(c.rows) };
  } catch {
    /* ignore */
  }
}

async function fetchTable(cur: Currency) {
  // One page (top 250) keeps us well under the free API's per-minute limit.
  const coins = await json<RawCoin[]>(`coins/markets?vs_currency=${cur}&order=market_cap_desc&per_page=250&page=1`);
  const global = await json<{ data: { total_market_cap: Record<string, number> } }>('global').catch(() => null);
  const total = global?.data.total_market_cap[cur];
  const map = new Map<string, Fundamentals>();
  for (const c of coins) {
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
  tables[cur] = { at: Date.now(), map };
  try {
    localStorage.setItem(tableKey(cur), JSON.stringify({ at: Date.now(), rows: [...map] }));
  } catch {
    /* ignore */
  }
}

/** Load (or refresh) the top-250 table for a currency in the background. */
export function ensureTable(cur: Currency): Promise<void> {
  if (!tables[cur]) readCache(cur);
  const t = tables[cur];
  if ((t && Date.now() - t.at < TTL) || Date.now() - (failedAt[cur] ?? 0) < RETRY_AFTER) return loading[cur] ?? Promise.resolve();
  return (loading[cur] ??= fetchTable(cur)
    .catch(() => void (failedAt[cur] = Date.now()))
    .finally(() => delete loading[cur]));
}

const USD_LIKE = new Set(['USD', 'USDT', 'USDC']);

/** Value of one unit of `quote` in `cur`, using CoinGecko's own prices (stablecoins as FX proxies). */
function unitValue(map: Map<string, Fundamentals>, quote: string, cur: Currency): number | undefined {
  if (quote === cur.toUpperCase() || (cur === 'usd' && USD_LIKE.has(quote))) return 1;
  if (quote === 'USD') return map.get('USDT')?.price; // USD → EUR via Tether's EUR price
  if (quote === 'EUR') return map.get('EURC')?.price; // EUR → USD via Euro Coin's USD price
  return map.get(quote)?.price; // USDT, USDC, BTC, ETH…
}

/**
 * Fundamentals for an asset, or null. The exchange's own price guards against a
 * different coin sharing the symbol: the match is accepted only when both
 * prices agree within 10%.
 */
export function lookup(symbol: string, price: number | undefined, quote: string, cur: Currency): Fundamentals | null {
  const map = tables[cur]?.map;
  const f = map?.get(symbol.toUpperCase());
  if (!map || !f || !price) return null;
  const unit = unitValue(map, quote, cur);
  if (!unit || Math.abs(f.price / (price * unit) - 1) > 0.1) return null;
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
