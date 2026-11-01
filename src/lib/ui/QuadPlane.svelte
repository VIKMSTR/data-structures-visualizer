<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { fmtPoint, PLANE, type QState } from '../core/quadtree';
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

  /** Original GridView: 4 px per unit (400x400 square). Drawn with y pointing up (math convention). */
  const S = 4;
  const W = PLANE * S;
  const sx = (x: number) => x * S;
  const sy = (y: number) => (PLANE - y) * S;

  type Data = { kind: 'cross'; half: number } | { kind: 'point'; label: string; mark?: Mark } | { kind: 'cursor' };
  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  $effect(() => {
    if (!step) return;
    const s = step;
    const targets = new Map<string, Target<Data>>();
    for (const n of Object.values(s.state.nodes)) {
      if (n.children) targets.set('x' + n.id, { x: sx(n.x + n.size / 2), y: sy(n.y + n.size / 2), data: { kind: 'cross', half: (n.size / 2) * S } });
      if (n.point) {
        const p = n.point;
        targets.set('p' + p.id, { x: sx(p.x), y: sy(p.y), data: { kind: 'point', label: fmtPoint(p.x, p.y), mark: s.marks[p.id] } });
      }
    }
    const c = s.cursor;
    if (c && c.x != null && c.y != null) targets.set('cursor', { x: sx(c.x), y: sy(c.y), data: { kind: 'cursor' } });
    untrack(() => tween.set(targets, tweenMs));
  });

  /** The current cell is highlighted (the original's abandoned grid animation did this; the tree view shows the same). */
  const cells = $derived(
    step
      ? Object.values(step.state.nodes)
          .filter((n) => {
            const m = step.marks[n.id];
            return m && m !== 'path';
          })
          .map((n) => ({ id: n.id, x: sx(n.x), y: sy(n.y + n.size), w: n.size * S, mark: step.marks[n.id] }))
      : [],
  );
  const sprites = $derived(Array.from(tween.sprites));

  /** Original hover label "[x,y]" above the square. Here it also follows the pointer. */
  let hover = $state('[ , ]');
  function onpointermove(e: PointerEvent) {
    const svg = (e.currentTarget as SVGGElement).ownerSVGElement;
    const m = (e.currentTarget as SVGGElement).getScreenCTM();
    if (!svg || !m) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    const x = Math.round(Math.max(0, Math.min(W, p.x)) / S);
    const y = Math.round(PLANE - Math.max(0, Math.min(W, p.y)) / S);
    hover = `[${x},${y}]`;
  }

  function tap(x: number, y: number) {
    if (x < -2 || y < -2 || x > W + 2 || y > W + 2) return;
    const px = Math.round(Math.max(0, Math.min(W, x)) / S);
    const py = Math.round(PLANE - Math.max(0, Math.min(W, y)) / S);
    ontap(px, py);
  }

  const bounds = { x: -10, y: -26, w: W + 20, h: W + 36 };
</script>

<Viewport {bounds} {fitKey} maxFitZoom={2.5} label={t('ui.viewGrid')} ontap={tap}>
  <text class="hover" x={W / 2} y="-8" data-testid="plane-hover">{hover}</text>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <g {onpointermove}>
    <rect class="plane" x="0" y="0" width={W} height={W} />
    {#each cells as c (c.id)}
      <rect class="cell" data-mark={c.mark} x={c.x} y={c.y} width={c.w} height={c.w} />
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
        <circle class="point" data-mark={s.data.mark ?? 'none'} cx={s.x} cy={s.y} r="2" opacity={s.o}><title>{s.data.label}</title></circle>
      {:else if s.data.kind === 'cursor'}
        <circle class="cursor" cx={s.x} cy={s.y} r="6" opacity={s.o} />
      {/if}
    {/each}
  </g>
</Viewport>

<style>
  .plane {
    fill: #fff;
  }
  .border {
    fill: none;
    stroke: #000;
    stroke-width: 1;
  }
  .cross line {
    stroke: #000;
    stroke-width: 1;
  }
  .hover {
    text-anchor: middle;
    font-size: 12px;
    fill: #000;
  }
  .cell {
    fill: transparent;
  }
  .cell[data-mark='current'] {
    fill: rgba(255, 255, 224, 0.9);
    stroke: #000;
    stroke-width: 1.5;
  }
  .cell[data-mark='new'] {
    fill: #e0ffff;
  }
  .cell[data-mark='found'] {
    fill: #e0ffff;
    stroke: #7fff00;
    stroke-width: 3;
  }
  .cell[data-mark='notfound'],
  .cell[data-mark='remove'] {
    fill: rgba(255, 0, 0, 0.08);
    stroke: #ff0000;
    stroke-width: 2;
  }
  .cell[data-mark='moved'] {
    fill: #e0ffff;
  }
  .point {
    fill: #ff0000;
  }
  .cursor {
    fill: none;
    stroke: #000;
    stroke-width: 1.2;
    stroke-dasharray: 3 2;
  }
</style>
