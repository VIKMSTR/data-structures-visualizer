<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { BTreeState } from '../core/bst';
  import { fmtBalance } from '../core/bst';
  import { binaryLayout, boundsOf } from '../core/layout';
  import type { Mark, Step } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import { Tween, type Target } from '../tween.svelte';
  import Viewport from './Viewport.svelte';

  interface Props {
    step: Step<BTreeState> | undefined;
    tweenMs: number;
    fitKey: unknown;
    showBalance?: boolean;
  }
  let { step, tweenMs, fitKey, showBalance = false }: Props = $props();

  const R = 20;
  type NodeData = { kind: 'node'; value: number; bal?: number; mark?: Mark; parent: string | null };
  type CursorData = { kind: 'cursor'; label: string };
  type Data = NodeData | CursorData;

  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  const layout = $derived(step ? binaryLayout(step.state) : new Map<number, { x: number; y: number }>());
  const bounds = $derived(boundsOf(layout.values(), R + 34));

  $effect(() => {
    if (!step) return;
    const s = step;
    const targets = new Map<string, Target<Data>>();
    layout.forEach((p, id) => {
      const n = s.state.nodes[id];
      targets.set('n' + id, {
        x: p.x,
        y: p.y,
        data: { kind: 'node', value: n.value, bal: n.bal, mark: s.marks[id], parent: n.parent == null ? null : 'n' + n.parent },
      });
    });
    if (s.cursor) {
      const at = s.cursor.at != null ? layout.get(s.cursor.at) : undefined;
      const base = at ?? { x: 0, y: 0 };
      targets.set('cursor', { x: base.x + 26, y: base.y - 30, data: { kind: 'cursor', label: s.cursor.label } });
    }
    // untrack: set() reads the current sprites; tracking them would restart the tween every frame.
    untrack(() => tween.set(targets, tweenMs));
  });

  const sprites = $derived(Array.from(tween.sprites));
  const balClass = (b: number) => (Math.abs(b) >= 2 ? 'bad' : b === 0 ? 'zero' : 'ok');
</script>

<Viewport {bounds} {fitKey} label={t('ui.treeCanvas')}>
  <g class="edges">
    {#each sprites as [key, s] (key)}
      {#if s.data.kind === 'node' && s.data.parent}
        {@const p = tween.sprites.get(s.data.parent)}
        {#if p}
          <line x1={p.x} y1={p.y} x2={s.x} y2={s.y} opacity={Math.min(s.o, p.o)} />
        {/if}
      {/if}
    {/each}
  </g>
  <g class="nodes">
    {#each sprites as [key, s] (key)}
      {#if s.data.kind === 'node'}
        <g class="node" data-mark={s.data.mark ?? 'none'} transform="translate({s.x} {s.y})" opacity={s.o}>
          <circle r={R} />
          <text dy="0.35em">{s.data.value}</text>
          {#if showBalance && s.data.bal != null}
            <g class="bal {balClass(s.data.bal)}" transform="translate({R - 2} {-R + 2})">
              <circle r="10" />
              <text dy="0.35em">{fmtBalance(s.data.bal)}</text>
            </g>
          {/if}
        </g>
      {:else}
        <g class="cursor" transform="translate({s.x} {s.y})" opacity={s.o}>
          <rect x={-14 - s.data.label.length * 4} y="-13" width={28 + s.data.label.length * 8} height="26" rx="13" />
          <text dy="0.35em">{s.data.label}</text>
        </g>
      {/if}
    {/each}
  </g>
</Viewport>

<style>
  line {
    stroke: var(--edge);
    stroke-width: 2;
  }
  .node circle {
    fill: var(--node-bg);
    stroke: var(--node-stroke);
    stroke-width: 2;
  }
  .node text,
  .cursor text,
  .bal text {
    text-anchor: middle;
    font-size: 14px;
    font-weight: 600;
    fill: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .node[data-mark='current'] circle {
    stroke: var(--m-current);
    stroke-width: 4;
  }
  .node[data-mark='path'] circle {
    fill: var(--m-path-bg);
  }
  .node[data-mark='found'] circle {
    fill: var(--m-found);
    stroke: var(--m-found);
  }
  .node[data-mark='new'] circle {
    fill: var(--m-new);
    stroke: var(--m-new);
  }
  .node[data-mark='remove'] circle,
  .node[data-mark='imbalanced'] circle {
    fill: var(--m-bad);
    stroke: var(--m-bad);
  }
  .node[data-mark='notfound'] circle {
    stroke: var(--m-bad);
    stroke-width: 4;
    stroke-dasharray: 5 4;
  }
  .node[data-mark='pivot'] circle {
    fill: var(--m-pivot);
    stroke: var(--m-pivot);
  }
  .node[data-mark='moved'] circle {
    stroke: var(--m-pivot);
    stroke-width: 4;
  }
  .node[data-mark='found'] > text,
  .node[data-mark='new'] > text,
  .node[data-mark='remove'] > text,
  .node[data-mark='imbalanced'] > text,
  .node[data-mark='pivot'] > text {
    fill: #fff;
  }
  .bal circle {
    fill: var(--bg);
    stroke: var(--muted);
    stroke-width: 1.5;
  }
  .bal text {
    font-size: 10px;
    fill: var(--muted);
  }
  .bal.bad circle {
    fill: var(--m-bad);
    stroke: var(--m-bad);
  }
  .bal.bad text {
    fill: #fff;
  }
  .cursor rect {
    fill: var(--m-current);
  }
  .cursor text {
    fill: #1b1300;
  }
</style>
