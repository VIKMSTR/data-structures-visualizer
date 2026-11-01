<script lang="ts">
  import { parsePoints } from '../core/parse';
  import { PLANE } from '../core/quadtree';
  import { randomPoints } from '../core/random';
  import { concatResults } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import type { QuadViz } from '../state.svelte';
  import QuadDiagram from './QuadDiagram.svelte';
  import QuadPlane from './QuadPlane.svelte';
  import VizLayout from './VizLayout.svelte';

  let { viz }: { viz: QuadViz } = $props();

  let input = $state('');
  let error = $state('');
  /** Which pane is visible on narrow screens (both are shown side by side on wide ones). */
  let view = $state<'plane' | 'tree'>('plane');

  function run(op: 'insert' | 'search' | 'remove') {
    const points = parsePoints(input, PLANE - 1);
    if (!points) {
      error = t('ui.invalidPoint', { max: PLANE - 1 });
      return;
    }
    error = '';
    const m = viz.model;
    viz.player.load(concatResults(points.map(([x, y]) => m[op](x, y))).steps);
  }

  function tap(x: number, y: number) {
    input = `${x}, ${y}`;
    run('insert');
  }

  function random() {
    error = '';
    viz.player.load(viz.model.build(randomPoints(8, PLANE - 1)).steps);
  }

  function clear() {
    error = '';
    viz.player.load(viz.model.clear().steps, { autoplay: false });
  }

  function onsubmit(e: SubmitEvent) {
    e.preventDefault();
    run('insert');
  }
</script>

<VizLayout player={viz.player}>
  {#snippet toolbar()}
    <form class="controls" {onsubmit}>
      <label>
        <span>{t('ui.point')}</span>
        <input
          bind:value={input}
          data-testid="value-input"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder={t('ui.pointPlaceholder')}
          aria-invalid={error ? 'true' : undefined}
        />
      </label>
      <div class="group">
        <button type="submit" class="primary">{t('op.insert')}</button>
        <button type="button" onclick={() => run('search')}>{t('op.search')}</button>
        <button type="button" onclick={() => run('remove')}>{t('op.remove')}</button>
      </div>
      <div class="group">
        <button type="button" onclick={random}>{t('op.random')}</button>
        <button type="button" onclick={clear}>{t('op.clear')}</button>
      </div>
      <div class="group switch" role="group">
        <button type="button" aria-pressed={view === 'plane'} onclick={() => (view = 'plane')}>{t('ui.viewPlane')}</button>
        <button type="button" aria-pressed={view === 'tree'} onclick={() => (view = 'tree')}>{t('ui.viewTree')}</button>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{:else}<p class="hint">{t('ui.quadHint')}</p>{/if}
    </form>
  {/snippet}
  {#snippet canvas()}
    <div class="panes" data-view={view}>
      <div class="pane plane" data-testid="quad-plane">
        <QuadPlane step={viz.player.step} tweenMs={viz.player.tweenMs} fitKey={viz.player.opId} ontap={tap} />
      </div>
      <div class="pane tree">
        <QuadDiagram step={viz.player.step} tweenMs={viz.player.tweenMs} fitKey={viz.player.opId} />
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
  .pane.tree {
    border-left: 1px solid var(--border);
  }
  .switch {
    display: none;
  }
  @media (max-width: 899px) {
    .switch {
      display: flex;
    }
    .panes[data-view='plane'] .tree,
    .panes[data-view='tree'] .plane {
      display: none;
    }
    .pane.tree {
      border-left: 0;
    }
  }
</style>
