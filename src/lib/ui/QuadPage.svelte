<script lang="ts">
  import { fmtCoord, PLANE } from '../core/quadtree';
  import { dialogs } from '../dialogs.svelte';
  import { t } from '../i18n/index.svelte';
  import { QUAD_PRESETS } from '../presets';
  import { play, quadViz } from '../state.svelte';
  import QuadDiagram from './QuadDiagram.svelte';
  import QuadPlane from './QuadPlane.svelte';
  import Toolbar, { type Op } from './Toolbar.svelte';
  import VizLayout from './VizLayout.svelte';

  const viz = quadViz;
  /** Which view is shown on narrow screens; wide screens show both side by side. */
  let view = $state<'tree' | 'grid'>('tree');
  let toolbarRef: Toolbar | undefined = $state();

  const TITLE = { insert: 'errTitle.insert', remove: 'errTitle.remove', search: 'errTitle.search' } as const;
  const FORMAT = { insert: 'err.numberInsert', remove: 'err.numberRemove', search: 'err.numberSearch' } as const;

  /** Original getInputValue2D: two decimal fields, each within 0..100. */
  function onop(op: Op, a: string, b: string) {
    const num = (s: string) => (/^\s*[+-]?(\d+([.,]\d*)?|[.,]\d+)\s*$/.test(s) ? Number(s.trim().replace(',', '.')) : NaN);
    const x = num(a);
    const y = num(b);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      dialogs.error({ title: TITLE[op], msg: { key: FORMAT[op] } });
      return;
    }
    if (x < 0 || x > PLANE || y < 0 || y > PLANE) {
      dialogs.error({ title: TITLE[op], msg: { key: 'err.range' } });
      return;
    }
    play(viz.player, viz.model[op](x, y));
  }

  function tap(x: number, y: number) {
    toolbarRef?.setInput(String(x), String(y));
    play(viz.player, viz.model.insert(x, y));
  }

  function onpresets() {
    dialogs.presets(
      QUAD_PRESETS,
      (p) => (p.values as Array<[number, number]>).map(([x, y]) => `[${fmtCoord(x)},${fmtCoord(y)}]`).join(', '),
      (p, animate) => play(viz.player, viz.model.build(p.values as Array<[number, number]>), { animate }),
    );
  }
</script>

<VizLayout player={viz.player}>
  {#snippet toolbar()}
    <Toolbar
      bind:this={toolbarRef}
      player={viz.player}
      twoD
      {onop}
      {onpresets}
      onreset={() => viz.player.load(viz.model.clear().steps, { autoplay: false })}
      onhelp={() => dialogs.help('help.quad')}
    >
      {#snippet extra()}
        <button type="button" class="view-switch" data-testid="view-switch" onclick={() => (view = view === 'tree' ? 'grid' : 'tree')}>
          {view === 'tree' ? t('ui.viewGrid') : t('ui.viewTree')}
        </button>
      {/snippet}
    </Toolbar>
  {/snippet}
  {#snippet canvas()}
    <div class="panes" data-view={view}>
      <div class="pane tree"><QuadDiagram step={viz.player.step} tweenMs={viz.player.tweenMs} fitKey={viz.player.opId} /></div>
      <div class="pane grid" data-testid="quad-plane">
        <QuadPlane step={viz.player.step} tweenMs={viz.player.tweenMs} fitKey={viz.player.opId} ontap={tap} />
      </div>
    </div>
  {/snippet}
</VizLayout>

<style>
  .panes {
    display: flex;
    height: 100%;
    min-height: 0;
  }
  .pane {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
  }
  .pane.grid {
    border-left: 1px solid #c8c8c8;
  }
  .view-switch {
    display: none;
  }
  @media (max-width: 899px) {
    .view-switch {
      display: inline-block;
    }
    .panes[data-view='tree'] .grid,
    .panes[data-view='grid'] .tree {
      display: none;
    }
    .pane.grid {
      border-left: 0;
    }
  }
</style>
