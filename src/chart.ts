import { num } from './format';

type Point = [time: number, value: number];

export interface Chart {
  set(points: Point[], timeLabel: (t: number) => string): void;
  updateLast(value: number): void;
  clear(): void;
  redraw(): void;
  readonly points: Point[];
}

/** Minimal canvas line chart with a crosshair (mouse and arrow keys). */
export function createChart(canvas: HTMLCanvasElement, onHover: (p: Point | null) => void): Chart {
  const ctx = canvas.getContext('2d')!;
  const box = canvas.parentElement!;
  let pts: Point[] = [];
  let label: (t: number) => string = String;
  let hover = -1;
  let w = 0;
  let h = 0;
  let frame = 0;
  const pad = { l: 8, r: 72, t: 16, b: 28 };

  const css = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();

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

  function bounds() {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [, v] of pts) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
    if (hi - lo < Math.abs(hi) * 1e-6) (lo -= Math.abs(lo) * 0.01 || 1), (hi += Math.abs(hi) * 0.01 || 1);
    const m = (hi - lo) * 0.08;
    return [lo - m, hi + m];
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    if (pts.length < 2 || w <= 0) return;
    const [lo, hi] = bounds();
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;

    const font = `11px ${css('--font-num')}`;
    const muted = css('--muted');
    const grid = css('--grid');
    const color = pts[pts.length - 1][1] >= pts[0][1] ? css('--up') : css('--down');

    // Horizontal grid + price axis.
    const step = niceStep((hi - lo) / 4);
    const dec = Math.max(0, -Math.floor(Math.log10(step)));
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(w - pad.r, yy);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(num(Math.abs(v) < step / 1e6 ? 0 : v, dec), w - pad.r + 8, yy);
    }

    // Time axis: ~5 evenly spaced labels.
    ctx.textBaseline = 'alphabetic';
    const n = Math.max(2, Math.min(6, Math.floor(iw / 110)));
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * (i + 0.5)) / n;
      ctx.textAlign = 'center';
      ctx.fillText(label(t), x(t), h - 8);
    }

    // Area + line.
    ctx.beginPath();
    pts.forEach(([t, v], i) => (i ? ctx.lineTo(x(t), y(v)) : ctx.moveTo(x(t), y(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(x(t1), pad.t + ih);
    ctx.lineTo(x(t0), pad.t + ih);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    g.addColorStop(0, withAlpha(color, 0.18));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fill();

    // Crosshair.
    if (hover >= 0 && hover < pts.length) {
      const [t, v] = pts[hover];
      const xx = Math.round(x(t)) + 0.5;
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, pad.t + ih);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x(t), y(v), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function setHover(i: number) {
    hover = i;
    onHover(i >= 0 ? pts[i] : null);
    schedule();
  }

  function nearest(px: number) {
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const t = t0 + ((px - pad.l) / (w - pad.l - pad.r)) * (t1 - t0);
    let a = 0;
    let b = pts.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (pts[m][0] < t) a = m;
      else b = m;
    }
    return t - pts[a][0] < pts[b][0] - t ? a : b;
  }

  canvas.addEventListener('pointermove', (e) => {
    if (pts.length < 2) return;
    setHover(nearest(e.offsetX));
  });
  canvas.addEventListener('pointerleave', () => setHover(-1));
  canvas.addEventListener('blur', () => setHover(-1));
  canvas.addEventListener('keydown', (e) => {
    if (pts.length < 2) return;
    const last = pts.length - 1;
    const big = Math.max(1, Math.round(pts.length / 20));
    const cur = hover < 0 ? last : hover;
    const next: Record<string, number> = {
      ArrowLeft: cur - (e.shiftKey ? big : 1),
      ArrowRight: cur + (e.shiftKey ? big : 1),
      Home: 0,
      End: last,
      Escape: -1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    setHover(e.key === 'Escape' ? -1 : Math.max(0, Math.min(last, next[e.key])));
  });

  new ResizeObserver(resize).observe(box);

  return {
    get points() {
      return pts;
    },
    set(points, timeLabel) {
      pts = points;
      label = timeLabel;
      hover = -1;
      schedule();
    },
    updateLast(value) {
      if (pts.length < 2) return;
      pts[pts.length - 1] = [pts[pts.length - 1][0], value];
      if (hover === pts.length - 1) onHover(pts[hover]);
      schedule();
    },
    clear() {
      pts = [];
      hover = -1;
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

/** Accepts #rrggbb tokens only (as defined in style.css). */
function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
