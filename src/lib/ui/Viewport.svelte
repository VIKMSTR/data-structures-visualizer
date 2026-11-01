<script lang="ts">
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import type { Bounds } from '../core/layout';
  import { t } from '../i18n/index.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    bounds: Bounds;
    label: string;
    /** Changing this re-enables automatic fitting (e.g. on every new operation). */
    fitKey?: unknown;
    maxFitZoom?: number;
    /** Click/tap (not drag) in content coordinates. */
    ontap?: (x: number, y: number) => void;
    children: Snippet;
  }
  let { bounds, label, fitKey, maxFitZoom = 1.2, ontap, children }: Props = $props();

  let svg: SVGSVGElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);
  let view = $state({ k: 1, x: 0, y: 0 });
  let userMoved = false;

  const MIN_K = 0.15;
  const MAX_K = 5;
  const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k));

  // ---- animated view changes ------------------------------------------------
  let raf = 0;
  function animateTo(target: { k: number; x: number; y: number }, ms = 380) {
    cancelAnimationFrame(raf);
    const from = { ...view };
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      view = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  onDestroy(() => cancelAnimationFrame(raf));

  function fitTarget() {
    const pad = 16;
    const k = clampK(Math.min((width - 2 * pad) / bounds.w, (height - 2 * pad) / bounds.h, maxFitZoom));
    return {
      k,
      x: width / 2 - (bounds.x + bounds.w / 2) * k,
      y: height / 2 - (bounds.y + bounds.h / 2) * k,
    };
  }

  let firstFit = true;
  function fit(animate = true) {
    if (width <= 0 || height <= 0) return;
    const target = fitTarget();
    if (animate && !firstFit) animateTo(target);
    else view = target;
    firstFit = false;
  }

  export function resetView() {
    userMoved = false;
    fit();
  }

  // Re-enable auto-fit for each new operation.
  $effect(() => {
    void fitKey;
    userMoved = false;
  });

  // Follow content size changes unless the user took over.
  $effect(() => {
    void bounds;
    void width;
    void height;
    // untrack: fit() reads `view`; tracking it would re-run this effect on every animation frame.
    untrack(() => {
      if (!userMoved) fit();
    });
  });

  // ---- size tracking (ResizeObserver: Safari 13.1+, all supported engines) -----
  $effect(() => {
    if (!svg) return;
    const el = svg;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      width = r.width;
      height = r.height;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // ---- interaction ---------------------------------------------------------------
  function zoomAt(px: number, py: number, factor: number) {
    cancelAnimationFrame(raf);
    const k = clampK(view.k * factor);
    const f = k / view.k;
    view = { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f };
    userMoved = true;
  }

  function local(e: { clientX: number; clientY: number }) {
    const r = svg!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number } | null = null;
  let dragged = false;

  function onpointerdown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    svg!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      downAt = p;
      dragged = false;
    } else {
      dragged = true; // multi-touch is never a tap
    }
  }

  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    if (pointers.size === 1) {
      if (!dragged && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 5) return;
      if (!dragged) {
        dragged = true;
      }
      cancelAnimationFrame(raf);
      view = { ...view, x: view.x + p.x - prev.x, y: view.y + p.y - prev.y };
      userMoved = true;
      pointers.set(e.pointerId, p);
      return;
    }
    // Pinch: zoom around the midpoint, pan with it.
    let other: { x: number; y: number } | undefined;
    pointers.forEach((q, id) => {
      if (id !== e.pointerId) other = q;
    });
    pointers.set(e.pointerId, p);
    if (!other) return;
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(p.x - other.x, p.y - other.y);
    const mid = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
    const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
    if (before > 0) zoomAt(mid.x, mid.y, after / before);
    view = { ...view, x: view.x + mid.x - prevMid.x, y: view.y + mid.y - prevMid.y };
  }

  function onpointerup(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && pointers.size === 0 && !dragged && ontap) {
      const p = local(e);
      ontap((p.x - view.x) / view.k, (p.y - view.y) / view.k);
    }
    if (pointers.size === 0) downAt = null;
  }

  // Wheel and Safari gesture events must be non-passive to prevent page zoom/scroll,
  // so they are attached manually instead of via Svelte's (passive) event attributes.
  $effect(() => {
    if (!svg) return;
    const el = svg;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      // ctrlKey = trackpad pinch on Chromium/Firefox; needs a stronger factor.
      const speed = e.ctrlKey ? 0.01 : 0.0015;
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * speed));
    };
    // WebKit (Safari, WKWebView) reports trackpad pinch as non-standard gesture events.
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const p = local(ge);
      zoomAt(p.x, p.y, ge.scale / gestureStart);
      gestureStart = ge.scale;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', onGestureChange, { passive: false } as AddEventListenerOptions);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  });

  function zoomButton(factor: number) {
    zoomAt(width / 2, height / 2, factor);
  }
</script>

<div class="viewport">
  <svg
    bind:this={svg}
    role="img"
    aria-label={label}
    class:tappable={!!ontap}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
  >
    <g transform="translate({view.x} {view.y}) scale({view.k})">
      {@render children()}
    </g>
  </svg>
  <div class="zoom">
    <button type="button" title={t('ui.zoomIn')} aria-label={t('ui.zoomIn')} onclick={() => zoomButton(1.25)}>
      <Icon name="plus" />
    </button>
    <button type="button" title={t('ui.zoomOut')} aria-label={t('ui.zoomOut')} onclick={() => zoomButton(0.8)}>
      <Icon name="minus" />
    </button>
    <button type="button" title={t('ui.fit')} aria-label={t('ui.fit')} onclick={resetView}>
      <Icon name="fit" />
    </button>
  </div>
</div>

<style>
  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    /* We handle pan/pinch ourselves; stop the browser/webview from scrolling or zooming the page. */
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  svg:active {
    cursor: grabbing;
  }
  svg.tappable {
    cursor: crosshair;
  }
  .zoom {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .zoom button {
    width: 34px;
    height: 34px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
  }
</style>
