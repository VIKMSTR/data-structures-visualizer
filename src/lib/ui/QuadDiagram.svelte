<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { boundsOf, quadTreeLayout } from '../core/layout';
  import { fmtPoint, QUADRANTS, type QState } from '../core/quadtree';
  import type { Mark, Step } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import { Tween, type Target } from '../tween.svelte';
  import Viewport from './Viewport.svelte';

  interface Props {
    step: Step<QState> | undefined;
    tweenMs: number;
    fitKey: unknown;
  }
  let { step, tweenMs, fitKey }: Props = $props();

  /** Original QuadElement: 48x50 box, cell centre on top, stored point below a divider (font 9). */
  const W = 48;
  const H = 50;

  type Data =
    | { kind: 'node'; centre: string; value: string | null; quadrant: string | null; index: number; mark?: Mark; parent: string | null }
    | { kind: 'cursor'; label: string; result?: 'found' | 'notfound' };
  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  const layout = $derived(step ? quadTreeLayout(step.state) : new Map<number, { x: number; y: number }>());
  const bounds = $derived(boundsOf(layout.values(), 50));

  $effect(() => {
    if (!step) return;
    const s = step;
    const targets = new Map<string, Target<Data>>();
    layout.forEach((p, id) => {
      const n = s.state.nodes[id];
      const parent = n.parent != null ? s.state.nodes[n.parent] : null;
      const qi = parent && parent.children ? parent.children.indexOf(id) : -1;
      targets.set('n' + id, {
        x: p.x,
        y: p.y,
        data: {
          kind: 'node',
          centre: fmtPoint(n.x + n.size / 2, n.y + n.size / 2),
          value: n.point ? fmtPoint(n.point.x, n.point.y) : null,
          quadrant: qi >= 0 ? QUADRANTS[qi] : null,
          index: qi,
          mark: s.marks[id],
          parent: n.parent != null ? 'n' + n.parent : null,
        },
      });
    });
    const c = s.cursor;
    if (c && c.at != null && !c.result) {
      const p = layout.get(c.at);
      if (p) targets.set('cursor', { x: p.x + W / 2 + 4, y: p.y - H / 2 - 4, data: { kind: 'cursor', label: c.label }, from: { x: bounds.x, y: bounds.y } });
    }
    untrack(() => tween.set(targets, tweenMs));
  });

  const sprites = $derived(Array.from(tween.sprites));
  const fill = (d: Extract<Data, { kind: 'node' }>) => (d.value ? '#e0ffff' : '#ffffe0');
</script>

<Viewport {bounds} {fitKey} maxFitZoom={1.4} label={t('ui.viewTree')}>
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'node' && s.data.parent}
      {@const p = tween.sprites.get(s.data.parent)}
      {#if p}
        <!-- parent's bottom edge (NW, NE, SW, SE spread across it) -> child's top centre -->
        <line x1={p.x - W / 2 + 6 + s.data.index * 12} y1={p.y + H / 2} x2={s.x} y2={s.y - H / 2 + 1} opacity={Math.min(s.o, p.o)} />
      {/if}
    {/if}
  {/each}
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'node'}
      <g class="qnode" data-mark={s.data.mark ?? 'none'} transform="translate({s.x - W / 2} {s.y - H / 2})" opacity={s.o}>
        {#if s.data.quadrant}<text class="q" x={W / 2} y="-4">{s.data.quadrant}</text>{/if}
        <rect x="0.6" y="0.6" width={W - 1.2} height={H - 1.2} fill={fill(s.data)} />
        <text x={W / 2} y="16">{s.data.centre}</text>
        <line x1="1.5" y1="25" x2={W - 1.5} y2="25" />
        {#if s.data.value}<text x={W / 2} y="40">{s.data.value}</text>{/if}
      </g>
    {/if}
  {/each}
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'cursor'}
      <g class="cursor" transform="translate({s.x} {s.y})" opacity={s.o}>
        <rect x={-W / 2} y={-11} width={W} height="22" />
        <text x="0" y="3">{s.data.label}</text>
      </g>
    {/if}
  {/each}
</Viewport>

<style>
  line {
    stroke: #000;
    stroke-width: 1;
  }
  .qnode rect {
    stroke: #000;
    stroke-width: 1.2;
  }
  text {
    text-anchor: middle;
    font-size: 9px;
    fill: #000;
  }
  .q {
    fill: #666;
  }
  .qnode[data-mark='current'] rect {
    stroke-width: 2.4;
  }
  .qnode[data-mark='found'] rect {
    stroke: #7fff00;
    stroke-width: 3;
  }
  .qnode[data-mark='notfound'] rect,
  .qnode[data-mark='remove'] rect {
    stroke: #ff0000;
    stroke-width: 2.4;
  }
  .cursor rect {
    fill: #ffffe0;
    stroke: #000;
    stroke-width: 1.2;
  }
</style>
