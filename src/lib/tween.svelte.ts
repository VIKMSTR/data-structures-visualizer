export interface Sprite<T> {
  x: number;
  y: number;
  /** Opacity 0..1 (entering sprites fade in, leaving ones fade out). */
  o: number;
  data: T;
}
export interface Target<T> {
  x: number;
  y: number;
  data: T;
  /** Where an entering sprite starts (default: fade in at its target). */
  from?: { x: number; y: number };
}

/** JavaFX Interpolator.EASE_BOTH, used by every transition of the original. */
const ease = (t: number): number => (t < 0.2 ? 3.125 * t * t : t > 0.8 ? -3.125 * t * t + 6.25 * t - 2.125 : 1.25 * t - 0.125);

/**
 * Animates keyed sprites between layouts with requestAnimationFrame.
 * Done in JS on purpose: CSS transitions of SVG geometry behave inconsistently
 * across WKWebView / WebKitGTK / WebView2, rAF + attributes behaves the same everywhere.
 */
export class Tween<T> {
  sprites = $state.raw<Map<string, Sprite<T>>>(new Map());
  private raf = 0;

  set(targets: Map<string, Target<T>>, ms: number): void {
    cancelAnimationFrame(this.raf);
    const from = this.sprites;
    const start = new Map<string, Sprite<T>>();
    const end = new Map<string, Sprite<T>>();
    targets.forEach((t, k) => {
      const f = from.get(k);
      start.set(k, f ? { x: f.x, y: f.y, o: f.o, data: t.data } : t.from ? { x: t.from.x, y: t.from.y, o: 1, data: t.data } : { x: t.x, y: t.y, o: 0, data: t.data });
      end.set(k, { x: t.x, y: t.y, o: 1, data: t.data });
    });
    from.forEach((f, k) => {
      if (!targets.has(k) && f.o > 0.01) {
        start.set(k, f);
        end.set(k, { x: f.x, y: f.y, o: 0, data: f.data });
      }
    });
    const settled = (): Map<string, Sprite<T>> => {
      const m = new Map<string, Sprite<T>>();
      end.forEach((s, k) => {
        if (s.o > 0) m.set(k, s);
      });
      return m;
    };
    if (ms <= 0) {
      this.sprites = settled();
      return;
    }
    const t0 = performance.now();
    const frame = (now: number): void => {
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      const e = ease(p);
      if (p >= 1) {
        this.sprites = settled();
        return;
      }
      const m = new Map<string, Sprite<T>>();
      start.forEach((a, k) => {
        const b = end.get(k)!;
        m.set(k, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, o: a.o + (b.o - a.o) * e, data: b.data });
      });
      this.sprites = m;
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
