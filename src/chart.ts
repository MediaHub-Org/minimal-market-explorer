import { num, pct } from './format';

export type Point = [time: number, value: number];

export interface Series {
  points: Point[]; // ascending
  color?: string; // compare mode; price mode colors by trend
}

/**
 * - price:   one series in its own currency, colored by trend.
 * - compare: several series, each rescaled to its first point and shown as % change
 *            (log scale optional, for long ranges where gains differ by orders of magnitude).
 */
export type Mode = 'price' | 'compare';

/** Hover state: the time under the cursor and each series' value there (null outside its range). */
export type Hover = { t: number; values: (number | null)[] } | null;

export interface Chart {
  set(series: Series[], opts: { mode: Mode; log?: boolean; timeLabel: (t: number) => string }): void;
  updateLast(index: number, value: number): void;
  clear(): void;
  redraw(): void;
  readonly series: Series[];
  readonly mode: Mode;
}

/** Minimal canvas line chart with a crosshair (mouse and arrow keys). */
export function createChart(canvas: HTMLCanvasElement, onHover: (h: Hover) => void): Chart {
  const ctx = canvas.getContext('2d')!;
  const box = canvas.parentElement!;
  let series: Series[] = [];
  let mode: Mode = 'price';
  let log = false;
  let label: (t: number) => string = String;
  let hoverT: number | null = null;
  let w = 0;
  let h = 0;
  let frame = 0;
  const pad = { l: 8, r: 72, t: 16, b: 28 };

  const css = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const drawable = () => series.length > 0 && series[0].points.length > 1;

  function resize() {
    const r = box.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    draw();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), draw()));
  }

  /** Value as plotted: the price, or the ratio to the series' first point (log-transformed if needed). */
  function plotted(s: Series, v: number) {
    if (mode === 'price') return v;
    const r = v / s.points[0][1];
    return log ? Math.log(r) : r;
  }

  function extent() {
    let t0 = Infinity;
    let t1 = -Infinity;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      if (s.points.length < 2) continue;
      t0 = Math.min(t0, s.points[0][0]);
      t1 = Math.max(t1, s.points[s.points.length - 1][0]);
      for (const [, v] of s.points) {
        const y = plotted(s, v);
        if (Number.isFinite(y)) (lo = Math.min(lo, y)), (hi = Math.max(hi, y));
      }
    }
    if (hi - lo < Math.abs(hi) * 1e-6 || hi === lo) (lo -= Math.abs(lo) * 0.01 || 0.01), (hi += Math.abs(hi) * 0.01 || 0.01);
    const m = (hi - lo) * 0.08;
    return { t0, t1, lo: lo - m, hi: hi + m };
  }

  /** Grid values (in plotted units) and their labels. */
  function ticks(lo: number, hi: number): [number, string][] {
    if (mode === 'compare' && log) {
      // Round % changes: -99 … -50, 0, then +100, +200, +500, +1,000 … (1-2-5 per decade).
      const steps = [-99, -95, -90, -80, -50, 0];
      for (let e = 2; e <= 8; e++) for (const k of [1, 2, 5]) steps.push(k * 10 ** e);
      const out: [number, string][] = [];
      for (const p of steps) {
        const y = Math.log(1 + p / 100);
        if (y >= lo && y <= hi) out.push([y, pct(p).replace(/[.,]00%$/, '%')]);
      }
      // Thin out, but always keep the 0% line.
      if (out.length <= 8) return out;
      const zero = out.findIndex(([y]) => y === 0);
      return out.filter((_, i) => (i - (zero < 0 ? 0 : zero)) % 2 === 0);
    }
    const scale = mode === 'compare' ? 100 : 1; // compare ticks are % (ratio - 1)
    const offset = mode === 'compare' ? 1 : 0;
    const step = niceStep(((hi - lo) * scale) / 4);
    const dec = Math.max(0, -Math.floor(Math.log10(step)));
    const out: [number, string][] = [];
    for (let v = Math.ceil(((lo - offset) * scale) / step) * step; v <= (hi - offset) * scale + 1e-9; v += step) {
      const clean = Math.abs(v) < step / 1e6 ? 0 : v;
      out.push([clean / scale + offset, mode === 'compare' ? pct(clean).replace(/[.,]00%$/, '%') : num(clean, dec)]);
    }
    return out;
  }

  function nearest(s: Series, t: number) {
    const p = s.points;
    if (p.length < 2 || t < p[0][0] - 1 || t > p[p.length - 1][0] + 1) return -1;
    let a = 0;
    let b = p.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (p[m][0] < t) a = m;
      else b = m;
    }
    return t - p[a][0] < p[b][0] - t ? a : b;
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    if (!drawable() || w <= 0) return;
    const { t0, t1, lo, hi } = extent();
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * iw;
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;

    const muted = css('--muted');
    const grid = css('--grid');
    ctx.font = `11px ${css('--font-num')}`;
    ctx.lineWidth = 1;

    // Horizontal grid + value axis.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const [v, text] of ticks(lo, hi)) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(w - pad.r, yy);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(text, w - pad.r + 8, yy);
    }
    // The 0% line in compare mode.
    if (mode === 'compare') {
      const base = log ? 0 : 1;
      if (base > lo && base < hi) {
        ctx.strokeStyle = muted;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.l, Math.round(y(base)) + 0.5);
        ctx.lineTo(w - pad.r, Math.round(y(base)) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Time axis: evenly spaced labels.
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    const n = Math.max(2, Math.min(6, Math.floor(iw / 110)));
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * (i + 0.5)) / n;
      ctx.fillText(label(t), x(t), h - 8);
    }

    // Lines (the first series on top, so draw it last).
    const colors = series.map((s) => s.color ?? trendColor(s));
    for (let i = series.length - 1; i >= 0; i--) {
      const s = series[i];
      if (s.points.length < 2) continue;
      ctx.beginPath();
      s.points.forEach(([t, v], j) => (j ? ctx.lineTo(x(t), y(plotted(s, v))) : ctx.moveTo(x(t), y(plotted(s, v)))));
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = i === 0 ? 1.75 : 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // Area fill only for a single price series; overlapping fills would muddy a comparison.
      if (mode === 'price') {
        const sx = x(s.points[s.points.length - 1][0]);
        ctx.lineTo(sx, pad.t + ih);
        ctx.lineTo(x(s.points[0][0]), pad.t + ih);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
        g.addColorStop(0, withAlpha(colors[i], 0.18));
        g.addColorStop(1, withAlpha(colors[i], 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    // Crosshair with a dot on each series.
    if (hoverT !== null) {
      const xx = Math.round(x(hoverT)) + 0.5;
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, pad.t + ih);
      ctx.stroke();
      ctx.setLineDash([]);
      series.forEach((s, i) => {
        const j = nearest(s, hoverT!);
        if (j < 0) return;
        ctx.beginPath();
        ctx.arc(x(s.points[j][0]), y(plotted(s, s.points[j][1])), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
      });
    }
  }

  function trendColor(s: Series) {
    const p = s.points;
    return p.length > 1 && p[p.length - 1][1] < p[0][1] ? css('--down') : css('--up');
  }

  function setHover(t: number | null) {
    hoverT = t;
    onHover(t === null ? null : { t, values: series.map((s) => (nearest(s, t) < 0 ? null : s.points[nearest(s, t)][1])) });
    schedule();
  }

  /** Snap the cursor to the first series' nearest point (or the nearest point of any series outside its range). */
  function snap(px: number) {
    const { t0, t1 } = extent();
    const t = t0 + ((px - pad.l) / (w - pad.l - pad.r)) * (t1 - t0);
    for (const s of series) {
      const j = nearest(s, t);
      if (j >= 0) return s.points[j][0];
    }
    return Math.max(t0, Math.min(t1, t));
  }

  canvas.addEventListener('pointermove', (e) => drawable() && setHover(snap(e.offsetX)));
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('blur', () => setHover(null));
  canvas.addEventListener('keydown', (e) => {
    if (!drawable()) return;
    const p = series[0].points;
    const last = p.length - 1;
    const big = Math.max(1, Math.round(p.length / 20));
    const cur = hoverT === null ? last : Math.max(0, nearest(series[0], hoverT));
    const next: Record<string, number> = {
      ArrowLeft: cur - (e.shiftKey ? big : 1),
      ArrowRight: cur + (e.shiftKey ? big : 1),
      Home: 0,
      End: last,
    };
    if (e.key === 'Escape') return setHover(null);
    if (!(e.key in next)) return;
    e.preventDefault();
    setHover(p[Math.max(0, Math.min(last, next[e.key]))][0]);
  });

  new ResizeObserver(resize).observe(box);

  return {
    get series() {
      return series;
    },
    get mode() {
      return mode;
    },
    set(s, opts) {
      series = s;
      mode = opts.mode;
      log = !!opts.log && mode === 'compare';
      label = opts.timeLabel;
      hoverT = null;
      schedule();
    },
    updateLast(i, value) {
      const p = series[i]?.points;
      if (!p || p.length < 2) return;
      p[p.length - 1] = [p[p.length - 1][0], value];
      if (hoverT !== null) setHover(hoverT);
      schedule();
    },
    clear() {
      series = [];
      hoverT = null;
      schedule();
    },
    redraw: schedule,
  };
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * mag;
}

/** Accepts #rrggbb colors only (tokens in style.css and the compare palette). */
function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
