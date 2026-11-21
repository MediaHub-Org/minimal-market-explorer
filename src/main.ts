import './style.css';
import { createChart, type Hover } from './chart';
import * as cg from './coingecko';
import { compact, money, pct, price, trend } from './format';
import { getLang, locale, setLang, t, translateDom } from './i18n';
import { loadPrefs, MAX_FAVORITES, savePrefs, type SortKey, type View } from './prefs';
import { binance } from './providers/binance';
import { coinbase } from './providers/coinbase';
import { quoteRank } from './providers/common';
import { kraken } from './providers/kraken';
import {
  TIMEFRAMES,
  type ConnStatus,
  type ExchangeId,
  type History,
  type Market,
  type Provider,
  type QuotePref,
  type Ticker,
  type Timeframe,
  type YearStats,
} from './types';

const PROVIDERS: Record<ExchangeId, Provider> = { kraken, binance, coinbase };
const prefs = loadPrefs();
const save = () => savePrefs(prefs);
setLang(prefs.lang);
let provider = PROVIDERS[prefs.exchange];

let pairs: Market[] = []; // every candidate pair on the current exchange
const markets = new Map<string, Market>(); // the pair shown for each asset (by base)
const byId = new Map<string, Market>(); // by the exchange's pair id
const tickers = new Map<string, Ticker>(); // by asset
let query = '';
let order: string[] = []; // assets currently listed, in display order

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  search: $<HTMLInputElement>('search'),
  list: $<HTMLUListElement>('list'),
  listMsg: $('list-msg'),
  favCount: $('fav-count'),
  hint: $('hint'),
  status: $('status'),
  lang: $<HTMLButtonElement>('lang'),
  theme: $<HTMLButtonElement>('theme'),
  toast: $('toast'),
  empty: $('d-empty'),
  body: $('d-body'),
  name: $('d-name'),
  sym: $('d-sym'),
  pair: $('d-pair'),
  trade: $<HTMLAnchorElement>('d-trade'),
  exchange: $('exchange'),
  quote: $('quote'),
  star: $<HTMLButtonElement>('d-star'),
  last: $('d-last'),
  chg: $('d-chg'),
  readout: $('readout'),
  tf: $('tf'),
  chartMsg: $('chart-msg'),
  chartNote: $('chart-note'),
  stats: $('stats'),
  legend: $('legend'),
  cmpAdd: $<HTMLButtonElement>('cmp-add'),
  cmpInput: $<HTMLInputElement>('cmp-input'),
  cmpOptions: $('cmp-options'),
  sources: $('sources'),
};

const STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.95 3.95 4.36.63-3.15 3.08.74 4.34L8 11.55l-3.9 2.05.74-4.34L1.69 6.18l4.36-.63z"/></svg>';
const selectedMarket = () => (prefs.selected ? markets.get(prefs.selected) : undefined);

/* ---------- Theme & language ---------- */

const THEMES = ['system', 'light', 'dark'] as const;
function applyTheme() {
  if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
  el.theme.title = el.theme.ariaLabel = t('theme.label', { name: t(`theme.${prefs.theme}` as const) });
  el.theme.innerHTML =
    prefs.theme === 'light'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/></svg>'
      : prefs.theme === 'dark'
        ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>'
        : '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/></svg>';
  chart.redraw();
}

function applyLang() {
  setLang(prefs.lang);
  document.documentElement.lang = prefs.lang;
  translateDom();
  buildDateFormats();
  el.lang.textContent = prefs.lang.toUpperCase();
  el.lang.title = el.lang.ariaLabel = t('lang.label');
  applyTheme();
  paintStatus();
  paintVenue();
  for (const base of rows.keys()) {
    paintStar(base);
    paintTicker(base);
  }
  if (markets.size) renderList({ keepScroll: true });
  const m = selectedMarket();
  if (m && !el.body.hidden) showDetails(m);
  else document.title = t('app.title');
}

/* ---------- Market list ---------- */

const rows = new Map<string, HTMLLIElement>();
const isFav = (base: string) => prefs.favorites.includes(base);
const canReorder = () => prefs.view === 'fav' && !prefs.sort && !query;

function row(m: Market): HTMLLIElement {
  let li = rows.get(m.base);
  if (li) return li;
  li = document.createElement('li');
  li.className = 'row';
  li.id = `row-${m.base.replace(/[^\w-]/g, '_')}`;
  li.setAttribute('role', 'option');
  li.dataset.base = m.base;
  li.innerHTML = `<button class="star" type="button" tabindex="-1">${STAR}</button><span class="asset"><span class="name"></span><span class="sym"></span></span><span class="price num"></span><span class="chg num"></span><span class="vol num"></span>`;
  li.querySelector('.name')!.textContent = m.name;
  li.querySelector('.sym')!.textContent = m.base === m.name ? '' : m.base;
  li.title = `${m.name} · ${m.symbol}`;
  rows.set(m.base, li);
  paintStar(m.base);
  paintTicker(m.base);
  return li;
}

function paintStar(base: string) {
  const fav = isFav(base);
  const name = markets.get(base)?.name ?? base;
  const label = t(fav ? 'fav.remove' : 'fav.add', { name });
  const btns = [rows.get(base)?.querySelector<HTMLButtonElement>('.star')];
  if (base === prefs.selected) btns.push(el.star);
  for (const b of btns) {
    if (!b) continue;
    b.setAttribute('aria-pressed', String(fav));
    b.ariaLabel = b.title = label;
  }
  if (el.star.innerHTML === '') el.star.innerHTML = STAR;
}

function paintTicker(base: string) {
  const li = rows.get(base);
  const m = markets.get(base);
  if (!li || !m) return;
  const tk = tickers.get(base);
  const c = li.querySelector('.chg')!;
  li.querySelector('.price')!.textContent = price(m, tk?.last);
  c.textContent = pct(tk?.changePct);
  c.className = `chg num ${trend(tk?.changePct)}`;
  // The price column already shows the currency; the volume column stays a short number.
  const vol = li.querySelector<HTMLElement>('.vol')!;
  vol.textContent = tk ? compact(tk.quoteVolume, '', false, 1) : '—';
  vol.title = tk ? compact(tk.quoteVolume, m.quote, true) : '';
}

function score(m: Market, q: string) {
  const s = m.base.toLowerCase();
  const n = m.name.toLowerCase();
  if (s === q || n === q) return 0;
  if (s.startsWith(q)) return 1;
  if (n.startsWith(q)) return 2;
  return 3;
}

const volume = (base: string) => tickers.get(base)?.quoteVolume ?? -1;

let pinned = 0; // favorites shown at the top of a non-favorites list

function computeOrder(): Market[] {
  let items: Market[];
  if (query) {
    const q = query.toLowerCase();
    items = [...markets.values()]
      .filter((m) => m.base.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => score(a, q) - score(b, q) || volume(b.base) - volume(a.base));
  } else if (prefs.view === 'fav') {
    items = prefs.favorites.map((b) => markets.get(b)).filter((m): m is Market => !!m);
  } else {
    items = [...markets.values()]
      .filter((m) => m.type === prefs.view)
      .sort((a, b) => volume(b.base) - volume(a.base) || a.name.localeCompare(b.name));
  }
  const s = prefs.sort;
  if (s) {
    const val = (m: Market) => {
      const tk = tickers.get(m.base);
      return s.key === 'price' ? tk?.last : s.key === 'change' ? tk?.changePct : tk?.quoteVolume;
    };
    items.sort((a, b) => {
      if (s.key === 'name') return s.dir * a.name.localeCompare(b.name, locale());
      const va = val(a);
      const vb = val(b);
      if (va === undefined) return vb === undefined ? 0 : 1; // missing data last
      if (vb === undefined) return -1;
      return s.dir * (va - vb);
    });
  }
  // Favorites go first in every other list (search results and type tabs), keeping the sort within each group.
  pinned = 0;
  if (query || prefs.view !== 'fav') {
    const favs = items.filter((m) => isFav(m.base));
    if (favs.length && favs.length < items.length) {
      items = [...favs, ...items.filter((m) => !isFav(m.base))];
      pinned = favs.length;
    }
  }
  return items;
}

const visibleFavorites = () => prefs.favorites.filter((b) => markets.has(b)).length;

function renderList({ keepScroll = false } = {}) {
  const scroll = el.list.scrollTop;
  const items = computeOrder();
  order = items.map((m) => m.base);
  const reorder = canReorder();
  el.list.replaceChildren(...items.map(row));
  items.forEach((m, i) => {
    const li = rows.get(m.base)!;
    li.draggable = reorder;
    li.classList.toggle('pin-end', pinned > 0 && i === pinned - 1);
  });
  el.list.classList.toggle('reorderable', reorder);
  el.list.scrollTop = keepScroll ? scroll : 0;

  // Tabs, sort headers and the footer hint.
  for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]')) {
    b.setAttribute('aria-selected', String(!query && b.dataset.view === prefs.view));
    // Stocks/ETFs tabs only exist where the exchange lists them (Kraken).
    const v = b.dataset.view;
    b.hidden = v !== 'fav' && v !== 'crypto' && ![...markets.values()].some((m) => m.type === v);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.cols [data-sort]')) {
    const on = prefs.sort?.key === b.dataset.sort;
    b.dataset.dir = on ? (prefs.sort!.dir === 1 ? 'asc' : 'desc') : '';
    b.ariaLabel = t('sort.by', { col: b.textContent ?? '' }) + (on ? t(prefs.sort!.dir === 1 ? 'sort.asc' : 'sort.desc') : '');
  }
  el.favCount.textContent = `${visibleFavorites()}`;
  el.hint.textContent = query
    ? items.length === 1
      ? t('hint.result')
      : t('hint.results', { n: items.length })
    : prefs.sort && prefs.view === 'fav'
      ? t('hint.sorted')
      : reorder && items.length > 1
        ? t('hint.reorder')
        : '';

  const msg = !markets.size
    ? ''
    : query && !items.length
      ? t('msg.noMatch', { q: query })
      : prefs.view === 'fav' && !query && !items.length
        ? t('msg.noFavs')
        : '';
  setListMessage(msg);
  markSelected(false);
}

function setListMessage(text: string, action?: { label: string; run: () => void }) {
  el.listMsg.hidden = !text;
  el.listMsg.textContent = text;
  if (action) el.listMsg.append(' ', linkButton(action.label, action.run));
}

function linkButton(label: string, run: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'link';
  b.textContent = label;
  b.onclick = run;
  return b;
}

function markSelected(scroll = true) {
  for (const li of el.list.querySelectorAll('[aria-selected=true]')) li.setAttribute('aria-selected', 'false');
  const li = prefs.selected ? rows.get(prefs.selected) : undefined;
  if (li?.isConnected) {
    li.setAttribute('aria-selected', 'true');
    el.list.setAttribute('aria-activedescendant', li.id);
    if (scroll) li.scrollIntoView({ block: 'nearest' });
  } else {
    el.list.removeAttribute('aria-activedescendant');
  }
}

function select(base: string, force = false) {
  const m = markets.get(base);
  if (!m) return;
  const changed = force || prefs.selected !== base || el.body.hidden;
  prefs.selected = base;
  save();
  markSelected();
  if (changed) showDetails(m);
}

function moveSelection(delta: number | 'first' | 'last') {
  if (!order.length) return;
  const i = prefs.selected ? order.indexOf(prefs.selected) : -1;
  const next =
    delta === 'first' ? 0 : delta === 'last' ? order.length - 1 : i < 0 ? 0 : Math.max(0, Math.min(order.length - 1, i + delta));
  select(order[next]);
}

let toastTimer = 0;
function toast(text: string) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), 3000);
}

function toggleFavorite(base: string) {
  const i = prefs.favorites.indexOf(base);
  if (i >= 0) prefs.favorites.splice(i, 1);
  else if (prefs.favorites.length >= MAX_FAVORITES) return toast(t('fav.limit', { n: MAX_FAVORITES }));
  else prefs.favorites.push(base);
  save();
  paintStar(base);
  // Re-render so the favorite moves into (or out of) the pinned group.
  renderList({ keepScroll: true });
}

function moveFavorite(base: string, target: string, after: boolean) {
  const f = prefs.favorites;
  if (base === target) return;
  f.splice(f.indexOf(base), 1);
  f.splice(f.indexOf(target) + (after ? 1 : 0), 0, base);
  save();
  renderList({ keepScroll: true });
}

function cycleSort(key: SortKey) {
  const first = key === 'name' ? 1 : -1;
  const s = prefs.sort;
  prefs.sort = !s || s.key !== key ? { key, dir: first } : s.dir === first ? { key, dir: -first as 1 | -1 } : null;
  save();
  renderList();
}

/* ---------- Live prices ---------- */

const dirty = new Set<string>();
let flushFrame = 0;
let firstVolumeSort = true;
let status: ConnStatus = 'connecting';

function onTicker(id: string, tk: Ticker) {
  const m = byId.get(id);
  if (!m) return;
  tickers.set(m.base, tk);
  dirty.add(m.base);
  if (!flushFrame) flushFrame = requestAnimationFrame(flush);
}

function flush() {
  flushFrame = 0;
  for (const base of dirty) paintTicker(base);
  if (prefs.selected && dirty.has(prefs.selected)) paintDetailTicker();
  // Keep each charted series' current candle in step with its live price.
  let moved = false;
  shown?.markets.forEach((mk, i) => {
    const tk = dirty.has(mk.base) ? tickers.get(mk.base) : undefined;
    if (tk) (chart.updateLast(i, tk.last), (moved = true));
  });
  if (moved && !hovering) paintReadout(null);
  dirty.clear();
}

function paintStatus() {
  el.status.dataset.state = status;
  el.status.textContent = t(`status.${status}` as const);
  el.status.title = t(status === 'live' ? 'status.liveTitle' : 'status.downTitle', { p: provider.name });
}

function onStatus(s: ConnStatus) {
  if (el.status.dataset.state === s) return;
  status = s;
  paintStatus();
  // Type tabs default to volume order, which needs the first snapshot.
  if (s === 'live' && firstVolumeSort) {
    firstVolumeSort = false;
    setTimeout(() => {
      if (prefs.view !== 'fav' && !query && !prefs.sort) renderList({ keepScroll: true });
      else if (prefs.sort && prefs.sort.key !== 'name') renderList({ keepScroll: true });
    }, 1500);
  }
}

/* ---------- Details ---------- */

const TIME_FMT: Record<Timeframe, Intl.DateTimeFormatOptions> = {
  '1D': { hour: '2-digit', minute: '2-digit' },
  '1W': { weekday: 'short', day: 'numeric' },
  '1M': { day: 'numeric', month: 'short' },
  '1Y': { month: 'short', year: '2-digit' },
  ALL: { month: 'short', year: 'numeric' },
};
const HOVER_FMT: Record<Timeframe, Intl.DateTimeFormatOptions> = {
  '1D': { dateStyle: 'medium', timeStyle: 'short' },
  '1W': { dateStyle: 'medium', timeStyle: 'short' },
  '1M': { dateStyle: 'medium', timeStyle: 'short' },
  '1Y': { dateStyle: 'medium' },
  ALL: { dateStyle: 'medium' },
};
let axisFmt: Record<Timeframe, Intl.DateTimeFormat>;
let hoverFmt: Record<Timeframe, Intl.DateTimeFormat>;
let dayFmt: Intl.DateTimeFormat;
let dayFmtUtc: Intl.DateTimeFormat;
let monthFmt: Intl.DateTimeFormat;

function buildDateFormats() {
  const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), opts);
  axisFmt = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, f(TIME_FMT[tf])])) as Record<Timeframe, Intl.DateTimeFormat>;
  hoverFmt = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, f(HOVER_FMT[tf])])) as Record<Timeframe, Intl.DateTimeFormat>;
  dayFmt = f({ dateStyle: 'medium' });
  dayFmtUtc = f({ dateStyle: 'medium', timeZone: 'UTC' });
  monthFmt = f({ month: 'short', year: 'numeric' });
}

/* ---------- Chart & comparison ---------- */

/** Distinct line colors for compared assets (first = the selected asset). Readable on light and dark. */
const PALETTE = ['#5b5bd6', '#e8772e', '#0f9f9f', '#d1458f', '#8c9a1f', '#3b82f6'];
const MAX_COMPARE = PALETTE.length - 1;

/** What the chart currently shows: the selected asset first, then the compared ones that have data. */
let shown: { markets: Market[]; histories: History[] } | null = null;
let hovering = false;
const comparing = () => !!shown && shown.markets.length > 1;

const chart = createChart($<HTMLCanvasElement>('chart'), (hv) => {
  hovering = !!hv;
  paintReadout(hv);
});

function paintReadout(hv: Hover) {
  const m = selectedMarket();
  const s = chart.series;
  if (!m || !shown || !s.length || s[0].points.length < 2) {
    el.readout.textContent = '';
    paintLegend(null);
    return;
  }
  const tf = prefs.timeframe;
  const pts = s[0].points;
  if (comparing()) {
    // Values are in the legend chips; the readout only says when.
    el.readout.className = 'readout num';
    el.readout.textContent = hv ? hoverFmt[tf].format(hv.t) : t('cmp.range', { r: t(`range.${tf}` as const) });
  } else if (hv && hv.values[0] !== null) {
    el.readout.className = 'readout num';
    el.readout.textContent = `${price(m, hv.values[0])} · ${hoverFmt[tf].format(hv.t)}`;
  } else {
    const a = pts[0][1];
    const b = pts[pts.length - 1][1];
    const since =
      shown.histories[0].partial && tf !== 'ALL' ? t('range.since', { d: dayFmt.format(pts[0][0]) }) : t(`range.${tf}` as const);
    el.readout.className = `readout num ${trend(b - a)}`;
    el.readout.textContent = `${price(m, b - a, true)} (${pct(((b - a) / a) * 100)}) · ${since}`;
  }
  paintLegend(hv);
}

/** Legend chips (compare mode): color, asset, % change at the cursor (or now), and a remove button. */
function paintLegend(hv: Hover) {
  const chips: HTMLElement[] = [];
  if (shown && comparing()) {
    shown.markets.forEach((mk, i) => {
      const pts = chart.series[i]?.points ?? [];
      const v = hv ? hv.values[i] : pts[pts.length - 1]?.[1];
      const change = v != null && pts.length ? (v / pts[0][1] - 1) * 100 : undefined;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.setProperty('--c', PALETTE[i]);
      chip.title = `${mk.name} · ${mk.symbol}${pts.length ? ` · ${t('range.since', { d: dayFmt.format(pts[0][0]) })}` : ''}`;
      chip.append(
        Object.assign(document.createElement('i'), { className: 'dot' }),
        Object.assign(document.createElement('b'), { textContent: mk.base }),
        Object.assign(document.createElement('span'), { className: `num ${trend(change)}`, textContent: pct(change) }),
      );
      if (i > 0) {
        const x = Object.assign(document.createElement('button'), { type: 'button', className: 'chip-x', textContent: '×' });
        x.ariaLabel = x.title = t('cmp.remove', { name: mk.name });
        x.onclick = () => removeCompare(mk.base);
        chip.append(x);
      }
      chips.push(chip);
    });
  }
  el.legend.replaceChildren(...chips);
}

/** The selected asset plus the compared ones available on this exchange. */
function chartMarkets(m: Market): Market[] {
  const others = prefs.compare.filter((b) => b !== m.base).map((b) => markets.get(b));
  return [m, ...others.filter((x): x is Market => !!x)];
}

function addCompare(base: string) {
  const m = selectedMarket();
  if (!m || base === m.base || prefs.compare.includes(base) || !markets.has(base)) return;
  if (prefs.compare.filter((b) => b !== m.base && markets.has(b)).length >= MAX_COMPARE) {
    return toast(t('cmp.limit', { n: MAX_COMPARE + 1 }));
  }
  prefs.compare.push(base);
  save();
  loadChart(m);
}

function removeCompare(base: string) {
  prefs.compare = prefs.compare.filter((b) => b !== base);
  save();
  const m = selectedMarket();
  if (m) loadChart(m);
}

/** Suggestions for the compare box: every asset on the current exchange. */
function fillCompareOptions() {
  el.cmpOptions.replaceChildren(
    ...[...markets.values()]
      .sort((a, b) => a.base.localeCompare(b.base))
      .map((m) => Object.assign(document.createElement('option'), { value: m.base === m.name ? m.base : `${m.base} — ${m.name}` })),
  );
}

function openCompare() {
  el.cmpInput.hidden = false;
  el.cmpAdd.hidden = true;
  el.cmpInput.value = '';
  el.cmpInput.focus();
}

function closeCompare() {
  el.cmpInput.hidden = true;
  el.cmpAdd.hidden = false;
}

/** Accepts "BTC — Bitcoin" (a suggestion), a ticker or a name, case-insensitively. */
function submitCompare() {
  const v = el.cmpInput.value.trim();
  if (!v) return closeCompare();
  const key = v.split(' — ')[0].trim().toLowerCase();
  const m = [...markets.values()].find((x) => x.base.toLowerCase() === key || x.name.toLowerCase() === key);
  if (m) addCompare(m.base);
  closeCompare();
  el.cmpAdd.focus();
}

function buildTimeframes() {
  el.tf.innerHTML = '';
  for (const tf of TIMEFRAMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.dataset.i18n = `tf.${tf}`; // filled in by translateDom()
    b.dataset.tf = tf;
    b.onclick = () => setTimeframe(tf);
    el.tf.append(b);
  }
  el.tf.addEventListener('keydown', (e) => {
    const i = TIMEFRAMES.indexOf(prefs.timeframe);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setTimeframe(TIMEFRAMES[(i + d + TIMEFRAMES.length) % TIMEFRAMES.length]);
    el.tf.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus();
  });
  paintTimeframes();
}

function paintTimeframes() {
  for (const b of el.tf.querySelectorAll<HTMLButtonElement>('button')) {
    const on = b.dataset.tf === prefs.timeframe;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function setTimeframe(tf: Timeframe) {
  if (tf === prefs.timeframe) return;
  prefs.timeframe = tf;
  save();
  paintTimeframes();
  const m = selectedMarket();
  if (m) loadChart(m);
}

function showDetails(m: Market) {
  el.empty.hidden = true;
  el.body.hidden = false;
  el.name.textContent = m.name;
  el.sym.textContent = m.base === m.name ? '' : m.base;
  const kind = m.type === 'crypto' ? '' : `${t(m.type === 'stock' ? 'kind.stock' : 'kind.etf')} · `;
  // USD stablecoins count as dollar markets; anything else is a fallback worth pointing out.
  const sameCurrency = m.quote === prefs.quote || (prefs.quote === 'USD' && (m.quote === 'USDT' || m.quote === 'USDC'));
  const fallback = sameCurrency ? '' : ` · ${t('pair.fallback', { pref: prefs.quote, q: m.quote })}`;
  el.pair.textContent = kind + t('pair.on', { pair: m.symbol, p: provider.name }) + fallback;
  el.trade.href = provider.tradeUrl(m);
  el.trade.textContent = t('trade.on', { p: provider.name });
  el.pair.title =
    m.type === 'crypto'
      ? t('pair.titleCrypto', { pair: m.symbol })
      : t('pair.titleToken', { base: m.base, pair: m.symbol, p: provider.name });
  paintStar(m.base);
  paintDetailTicker();
  loadChart(m);
  loadStats(m);
}

function paintDetailTicker() {
  const m = selectedMarket();
  if (!m) return;
  const tk = tickers.get(m.base);
  el.last.textContent = price(m, tk?.last);
  el.chg.textContent = tk ? `${price(m, tk.change, true)} (${pct(tk.changePct)}) ${t('chg.24h')}` : '';
  el.chg.className = `num ${trend(tk?.changePct)}`;
  document.title = tk ? `${price(m, tk.last)} ${m.base} · ${t('app.title')}` : t('app.title');
  paintStats(m);
}

/* ---------- Statistics ---------- */

const yearCache = new Map<string, { at: number; y: YearStats | null }>();
const YEAR_TTL = 10 * 60_000;
let statsTimer = 0;
let statsCtrl: AbortController | null = null;
let statsFor: string | null = null; // asset whose extra data may be fetched (after a short dwell)

/** Extra data is fetched only once the user rests on an asset, to respect both APIs' rate limits. */
function loadStats(m: Market) {
  clearTimeout(statsTimer);
  statsCtrl?.abort();
  statsFor = null;
  statsTimer = window.setTimeout(async () => {
    statsFor = m.base;
    if (m.type === 'crypto') cg.ensureTable(cgCurrency()).then(() => statsFor === m.base && paintStats(m));
    const key = `${provider.id}|${m.id}`;
    const hit = yearCache.get(key);
    if (hit && Date.now() - hit.at < YEAR_TTL) return paintStats(m);
    const ctrl = (statsCtrl = new AbortController());
    try {
      yearCache.set(key, { at: Date.now(), y: await provider.yearStats(m, ctrl.signal) });
    } catch {
      if (ctrl.signal.aborted) return;
      yearCache.set(key, { at: Date.now(), y: null });
    }
    if (statsFor === m.base) paintStats(m);
  }, 600);
}

const cgCurrency = () => (prefs.quote === 'USD' ? 'usd' : 'eur');

interface Stat {
  label: string;
  value: string;
  sub?: string;
  subClass?: string;
}

function paintStats(m: Market) {
  const tk = tickers.get(m.base);
  const y = yearCache.get(`${provider.id}|${m.id}`)?.y ?? null;
  const cur = cgCurrency();
  const f = m.type === 'crypto' ? cg.lookup(m.base, tk?.last, m.quote, cur) : null;
  const unit = prefs.quote; // CoinGecko figures are in the chosen currency
  const stats: Stat[] = [];

  if (f) {
    stats.push({ label: t('stat.rank'), value: `#${f.rank}` });
    stats.push({
      label: t('stat.mcap'),
      value: compact(f.marketCap, unit, true),
      sub: f.dominance !== undefined ? t('stat.dominance', { v: pct(f.dominance, false) }) : undefined,
    });
    stats.push({
      label: t('stat.volume'),
      value: compact(f.volume, unit, true),
      sub: tk
        ? `${t('stat.volumeAll')} · ${t('stat.volumeOn', { v: compact(tk.quoteVolume, m.quote, true), p: provider.name })}`
        : t('stat.volumeAll'),
    });
    if (f.circulating) {
      stats.push({
        label: t('stat.supply'),
        value: compact(f.circulating, m.base),
        sub: f.maxSupply ? t('stat.ofMax', { v: pct((f.circulating / f.maxSupply) * 100, false) }) : undefined,
      });
    }
    if (f.ath) {
      const from = (f.price / f.ath - 1) * 100;
      stats.push({
        label: t('stat.ath'),
        value: money(f.ath, unit),
        sub: [f.athAt ? monthFmt.format(f.athAt) : '', t('stat.fromHigh', { v: pct(from) })]
          .filter(Boolean)
          .join(' · '),
      });
    }
  } else if (tk) {
    stats.push({
      label: t('stat.volume'),
      value: compact(tk.quoteVolume, m.quote, true),
      sub: t('stat.volumeOn', { v: compact(tk.volume, m.base), p: provider.name }),
    });
  }

  if (!f && y?.allHigh !== undefined) {
    const from = tk ? (tk.last / y.allHigh - 1) * 100 : undefined;
    stats.push({
      label: t('stat.highOn', { p: provider.name }),
      value: price(m, y.allHigh),
      sub: [monthFmt.format(y.allHighAt!), from !== undefined ? t('stat.fromHigh', { v: pct(from) }) : ''].filter(Boolean).join(' · '),
    });
  }

  const launch = f ? cg.genesisDate(f.id) : undefined;
  if (f && launch === undefined && statsFor === m.base) cg.loadGenesis(f.id).then(() => statsFor === m.base && paintStats(m));
  if (launch) stats.push({ label: t('stat.launch'), value: dayFmtUtc.format(Date.parse(launch)) });
  else if (y?.firstAt !== undefined) stats.push({ label: t('stat.since', { p: provider.name }), value: dayFmt.format(y.firstAt) });

  if (tk) stats.push({ label: t('stat.range24'), value: `${price(m, tk.low)} – ${price(m, tk.high)}` });
  if (y) {
    stats.push({
      label: t('stat.range1y'),
      value: `${price(m, y.low)} – ${price(m, y.high)}`,
      sub: y.partialSince ? t('range.since', { d: dayFmt.format(y.partialSince) }) : undefined,
    });
  }
  stats.push({ label: t('stat.market'), value: m.symbol });

  el.stats.replaceChildren(
    ...stats.map((s) => {
      const d = document.createElement('div');
      d.append(Object.assign(document.createElement('dt'), { textContent: s.label }));
      d.append(Object.assign(document.createElement('dd'), { textContent: s.value }));
      if (s.sub) d.append(Object.assign(document.createElement('dd'), { className: 'sub', textContent: s.sub }));
      return d;
    }),
  );
  el.sources.textContent = f
    ? t('stats.sources', { s: `${provider.name} · CoinGecko` })
    : t('stats.source', { s: provider.name });
}

/* ---------- History ---------- */

const histCache = new Map<string, { at: number; h: History }>();
const TTL: Record<Timeframe, number> = { '1D': 60_000, '1W': 120_000, '1M': 300_000, '1Y': 600_000, ALL: 3_600_000 };
let chartReq = 0;
let inflight: AbortController | null = null;
let debounce = 0;

function chartMessage(text: string, retry?: () => void) {
  el.chartMsg.hidden = !text;
  el.chartMsg.textContent = text;
  if (retry) el.chartMsg.append(document.createElement('br'), linkButton(t('msg.retry'), retry));
}

const histKey = (m: Market, tf: Timeframe) => `${provider.id}|${m.id}|${tf}`;
function cachedHistory(m: Market, tf: Timeframe): History | undefined {
  const hit = histCache.get(histKey(m, tf));
  return hit && Date.now() - hit.at < TTL[tf] ? hit.h : undefined;
}

function loadChart(m: Market) {
  const tf = prefs.timeframe;
  const list = chartMarkets(m);
  const id = ++chartReq;
  inflight?.abort();
  clearTimeout(debounce);

  const cached = list.map((mk) => cachedHistory(mk, tf));
  if (cached.every((h) => h)) return showHistory(list, tf, cached as History[]);

  shown = null;
  chart.clear();
  paintReadout(null);
  el.chartNote.textContent = '';
  chartMessage(t('chart.loading'));
  // Short debounce so arrowing through the list doesn't fire a request per row.
  debounce = window.setTimeout(async () => {
    const ctrl = (inflight = new AbortController());
    try {
      // The provider spaces requests out, so several series stay within its rate limit.
      const hs = await Promise.all(
        list.map(async (mk, i) => {
          if (cached[i]) return cached[i]!;
          try {
            const h = await provider.history(mk, tf, ctrl.signal);
            histCache.set(histKey(mk, tf), { at: Date.now(), h });
            return h;
          } catch (e) {
            if (i === 0) throw e; // a compared asset failing just drops its line
            return null;
          }
        }),
      );
      if (id === chartReq) showHistory(list, tf, hs);
    } catch (e) {
      if (id !== chartReq || ctrl.signal.aborted) return;
      chartMessage(t('chart.error', { e: e instanceof Error ? e.message : '' }), () => loadChart(m));
    }
  }, 150);
}

function showHistory(list: Market[], tf: Timeframe, hs: (History | null)[]) {
  const m = list[0];
  const h = hs[0];
  if (!h || h.points.length < 2) {
    shown = null;
    chart.clear();
    paintReadout(null);
    el.chartNote.textContent = '';
    chartMessage(t('chart.none', { p: provider.name, pair: m.symbol }));
    return;
  }
  chartMessage('');
  const ok = list.map((mk, i) => ({ mk, h: hs[i] })).filter((x): x is { mk: Market; h: History } => !!x.h && x.h.points.length > 1);
  const missing = list.filter((_, i) => i > 0 && !(hs[i] && hs[i]!.points.length > 1)).map((mk) => mk.base);
  shown = { markets: ok.map((x) => x.mk), histories: ok.map((x) => x.h) };
  const compare = ok.length > 1;
  chart.set(
    // Copy: live updates mutate the last point.
    ok.map((x, i) => ({ points: x.h.points.map((p) => [...p] as [number, number]), color: compare ? PALETTE[i] : undefined })),
    { mode: compare ? 'compare' : 'price', log: compare && tf === 'ALL', timeLabel: (time) => axisFmt[tf].format(time) },
  );

  const d = dayFmt.format(h.points[0][0]);
  const p = provider.name;
  const notes = [
    tf === 'ALL'
      ? t(h.partial ? 'note.allPartial' : 'note.allFull', { p, d })
      : h.partial
        ? t('note.partial', { p, pair: m.symbol, d })
        : '',
    compare ? t(tf === 'ALL' ? 'cmp.noteLog' : 'cmp.note') : '',
    missing.length ? t('cmp.unavailable', { list: missing.join(', '), p }) : '',
  ];
  el.chartNote.textContent = notes.filter(Boolean).join(' ');
  paintReadout(null);
}

/* ---------- Events ---------- */

function bind() {
  el.list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('.row');
    if (!li) return;
    if ((e.target as HTMLElement).closest('.star')) toggleFavorite(li.dataset.base!);
    else select(li.dataset.base!);
  });

  el.list.addEventListener('keydown', (e) => {
    const sel = prefs.selected;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (!sel || !canReorder()) return;
      const i = order.indexOf(sel);
      const j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (i >= 0 && j >= 0 && j < order.length) moveFavorite(sel, order[j], e.key === 'ArrowDown');
      markSelected();
      return;
    }
    const nav: Record<string, number | 'first' | 'last'> = {
      ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10, Home: 'first', End: 'last',
    };
    if (e.key in nav) {
      e.preventDefault();
      moveSelection(nav[e.key]);
    } else if ((e.key === 'f' || e.key === 'F') && sel && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleFavorite(sel);
    }
  });

  // Drag-and-drop reordering of favorites.
  let drag: string | null = null;
  let drop: { base: string; after: boolean } | null = null;
  const clearMarks = () => el.list.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'dragging'));
  el.list.addEventListener('dragstart', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('.row');
    if (!li || !canReorder()) return e.preventDefault();
    drag = li.dataset.base!;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', drag);
    li.classList.add('dragging');
  });
  el.list.addEventListener('dragover', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('.row');
    if (!drag || !li) return;
    e.preventDefault();
    const r = li.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    if (drop && drop.base === li.dataset.base && drop.after === after) return;
    el.list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    li.classList.add(after ? 'drop-after' : 'drop-before');
    drop = { base: li.dataset.base!, after };
  });
  el.list.addEventListener('drop', (e) => {
    e.preventDefault();
    if (drag && drop) moveFavorite(drag, drop.base, drop.after);
  });
  el.list.addEventListener('dragend', () => {
    drag = drop = null;
    clearMarks();
  });

  el.search.addEventListener('input', () => {
    query = el.search.value.trim();
    renderList();
  });
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      if (order.length && (!prefs.selected || !order.includes(prefs.selected))) select(order[0]);
      el.list.focus();
    } else if (e.key === 'Escape' && el.search.value) {
      e.preventDefault();
      el.search.value = query = '';
      renderList();
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (e.key === '/' && !(target instanceof HTMLInputElement) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      el.search.focus();
      el.search.select();
    }
  });

  for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]')) {
    b.addEventListener('click', () => {
      prefs.view = b.dataset.view as View;
      save();
      if (query) el.search.value = query = '';
      renderList();
      markSelected();
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.cols [data-sort]')) {
    b.addEventListener('click', () => cycleSort(b.dataset.sort as SortKey));
  }

  el.star.addEventListener('click', () => prefs.selected && toggleFavorite(prefs.selected));
  el.cmpAdd.addEventListener('click', openCompare);
  el.cmpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (e.preventDefault(), submitCompare());
    else if (e.key === 'Escape') (e.preventDefault(), closeCompare(), el.cmpAdd.focus());
  });
  // Picking a suggestion fires `change` (Chrome/Edge) without an Enter key.
  el.cmpInput.addEventListener('change', () => el.cmpInput.value.includes(' — ') && submitCompare());
  el.cmpInput.addEventListener('blur', () => setTimeout(() => !el.cmpInput.hidden && document.activeElement !== el.cmpInput && closeCompare(), 150));
  el.theme.addEventListener('click', () => {
    prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length];
    save();
    applyTheme();
  });
  el.lang.addEventListener('click', () => {
    prefs.lang = getLang() === 'en' ? 'es' : 'en';
    save();
    applyLang();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => chart.redraw());
}

/* ---------- Exchange & quote currency ---------- */

const marketsKey = (p: Provider) => `mme.markets.${p.id}.v4`; // bump when market fields or names change

async function getMarkets(p: Provider): Promise<Market[]> {
  try {
    const c = JSON.parse(localStorage.getItem(marketsKey(p)) ?? 'null');
    if (Date.now() - c?.at < 12 * 3600_000 && c.markets?.length) return c.markets;
  } catch {
    /* ignore */
  }
  const list = await p.loadMarkets();
  try {
    localStorage.setItem(marketsKey(p), JSON.stringify({ at: Date.now(), markets: list }));
  } catch {
    /* ignore: storage full, the list is simply re-fetched next time */
  }
  return list;
}

/** One pair per asset: the chosen quote currency when that market exists, otherwise the next best. */
function pickMarkets() {
  markets.clear();
  byId.clear();
  tickers.clear();
  rows.clear();
  for (const m of pairs) {
    const cur = markets.get(m.base);
    const rank = (q: string) => quoteRank(q, prefs.quote, provider.quoteOrder);
    if (!cur || rank(m.quote) < rank(cur.quote)) markets.set(m.base, m);
  }
  for (const m of markets.values()) byId.set(m.id, m);
}

let stopStream: (() => void) | null = null;
let streamGen = 0;

function startStream() {
  stopStream?.();
  const gen = ++streamGen; // ignore late callbacks from a stream that was replaced
  firstVolumeSort = true;
  el.status.dataset.state = '';
  stopStream = provider.streamTickers(
    [...markets.values()].map((m) => m.id),
    (id, tk) => gen === streamGen && onTicker(id, tk),
    (s) => gen === streamGen && onStatus(s),
  );
}

function paintVenue() {
  for (const b of el.exchange.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-checked', String(b.dataset.ex === provider.id));
  for (const b of el.quote.querySelectorAll<HTMLButtonElement>('button')) {
    b.setAttribute('aria-checked', String(b.dataset.q === prefs.quote));
    b.title = t('quote.title', { q: b.dataset.q! });
  }
}

/** Show the market list and details for the current pick, keeping the selected asset when possible. */
function showPicked() {
  if (!markets.size) return;
  fillCompareOptions();
  if (prefs.view !== 'fav' && prefs.view !== 'crypto' && ![...markets.values()].some((m) => m.type === prefs.view)) prefs.view = 'fav';
  renderList();
  const initial = prefs.selected && markets.has(prefs.selected) ? prefs.selected : order[0] ?? markets.keys().next().value;
  if (initial) select(initial, true);
  startStream();
}

async function loadExchange() {
  stopStream?.();
  stopStream = null;
  streamGen++;
  const p = provider;
  pairs = [];
  pickMarkets();
  el.list.replaceChildren();
  paintVenue();
  setListMessage(t('msg.loadingMarkets'));
  status = 'connecting';
  paintStatus();
  try {
    const list = await getMarkets(p);
    if (p !== provider) return; // switched again while loading
    pairs = list;
  } catch (e) {
    if (p !== provider) return;
    onStatus('offline');
    setListMessage(t('msg.marketsError', { p: p.name, e: e instanceof Error ? e.message : '' }), {
      label: t('msg.retry'),
      run: loadExchange,
    });
    return;
  }
  pickMarkets();
  showPicked();
}

function setExchange(id: ExchangeId) {
  if (id === provider.id) return;
  provider = PROVIDERS[id];
  prefs.exchange = id;
  save();
  loadExchange();
}

function setQuote(q: QuotePref) {
  if (q === prefs.quote) return;
  prefs.quote = q;
  save();
  paintVenue();
  pickMarkets();
  showPicked();
}

function bindVenue() {
  for (const b of el.exchange.querySelectorAll<HTMLButtonElement>('button')) b.addEventListener('click', () => setExchange(b.dataset.ex as ExchangeId));
  for (const b of el.quote.querySelectorAll<HTMLButtonElement>('button')) b.addEventListener('click', () => setQuote(b.dataset.q as QuotePref));
}

buildTimeframes();
bind();
bindVenue();
applyLang();
loadExchange();
