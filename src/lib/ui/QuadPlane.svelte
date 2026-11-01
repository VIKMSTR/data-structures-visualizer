<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { PLANE, type QState } from '../core/quadtree';
  import type { Mark, Step } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import { Tween, type Target } from '../tween.svelte';
  import Viewport from './Viewport.svelte';

  interface Props {
    step: Step<QState> | undefined;
    tweenMs: number;
    fitKey: unknown;
    ontap: (x: number, y: number) => void;
  }
  let { step, tweenMs, fitKey, ontap }: Props = $props();

  /** Content units per plane unit. The plane is drawn with y pointing up. */
  const S = 4;
  const W = PLANE * S;
  const sx = (x: number) => x * S;
  const sy = (y: number) => (PLANE - y) * S;

  type Data =
    | { kind: 'cross'; half: number }
    | { kind: 'point'; label: string; mark?: Mark }
    | { kind: 'cursor'; label: string };
  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  $effect(() => {
    if (!step) return;
    const s = step;
    const targets = new Map<string, Target<Data>>();
    for (const n of Object.values(s.state.nodes)) {
      if (n.children) {
        targets.set('x' + n.id, { x: sx(n.x + n.size / 2), y: sy(n.y + n.size / 2), data: { kind: 'cross', half: (n.size / 2) * S } });
      }
      if (n.point) {
        const p = n.point;
        targets.set('p' + p.id, { x: sx(p.x + 0.5), y: sy(p.y + 0.5), data: { kind: 'point', label: `(${p.x}, ${p.y})`, mark: s.marks[p.id] } });
      }
    }
    const c = s.cursor;
    if (c && c.x != null && c.y != null) {
      targets.set('cursor', { x: sx(c.x + 0.5), y: sy(c.y + 0.5), data: { kind: 'cursor', label: c.label } });
    }
    // untrack: set() reads the current sprites; tracking them would restart the tween every frame.
    untrack(() => tween.set(targets, tweenMs));
  });

  /** Highlighted cells are drawn instantly (no tween), underneath everything else. */
  const cells = $derived(
    step
      ? Object.values(step.state.nodes)
          .filter((n) => step.marks[n.id] && step.marks[n.id] !== 'path')
          .sort((a, b) => a.depth - b.depth)
          .map((n) => ({ id: n.id, x: sx(n.x), y: sy(n.y + n.size), w: n.size * S, mark: step.marks[n.id] }))
      : [],
  );
  const sprites = $derived(Array.from(tween.sprites));

  function tap(x: number, y: number) {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const px = Math.min(PLANE - 1, Math.floor(x / S));
    const py = Math.min(PLANE - 1, Math.floor(PLANE - y / S));
    ontap(px, py);
  }

  const bounds = { x: -12, y: -12, w: W + 24, h: W + 24 };
  const ticks = [0, 25, 50, 75, 100];
</script>

<Viewport {bounds} {fitKey} maxFitZoom={2.5} label={t('ui.planeCanvas')} ontap={tap}>
  <rect class="plane" x="0" y="0" width={W} height={W} />
  {#each cells as c (c.id)}
    <rect class="cell" data-mark={c.mark} x={c.x} y={c.y} width={c.w} height={c.w} />
  {/each}
  {#each ticks as v (v)}
    <text class="tick" x={sx(v)} y={W + 10} text-anchor="middle">{v}</text>
    <text class="tick" x="-4" y={sy(v)} dy="0.35em" text-anchor="end">{v}</text>
  {/each}
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'cross'}
      <g class="cross" opacity={s.o}>
        <line x1={s.x - s.data.half} y1={s.y} x2={s.x + s.data.half} y2={s.y} />
        <line x1={s.x} y1={s.y - s.data.half} x2={s.x} y2={s.y + s.data.half} />
      </g>
    {/if}
  {/each}
  <rect class="border" x="0" y="0" width={W} height={W} />
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'point'}
      <g class="point" data-mark={s.data.mark ?? 'none'} transform="translate({s.x} {s.y})" opacity={s.o}>
        <circle r="5" />
        <text x="8" y="-6">{s.data.label}</text>
      </g>
    {:else if s.data.kind === 'cursor'}
      <g class="cursor" transform="translate({s.x} {s.y})" opacity={s.o}>
        <circle r="9" />
        <circle class="dot" r="3" />
      </g>
    {/if}
  {/each}
</Viewport>

<style>
  .plane {
    fill: var(--surface);
  }
  .border {
    fill: none;
    stroke: var(--node-stroke);
    stroke-width: 2;
  }
  .cross line {
    stroke: var(--edge);
    stroke-width: 1.5;
  }
  .tick {
    font-size: 10px;
    fill: var(--muted);
  }
  .cell {
    fill: transparent;
  }
  .cell[data-mark='current'] {
    fill: var(--m-current-bg);
    stroke: var(--m-current);
    stroke-width: 2;
  }
  .cell[data-mark='new'] {
    fill: var(--m-new-bg);
  }
  .cell[data-mark='found'] {
    fill: var(--m-found-bg);
  }
  .cell[data-mark='remove'],
  .cell[data-mark='notfound'] {
    fill: var(--m-bad-bg);
  }
  .cell[data-mark='moved'] {
    fill: var(--m-pivot-bg);
  }
  .point circle {
    fill: var(--fg);
  }
  .point text {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .point[data-mark='new'] circle {
    fill: var(--m-new);
  }
  .point[data-mark='found'] circle {
    fill: var(--m-found);
  }
  .point[data-mark='remove'] circle {
    fill: var(--m-bad);
  }
  .point[data-mark='moved'] circle {
    fill: var(--m-pivot);
  }
  .point[data-mark]:not([data-mark='none']) text {
    fill: var(--fg);
    font-weight: 600;
  }
  .cursor circle {
    fill: none;
    stroke: var(--m-current);
    stroke-width: 2.5;
    stroke-dasharray: 4 3;
  }
  .cursor .dot {
    fill: var(--m-current);
    stroke: none;
  }
</style>
