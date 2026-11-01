<script lang="ts">
  import { t } from '../i18n/index.svelte';
  import type { PlayerControls } from '../player.svelte';

  let { player }: { player: PlayerControls } = $props();
  let list: HTMLOListElement | undefined = $state();

  // Keep the active step visible. Done manually (not scrollIntoView) so the page itself never scrolls.
  $effect(() => {
    const i = player.index;
    void player.steps;
    if (!list) return;
    const item = list.children[i] as HTMLElement | undefined;
    if (!item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  });
</script>

<div class="panel">
  <p class="current" aria-live="polite" data-testid="step-message">
    {#if player.step}{t(player.step.msg.key, player.step.msg.params)}{/if}
  </p>
  <h2>{t('ui.steps')}</h2>
  <ol bind:this={list}>
    {#each player.steps as s, i (i)}
      <li>
        <button type="button" class:active={i === player.index} class:done={i < player.index} onclick={() => player.seek(i)}>
          {t(s.msg.key, s.msg.params)}
        </button>
      </li>
    {/each}
  </ol>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .current {
    margin: 0;
    padding: 12px 14px;
    font-size: 15px;
    line-height: 1.45;
    min-height: 4.4em;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    padding: 10px 14px 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  ol {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0;
    padding: 0 6px 8px;
    list-style: none;
    counter-reset: step;
  }
  li {
    counter-increment: step;
  }
  li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 8px 6px 34px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-size: 13px;
    line-height: 1.35;
    color: var(--muted);
    position: relative;
    min-height: 0;
  }
  li button::before {
    content: counter(step);
    position: absolute;
    left: 6px;
    top: 6px;
    width: 22px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
  li button.done {
    color: var(--fg);
  }
  li button.active {
    background: var(--m-current-bg);
    color: var(--fg);
    font-weight: 600;
  }
  @media (max-width: 799px) {
    h2,
    ol {
      display: none;
    }
    .current {
      border-bottom: 0;
      min-height: 3em;
      font-size: 14px;
      padding: 8px 12px;
    }
  }
</style>
