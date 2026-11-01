<script lang="ts">
  import { dialogs, type Preset } from '../dialogs.svelte';
  import { t, tHtml } from '../i18n/index.svelte';
  import Dialog from './Dialog.svelte';

  // Presets dialog state
  let selected = $state(0);
  let animate = $state(true);
  $effect(() => {
    if (dialogs.current && dialogs.current.kind === 'presets') {
      selected = 0; // the first preset is preselected (original)
    }
  });

  const presetName = (p: Preset) => (p.nameKey ? t(p.nameKey) : p.name);
</script>

{#if dialogs.current}
  {@const d = dialogs.current}
  {#if d.kind === 'error'}
    <Dialog title={t(d.title)} icon="error" width={400} height={150} onok={dialogs.close}>
      <!-- Static, translated message table; interpolated values are escaped by tHtml. -->
      <p data-testid="error-message">{@html tHtml(d.msg.key, d.msg.params)}</p>
    </Dialog>
  {:else if d.kind === 'help'}
    <Dialog title={t('ui.helpTitle')} icon="info" width={600} height={300} onok={dialogs.close}>
      <p data-testid="help-text">{@html tHtml(d.key)}</p>
      <p class="controls-help">{@html tHtml('help.controls')}</p>
    </Dialog>
  {:else}
    <Dialog
      title={t('presets.title')}
      icon="question"
      width={500}
      height={300}
      background="#ffffe0"
      onok={() => {
        // Capture before closing: `d` is reactive and becomes null once the dialog closes.
        const { presets, onok } = d;
        dialogs.close();
        onok(presets[selected], animate);
      }}
      oncancel={dialogs.close}
    >
      <div class="presets">
        <label for="preset-select">{t('presets.sets')}</label>
        <select id="preset-select" bind:value={selected}>
          {#each d.presets as p, i (i)}
            <option value={i}>{presetName(p)}</option>
          {/each}
        </select>
        <span class="items-label">{t('presets.items')}</span>
        <span class="items" data-testid="preset-items">{d.format(d.presets[selected])}</span>
        <label class="check"><input type="checkbox" bind:checked={animate} /> {t('presets.animate')}</label>
      </div>
    </Dialog>
  {/if}
{/if}

<style>
  p {
    margin: 0 0 6px;
  }
  .controls-help {
    margin-top: 10px;
    font-size: 12px;
    color: #444;
  }
  .presets {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    font-size: 12px;
    padding-top: 10px;
  }
  .presets select {
    min-width: 100px;
  }
  .items-label {
    padding-top: 10px;
  }
  .items {
    padding-bottom: 10px;
    overflow-wrap: anywhere;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
