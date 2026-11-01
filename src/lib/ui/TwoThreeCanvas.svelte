<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { boundsOf, TT_CELL, ttNodeWidth, twoThreeLayout } from '../core/layout';
  import type { TTState } from '../core/twothree';
  import type { Step } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import { Tween, type Target } from '../tween.svelte';
  import Viewport from './Viewport.svelte';

  interface Props {
    step: Step<TTState> | undefined;
    tweenMs: number;
    fitKey: unknown;
  }
  let { step, tweenMs, fitKey }: Props = $props();

  const H = TT_CELL;
  type Data =
    | { kind: 'box'; w: number; cells: number; parent: string | null; anchor: number }
    | { kind: 'key'; value: number; found: boolean }
    | { kind: 'cursor'; label: string };

  const tween = new Tween<Data>();
  onDestroy(() => tween.destroy());

  const layout = $derived(step ? twoThreeLayout(step.state) : new Map<number, { x: number; y: number }>());
  const bounds = $derived(boundsOf(layout.values(), 60));

  /** Original child connectors: bottom edge at x + 22·i; a 2-node uses its two outer corners. */
  function anchorOffset(childCount: number, index: number, parentWidth: number): number {
    if (childCount === 1) return parentWidth / 2;
    if (childCount === 2) return index === 0 ? 0 : parentWidth;
    return index * TT_CELL;
  }

  $effect(() => {
    if (!step) return;
    const s = step;
    const targets = new Map<string, Target<Data>>();
    const c = s.cursor;
    layout.forEach((p, id) => {
      const n = s.state.nodes[id];
      const w = ttNodeWidth(n.keys.length);
      const parent = n.parent != null ? s.state.nodes[n.parent] : null;
      const anchor = parent ? anchorOffset(parent.children.length, parent.children.indexOf(id), ttNodeWidth(parent.keys.length)) : 0;
      targets.set('n' + id, { x: p.x, y: p.y, data: { kind: 'box', w, cells: Math.max(2, n.keys.length), parent: parent ? 'n' + parent.id : null, anchor } });
      const left = p.x - w / 2;
      n.keys.forEach((k, i) => {
        const found = !!c && c.result === 'found' && c.at === id && c.slot === i;
        targets.set('k' + k, { x: left + TT_CELL / 2 + i * TT_CELL, y: p.y, data: { kind: 'key', value: k, found } });
      });
    });
    // Original TwoThreeKey: a yellow circle (r = 10) carrying the key; it fades out at the end of a search.
    if (c && !c.result) {
      const at = c.at != null ? layout.get(c.at) : undefined;
      const base = at ?? { x: 0, y: 0 };
      targets.set('cursor', { x: base.x, y: base.y - H / 2 - 13, data: { kind: 'cursor', label: c.label }, from: { x: base.x, y: bounds.y - 10 } });
    }
    untrack(() => tween.set(targets, tweenMs));
  });

  const sprites = $derived(Array.from(tween.sprites));
</script>

<Viewport {bounds} {fitKey} maxFitZoom={1.6} label={t('ui.canvas')}>
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'box' && s.data.parent}
      {@const p = tween.sprites.get(s.data.parent)}
      {#if p && p.data.kind === 'box'}
        <line x1={p.x - p.data.w / 2 + s.data.anchor} y1={p.y + H / 2} x2={s.x - s.data.w / 2 + TT_CELL / 2} y2={s.y - H / 2 + 1} opacity={Math.min(s.o, p.o)} />
      {/if}
    {/if}
  {/each}
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'box'}
      <g class="box" transform="translate({s.x - s.data.w / 2} {s.y - H / 2})" opacity={s.o}>
        <rect x="0.5" y="0.5" width={s.data.w - 1} height={H - 1} />
        {#each { length: s.data.cells - 1 } as _, i (i)}
          <line class="divider" x1={(i + 1) * TT_CELL} y1="2" x2={(i + 1) * TT_CELL} y2={H} />
        {/each}
      </g>
    {/if}
  {/each}
  {#each sprites as [key, s] (key)}
    {#if s.data.kind === 'key'}
      <text class="key" class:found={s.data.found} x={s.x} y={s.y} dy="0.35em" opacity={s.o}>{s.data.value}</text>
    {:else if s.data.kind === 'cursor'}
      <g class="cursor" transform="translate({s.x} {s.y})" opacity={s.o}>
        <rect x={-Math.max(10, s.data.label.length * 4 + 3)} y="-10" width={2 * Math.max(10, s.data.label.length * 4 + 3)} height="20" rx="10" />
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
  .box rect {
    fill: #ffff00;
    stroke: #000;
    stroke-width: 1;
  }
  text {
    text-anchor: middle;
    font-size: 12px;
    fill: #000;
  }
  .key.found {
    fill: #ff0000;
    stroke: #ff0000;
    stroke-width: 0.4;
  }
  .cursor rect {
    fill: #ffff00;
    stroke: #000;
    stroke-width: 1;
  }
</style>
