<script lang="ts">
  import { t } from '../i18n/index.svelte';
  import type { PlayerControls } from '../player.svelte';

  /** Like the original 2-3 tree's read-only TextArea: descriptions accumulate as the animation runs. */
  let { player }: { player: PlayerControls } = $props();
  let box: HTMLOListElement | undefined = $state();

  const shown = $derived(player.steps.slice(0, player.index + 1));

  // Keep the latest line visible (manual scrolling so the page itself never scrolls).
  $effect(() => {
    void shown.length;
    if (box) box.scrollTop = box.scrollHeight;
  });
</script>

<ol class="description" bind:this={box} aria-label={t('ui.description')} aria-live="polite" data-testid="description">
  {#each shown as s, i (i)}
    <li class:current={i === player.index}>
      <button type="button" onclick={() => player.seek(i)}>{t(s.msg.key, s.msg.params)}</button>
    </li>
  {/each}
</ol>

<style>
  .description {
    margin: 0;
    padding: 3px 0;
    list-style: none;
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: #fff;
    border-top: 1px solid #b5b5b5;
    font-size: 13px;
    line-height: 1.35;
  }
  button {
    display: block;
    width: 100%;
    min-height: 0;
    padding: 1px 8px;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
    font-size: inherit;
    color: #444;
    cursor: pointer;
  }
  button:hover {
    background: #eef4fb;
  }
  .current button {
    color: #000;
    font-weight: 600;
    background: #dceaf8;
  }
</style>
