import './style.css';
import { createChart } from './chart';
import { compact, pct, price, trend } from './format';
import { kraken } from './kraken';
import { loadPrefs, MAX_FAVORITES, savePrefs, type SortKey } from './prefs';
import { TIMEFRAMES, type ConnStatus, type History, type Market, type Provider, type Ticker, type Timeframe } from './types';

const provider: Provider = kraken;
const prefs = loadPrefs();
const save = () => savePrefs(prefs);

const markets = new Map<string, Market>(); // by asset (base)
const bySymbol = new Map<string, Market>(); // by pair
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
  theme: $<HTMLButtonElement>('theme'),
  toast: $('toast'),
  empty: $('d-empty'),
  body: $('d-body'),
  name: $('d-name'),
  sym: $('d-sym'),
  pair: $('d-pair'),
  star: $<HTMLButtonElement>('d-star'),
  last: $('d-last'),
  chg: $('d-chg'),
  readout: $('readout'),
  tf: $('tf'),
  chartMsg: $('chart-msg'),
  chartNote: $('chart-note'),
  stats: $('stats'),
};

const STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.95 3.95 4.36.63-3.15 3.08.74 4.34L8 11.55l-3.9 2.05.74-4.34L1.69 6.18l4.36-.63z"/></svg>';

/* ---------- Theme ---------- */

const THEMES = ['system', 'light', 'dark'] as const;
function applyTheme() {
  if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
  const label = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' }[prefs.theme];
  el.theme.title = el.theme.ariaLabel = `${label} (click to change)`;
  el.theme.innerHTML =
    prefs.theme === 'light'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/></svg>'
      : prefs.theme === 'dark'
        ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>'
        : '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/></svg>';
  chart.redraw();
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
  li.innerHTML = `<button class="star" type="button" tabindex="-1">${STAR}</button><span class="asset"><span class="name"></span><span class="sym"></span></span><span class="price num"></span><span class="chg num"></span>`;
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
  const label = fav ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
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
  const t = tickers.get(base);
  const p = li.querySelector('.price')!;
  const c = li.querySelector('.chg')!;
  p.textContent = price(m, t?.last);
  c.textContent = pct(t?.changePct);
  c.className = `chg num ${trend(t?.changePct)}`;
}

function score(m: Market, q: string) {
  const s = m.base.toLowerCase();
  const n = m.name.toLowerCase();
  if (s === q || n === q) return 0;
  if (s.startsWith(q)) return 1;
  if (n.startsWith(q)) return 2;
  return 3;
}

const volume = (base: string) => {
  const t = tickers.get(base);
  return t ? t.volume * t.vwap : -1;
};

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
    items = [...markets.values()].sort((a, b) => volume(b.base) - volume(a.base) || a.name.localeCompare(b.name));
  }
  const s = prefs.sort;
  if (s) {
    const val = (m: Market) => (s.key === 'price' ? tickers.get(m.base)?.last : tickers.get(m.base)?.changePct);
    items.sort((a, b) => {
      if (s.key === 'name') return s.dir * a.name.localeCompare(b.name);
      const va = val(a);
      const vb = val(b);
      if (va === undefined) return vb === undefined ? 0 : 1; // missing data last
      if (vb === undefined) return -1;
      return s.dir * (va - vb);
    });
  }
  return items;
}

function renderList({ keepScroll = false } = {}) {
  const scroll = el.list.scrollTop;
  const items = computeOrder();
  order = items.map((m) => m.base);
  const reorder = canReorder();
  el.list.replaceChildren(...items.map(row));
  for (const m of items) rows.get(m.base)!.draggable = reorder;
  el.list.classList.toggle('reorderable', reorder);
  if (keepScroll) el.list.scrollTop = scroll;
  else el.list.scrollTop = 0;

  // Tabs, sort headers and the footer hint.
  for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]')) {
    b.setAttribute('aria-selected', String(!query && b.dataset.view === prefs.view));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.cols [data-sort]')) {
    const on = prefs.sort?.key === b.dataset.sort;
    b.dataset.dir = on ? (prefs.sort!.dir === 1 ? 'asc' : 'desc') : '';
    b.ariaLabel = `Sort by ${b.textContent}${on ? (prefs.sort!.dir === 1 ? ', ascending' : ', descending') : ''}`;
  }
  el.favCount.textContent = `${prefs.favorites.length}`;
  el.hint.textContent = query
    ? `${items.length} result${items.length === 1 ? '' : 's'}`
    : prefs.sort && prefs.view === 'fav'
      ? 'Sorted · click the column again for your order'
      : reorder && items.length > 1
        ? 'Drag or Alt+↑↓ to reorder'
        : '';

  const msg = !markets.size
    ? ''
    : query && !items.length
      ? `No assets match “${query}”.`
      : prefs.view === 'fav' && !query && !items.length
        ? 'No favorites yet. Star assets in “All assets” to keep them here.'
        : '';
  setListMessage(msg);
  markSelected(false);
}

function setListMessage(text: string, action?: { label: string; run: () => void }) {
  el.listMsg.hidden = !text;
  el.listMsg.textContent = text;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link';
    b.textContent = action.label;
    b.onclick = action.run;
    el.listMsg.append(' ', b);
  }
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

function select(base: string) {
  const m = markets.get(base);
  if (!m) return;
  const changed = prefs.selected !== base || el.body.hidden;
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
  else if (prefs.favorites.length >= MAX_FAVORITES) return toast(`You can keep up to ${MAX_FAVORITES} favorites.`);
  else prefs.favorites.push(base);
  save();
  paintStar(base);
  if (prefs.view === 'fav' && !query) renderList({ keepScroll: true });
  else el.favCount.textContent = `${prefs.favorites.length}`;
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

function onTicker(symbol: string, t: Ticker) {
  const m = bySymbol.get(symbol);
  if (!m) return;
  tickers.set(m.base, t);
  dirty.add(m.base);
  if (!flushFrame) flushFrame = requestAnimationFrame(flush);
}

function flush() {
  flushFrame = 0;
  for (const base of dirty) paintTicker(base);
  if (prefs.selected && dirty.has(prefs.selected)) paintDetailTicker(true);
  dirty.clear();
}

const STATUS: Record<ConnStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};
function onStatus(s: ConnStatus) {
  if (el.status.dataset.state === s) return;
  el.status.dataset.state = s;
  el.status.textContent = STATUS[s];
  el.status.title = s === 'live' ? `Live prices from ${provider.name}` : `Live prices from ${provider.name} are not updating`;
  // "All assets" defaults to volume order, which needs the first snapshot.
  if (s === 'live' && firstVolumeSort) {
    firstVolumeSort = false;
    setTimeout(() => {
      if (prefs.view === 'all' && !query && !prefs.sort) renderList({ keepScroll: true });
      else if (prefs.sort && prefs.sort.key !== 'name') renderList({ keepScroll: true });
    }, 1500);
  }
}

/* ---------- Details ---------- */

const RANGE: Record<Timeframe, string> = { '1D': 'past day', '1W': 'past week', '1M': 'past month', '1Y': 'past year', ALL: 'all time' };
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
const dateFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
const axisFmt = Object.fromEntries(TIMEFRAMES.map((t) => [t, dateFmt(TIME_FMT[t])])) as Record<Timeframe, Intl.DateTimeFormat>;
const hoverFmt = Object.fromEntries(TIMEFRAMES.map((t) => [t, dateFmt(HOVER_FMT[t])])) as Record<Timeframe, Intl.DateTimeFormat>;
const dayFmt = dateFmt({ dateStyle: 'medium' });

let hovering = false;
const chart = createChart($<HTMLCanvasElement>('chart'), (p) => {
  hovering = !!p;
  const m = prefs.selected ? markets.get(prefs.selected) : undefined;
  if (!m) return;
  if (p) {
    el.readout.className = 'readout num';
    el.readout.textContent = `${price(m, p[1])} · ${hoverFmt[prefs.timeframe].format(p[0])}`;
  } else paintRangeChange(m);
});

let shownHistory: History | null = null;

function paintRangeChange(m: Market) {
  const pts = chart.points;
  if (pts.length < 2 || !shownHistory) {
    el.readout.textContent = '';
    return;
  }
  const a = pts[0][1];
  const b = pts[pts.length - 1][1];
  const since = shownHistory.partial && prefs.timeframe !== 'ALL' ? `since ${dayFmt.format(pts[0][0])}` : RANGE[prefs.timeframe];
  el.readout.className = `readout num ${trend(b - a)}`;
  el.readout.textContent = `${price(m, b - a, true)} (${pct(((b - a) / a) * 100)}) · ${since}`;
}

function buildTimeframes() {
  el.tf.innerHTML = '';
  for (const tf of TIMEFRAMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.textContent = tf;
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
  const m = prefs.selected ? markets.get(prefs.selected) : undefined;
  if (m) loadChart(m);
}

function showDetails(m: Market) {
  el.empty.hidden = true;
  el.body.hidden = false;
  el.name.textContent = m.name;
  el.sym.textContent = m.base === m.name ? '' : m.base;
  el.pair.textContent = `${m.symbol} on ${provider.name}${m.quote === 'EUR' ? '' : ` · no EUR market, priced in ${m.quote}`}`;
  el.pair.title = `Prices shown are for the ${m.symbol} market pair`;
  paintStar(m.base);
  paintDetailTicker(false);
  loadChart(m);
}

function paintDetailTicker(live: boolean) {
  const m = prefs.selected ? markets.get(prefs.selected) : undefined;
  if (!m) return;
  const t = tickers.get(m.base);
  el.last.textContent = price(m, t?.last);
  el.chg.textContent = t ? `${price(m, t.change, true)} (${pct(t.changePct)}) 24h` : '';
  el.chg.className = `num ${trend(t?.changePct)}`;
  document.title = t ? `${price(m, t.last)} ${m.base} · Market Explorer` : 'Market Explorer';

  const stats: [string, string][] = t
    ? [
        ['24h high', price(m, t.high)],
        ['24h low', price(m, t.low)],
        ['24h volume', `${compact(t.volume, m.base)} · ${compact(t.volume * t.vwap, m.quote, true)}`],
        ['Market', m.symbol],
      ]
    : [['Market', m.symbol]];
  el.stats.innerHTML = '';
  for (const [k, v] of stats) {
    const d = document.createElement('div');
    d.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
    el.stats.append(d);
  }

  // Keep the chart's current candle in step with the live price.
  if (live && t && shownHistory && chart.points.length > 1) {
    chart.updateLast(t.last);
    if (!hovering) paintRangeChange(m);
  }
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
  el.chartMsg.classList.toggle('loading', text === 'Loading…');
  if (retry) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link';
    b.textContent = 'Retry';
    b.onclick = retry;
    el.chartMsg.append(document.createElement('br'), b);
  }
}

function loadChart(m: Market) {
  const tf = prefs.timeframe;
  const key = `${m.symbol}|${tf}`;
  const id = ++chartReq;
  inflight?.abort();
  clearTimeout(debounce);

  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < TTL[tf]) return showHistory(m, tf, hit.h);

  shownHistory = null;
  chart.clear();
  el.readout.textContent = '';
  el.chartNote.textContent = '';
  chartMessage('Loading…');
  // Short debounce so arrowing through the list doesn't fire a request per row.
  debounce = window.setTimeout(async () => {
    const ctrl = (inflight = new AbortController());
    try {
      const h = await provider.history(m.symbol, tf, ctrl.signal);
      histCache.set(key, { at: Date.now(), h });
      if (id === chartReq) showHistory(m, tf, h);
    } catch (e) {
      if (id !== chartReq || ctrl.signal.aborted) return;
      chartMessage(`Couldn’t load price history. ${e instanceof Error ? e.message : ''}`, () => loadChart(m));
    }
  }, 150);
}

function showHistory(m: Market, tf: Timeframe, h: History) {
  if (h.points.length < 2) {
    shownHistory = null;
    chart.clear();
    el.readout.textContent = '';
    el.chartNote.textContent = '';
    chartMessage(`${provider.name} has no price history for ${m.symbol} in this timeframe.`);
    return;
  }
  chartMessage('');
  shownHistory = h;
  // Copy: live updates mutate the last point.
  chart.set(
    h.points.map((p) => [...p] as [number, number]),
    (t) => axisFmt[tf].format(t),
  );
  const first = dayFmt.format(h.points[0][0]);
  el.chartNote.textContent =
    tf === 'ALL'
      ? h.partial
        ? `Earliest data ${provider.name} provides at weekly resolution: ${first}.`
        : `Full ${provider.name} history since ${first}.`
      : h.partial
        ? `${provider.name} only has data for ${m.symbol} since ${first}.`
        : '';
  paintRangeChange(m);
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
    const t = e.target as HTMLElement;
    if (e.key === '/' && !(t instanceof HTMLInputElement) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      el.search.focus();
      el.search.select();
    }
  });

  for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]')) {
    b.addEventListener('click', () => {
      prefs.view = b.dataset.view as 'fav' | 'all';
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
  el.theme.addEventListener('click', () => {
    prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length];
    save();
    applyTheme();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => chart.redraw());
}

/* ---------- Start ---------- */

const MARKETS_KEY = 'mme.markets.v1';

async function getMarkets(): Promise<Market[]> {
  try {
    const c = JSON.parse(localStorage.getItem(MARKETS_KEY) ?? 'null');
    if (c?.provider === provider.name && Date.now() - c.at < 12 * 3600_000 && c.markets?.length) return c.markets;
  } catch {
    /* ignore */
  }
  const list = await provider.loadMarkets();
  try {
    localStorage.setItem(MARKETS_KEY, JSON.stringify({ provider: provider.name, at: Date.now(), markets: list }));
  } catch {
    /* ignore */
  }
  return list;
}

async function start() {
  setListMessage('Loading markets…');
  onStatus('connecting');
  let list: Market[];
  try {
    list = await getMarkets();
  } catch (e) {
    onStatus('offline');
    setListMessage(`Couldn’t load markets from ${provider.name}. ${e instanceof Error ? e.message : ''}`, {
      label: 'Retry',
      run: start,
    });
    return;
  }
  for (const m of list) {
    markets.set(m.base, m);
    bySymbol.set(m.symbol, m);
  }
  // Drop favorites that are no longer listed.
  prefs.favorites = prefs.favorites.filter((b) => markets.has(b));
  if (prefs.selected && !markets.has(prefs.selected)) prefs.selected = null;
  save();

  renderList();
  const initial = prefs.selected ?? order[0];
  if (initial) select(initial);
  provider.streamTickers(list.map((m) => m.symbol), onTicker, onStatus);
}

buildTimeframes();
applyTheme();
bind();
start();
