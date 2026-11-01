<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { boundsOf, quadTreeLayout } from '../core/layout';
  import { QUADRANTS, type QState } from '../core/quadtree';
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

  type Data = {
    leaf: boolean;
    label: string | null;
    quadrant: string | null;
    mark?: Mark;
    parent: string | null;
  };
  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  const layout = $derived(step ? quadTreeLayout(step.state) : new Map<number, { x: number; y: number }>());
  const bounds = $derived(boundsOf(layout.values(), 34));

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
          leaf: !n.children,
          label: n.point ? `${n.point.x},${n.point.y}` : null,
          quadrant: qi >= 0 ? QUADRANTS[qi] : null,
          mark: s.marks[id] ?? (n.point ? s.marks[n.point.id] : undefined),
          parent: n.parent != null ? 'n' + n.parent : null,
        },
      });
    });
    // untrack: set() reads the current sprites; tracking them would restart the tween every frame.
    untrack(() => tween.set(targets, tweenMs));
  });

  const sprites = $derived(Array.from(tween.sprites));
</script>

<Viewport {bounds} {fitKey} label={t('ui.treeCanvas')}>
  {#each sprites as [key, s] (key)}
    {#if s.data.parent}
      {@const p = tween.sprites.get(s.data.parent)}
      {#if p}
        <line x1={p.x} y1={p.y} x2={s.x} y2={s.y} opacity={Math.min(s.o, p.o)} />
      {/if}
    {/if}
  {/each}
  {#each sprites as [key, s] (key)}
    <g class="qnode" data-mark={s.data.mark ?? 'none'} transform="translate({s.x} {s.y})" opacity={s.o}>
      {#if s.data.quadrant}
        <text class="q" y="-15">{s.data.quadrant}</text>
      {/if}
      {#if !s.data.leaf}
        <circle r="8" />
      {:else if s.data.label}
        <circle class="filled" r="8" />
        <text class="label" y="22">{s.data.label}</text>
      {:else}
        <rect x="-6" y="-6" width="12" height="12" />
      {/if}
    </g>
  {/each}
</Viewport>

<style>
  line {
    stroke: var(--edge);
    stroke-width: 1.5;
  }
  .qnode circle,
  .qnode rect {
    fill: var(--node-bg);
    stroke: var(--node-stroke);
    stroke-width: 2;
  }
  .qnode circle.filled {
    fill: var(--fg);
    stroke: var(--fg);
  }
  text {
    text-anchor: middle;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .q {
    font-size: 9px;
  }
  .label {
    font-size: 10px;
  }
  .qnode[data-mark='current'] circle,
  .qnode[data-mark='current'] rect {
    stroke: var(--m-current);
    stroke-width: 4;
  }
  .qnode[data-mark='path'] circle,
  .qnode[data-mark='path'] rect {
    fill: var(--m-path-bg);
  }
  .qnode[data-mark='new'] circle,
  .qnode[data-mark='new'] rect {
    fill: var(--m-new);
    stroke: var(--m-new);
  }
  .qnode[data-mark='found'] circle,
  .qnode[data-mark='found'] rect {
    fill: var(--m-found);
    stroke: var(--m-found);
  }
  .qnode[data-mark='remove'] circle,
  .qnode[data-mark='remove'] rect,
  .qnode[data-mark='notfound'] circle,
  .qnode[data-mark='notfound'] rect {
    stroke: var(--m-bad);
    stroke-width: 4;
  }
  .qnode[data-mark='moved'] circle,
  .qnode[data-mark='moved'] rect {
    stroke: var(--m-pivot);
    stroke-width: 4;
  }
  .qnode[data-mark]:not([data-mark='none']) .label {
    fill: var(--fg);
    font-weight: 600;
  }
</style>
