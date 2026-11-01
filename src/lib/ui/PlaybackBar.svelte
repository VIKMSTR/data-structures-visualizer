<script lang="ts">
  import { t } from '../i18n/index.svelte';
  import { SPEEDS, type PlayerControls } from '../player.svelte';
  import Icon from './Icon.svelte';

  let { player }: { player: PlayerControls } = $props();
  const n = $derived(player.steps.length);
</script>

<div class="bar">
  <div class="buttons">
    <button type="button" title={t('ui.first')} aria-label={t('ui.first')} onclick={player.first} disabled={player.index === 0}>
      <Icon name="first" />
    </button>
    <button type="button" title={t('ui.prev')} aria-label={t('ui.prev')} onclick={player.prev} disabled={player.index === 0}>
      <Icon name="prev" />
    </button>
    <button
      type="button"
      class="primary"
      data-testid="play"
      title={player.playing ? t('ui.pause') : t('ui.play')}
      aria-label={player.playing ? t('ui.pause') : t('ui.play')}
      onclick={player.toggle}
      disabled={n < 2}
    >
      <Icon name={player.playing ? 'pause' : 'play'} />
    </button>
    <button type="button" title={t('ui.next')} aria-label={t('ui.next')} onclick={player.next} disabled={player.atEnd}>
      <Icon name="next" />
    </button>
    <button type="button" title={t('ui.last')} aria-label={t('ui.last')} onclick={player.last} disabled={player.atEnd}>
      <Icon name="last" />
    </button>
  </div>
  <input
    class="seek"
    type="range"
    min="0"
    max={Math.max(0, n - 1)}
    value={player.index}
    aria-label={t('ui.seek')}
    oninput={(e) => player.seek(Number((e.currentTarget as HTMLInputElement).value))}
    disabled={n < 2}
  />
  <span class="counter" data-testid="step-counter">
    <span class="long">{t('ui.step', { i: n ? player.index + 1 : 0, n })}</span>
    <span class="short" aria-hidden="true">{n ? player.index + 1 : 0} / {n}</span>
  </span>
  <label class="speed">
    <span>{t('ui.speed')}</span>
    <select value={player.speed} onchange={(e) => player.setSpeed(Number((e.currentTarget as HTMLSelectElement).value))}>
      {#each SPEEDS as s (s)}
        <option value={s}>{s}×</option>
      {/each}
    </select>
  </label>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    flex-wrap: wrap;
  }
  .buttons {
    display: flex;
    gap: 4px;
  }
  .buttons button {
    width: 40px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .seek {
    flex: 1 1 160px;
    min-width: 120px;
    accent-color: var(--accent);
  }
  .counter {
    font-size: 13px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 7em;
  }
  .speed {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
  }
  .short {
    display: none;
  }
  @media (max-width: 799px) {
    .long {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .short {
      display: inline;
    }
    .buttons button {
      width: 38px;
    }
    .bar {
      gap: 8px;
      padding: 6px 8px;
    }
    .seek {
      order: -1;
      flex-basis: 100%;
    }
    .counter {
      min-width: 0;
      flex: 1 1 auto;
      text-align: center;
    }
    .speed span {
      display: none;
    }
  }
</style>
