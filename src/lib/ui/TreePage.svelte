<script lang="ts">
  import { MAX_VALUE, MIN_VALUE } from '../core/bst';
  import { parseValues } from '../core/parse';
  import { randomDistinct } from '../core/random';
  import { concatResults } from '../core/types';
  import { t } from '../i18n/index.svelte';
  import type { TreeViz } from '../state.svelte';
  import TreeCanvas from './TreeCanvas.svelte';
  import VizLayout from './VizLayout.svelte';

  let { viz, showBalance = false }: { viz: TreeViz; showBalance?: boolean } = $props();

  let input = $state('');
  let error = $state('');
  let field: HTMLInputElement | undefined = $state();

  function run(op: 'insert' | 'search' | 'remove') {
    const values = parseValues(input, MIN_VALUE, MAX_VALUE);
    if (!values) {
      error = t('ui.invalidValue', { min: MIN_VALUE, max: MAX_VALUE });
      return;
    }
    error = '';
    const m = viz.model;
    viz.player.load(concatResults(values.map((v) => m[op](v))).steps);
    if (op === 'insert') input = '';
    field?.select();
  }

  function random() {
    error = '';
    viz.player.load(viz.model.build(randomDistinct(10, 1, 99)).steps);
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
        <span>{t('ui.value')}</span>
        <input
          bind:this={field}
          bind:value={input}
          data-testid="value-input"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder={t('ui.valuePlaceholder')}
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
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </form>
  {/snippet}
  {#snippet canvas()}
    <TreeCanvas step={viz.player.step} tweenMs={viz.player.tweenMs} fitKey={viz.player.opId} {showBalance} />
  {/snippet}
</VizLayout>
