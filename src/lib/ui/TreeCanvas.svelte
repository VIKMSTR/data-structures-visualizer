<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { BTreeState } from '../core/bst';
  import { binaryLayout, boundsOf } from '../core/layout';
  import type { Step } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import { Tween, type Target } from '../tween.svelte';
  import Viewport from './Viewport.svelte';

  interface Props {
    step: Step<BTreeState> | undefined;
    tweenMs: number;
    fitKey: unknown;
  }
  let { step, tweenMs, fitKey }: Props = $props();

  /** Original BSTNodeWithLine / AVLNodeWithLine: 30x15, yellow, black 1 px inner border. */
  const W = 30;
  const H = 15;
  /** The search badge drops 50 px below the last node (original SearchFinishedEvent). */
  const DROP = 50;

  type Data =
    | { kind: 'node'; value: number; parent: string | null; left: boolean }
    | { kind: 'cursor'; label: string; result?: 'found' | 'notfound' }
    | { kind: 'arrow'; dir: 'left' | 'right' };

  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  const layout = $derived(step ? binaryLayout(step.state) : new Map<number, { x: number; y: number }>());
  const bounds = $derived(boundsOf(layout.values(), 40));

  $effect(() => {
    if (!step) return;
    const s = step;
    const targets = new Map<string, Target<Data>>();
    layout.forEach((p, id) => {
      const n = s.state.nodes[id];
      const parent = n.parent == null ? null : s.state.nodes[n.parent];
      targets.set('n' + id, {
        x: p.x,
        y: p.y,
        data: { kind: 'node', value: n.value, parent: parent ? 'n' + parent.id : null, left: !!parent && parent.left === id },
      });
    });
    const c = s.cursor;
    if (c) {
      const at = c.at != null ? layout.get(c.at) : undefined;
      const base = at ?? { x: 0, y: 0 };
      // Like the original moving node, the badge flies in from the top-left corner of the drawing.
      targets.set('cursor', {
        x: base.x,
        y: base.y + (c.drop ? DROP : 0),
        data: { kind: 'cursor', label: c.label, result: c.result },
        from: { x: bounds.x - 20, y: bounds.y - 20 },
      });
    }
    if (s.arrow) {
      const p = layout.get(s.arrow.at);
      if (p) targets.set('arrow' + s.arrow.at, { x: p.x, y: p.y, data: { kind: 'arrow', dir: s.arrow.dir } });
    }
    untrack(() => tween.set(targets, tweenMs));
  });

  const sprites = $derived(Array.from(tween.sprites));
</script>

<Viewport {bounds} {fitKey} maxFitZoom={1.6} label={t('ui.canvas')}>
  <g class="edges">
    {#each sprites as [key, s] (key)}
      {#if s.data.kind === 'node' && s.data.parent}
        {@const p = tween.sprites.get(s.data.parent)}
        {#if p}
          <!-- parent's bottom-left / bottom-right corner -> child's top-centre (+1 px) -->
          <line x1={p.x + (s.data.left ? -W / 2 : W / 2)} y1={p.y + H / 2} x2={s.x} y2={s.y - H / 2 + 1} opacity={Math.min(s.o, p.o)} />
        {/if}
      {/if}
    {/each}
  </g>
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'node'}
      <g class="node" transform="translate({s.x} {s.y})" opacity={s.o}>
        <rect x={-W / 2 + 0.5} y={-H / 2 + 0.5} width={W - 1} height={H - 1} />
        <text dy="0.35em">{s.data.value}</text>
      </g>
    {:else if s.data.kind === 'arrow'}
      <!-- Original RotationDirectionElement: arc under the node with an L-shaped tip -->
      <g class="arrow" transform="translate({s.x - W / 2} {s.y + H / 2})" opacity={s.o}>
        <path d="M0 15 Q15 0 30 15" />
        <path d={s.data.dir === 'left' ? 'M0 5 L0 15 L10 15' : 'M20 15 L30 15 L30 5'} />
      </g>
    {/if}
  {/each}
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'cursor'}
      <g class="node cursor" data-result={s.data.result ?? 'none'} transform="translate({s.x} {s.y})" opacity={s.o}>
        <rect x={-W / 2 + 0.5} y={-H / 2 + 0.5} width={W - 1} height={H - 1} />
        <text dy="0.35em">{s.data.label}</text>
      </g>
    {/if}
  {/each}
</Viewport>

<style>
  line {
    stroke: #000;
    stroke-width: 1;
  }
  .node rect {
    fill: #ffff00;
    stroke: #000;
    stroke-width: 1;
  }
  .node text {
    text-anchor: middle;
    font-size: 12px;
    fill: #000;
  }
  .cursor[data-result='found'] rect {
    fill: #90ee90;
  }
  .cursor[data-result='notfound'] rect {
    fill: #ffb6c1;
  }
  .arrow path {
    fill: none;
    stroke: #000;
    stroke-width: 1;
  }
</style>
