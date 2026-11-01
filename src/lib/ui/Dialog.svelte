<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../i18n/index.svelte';

  /** Modal dialog modelled on MT-common's Dialog: utility title bar, 88 px icon column, buttons bottom-right. */
  interface Props {
    title: string;
    icon: 'error' | 'info' | 'question';
    width: number;
    height: number;
    background?: string;
    onok: () => void;
    oncancel?: () => void;
    children: Snippet;
  }
  let { title, icon, width, height, background = '#f5f5f5', onok, oncancel, children }: Props = $props();

  let okButton: HTMLButtonElement | undefined = $state();
  $effect(() => {
    okButton?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      (oncancel ?? onok)();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'SELECT') {
      e.preventDefault();
      onok();
    }
  }
</script>

<div class="backdrop" role="presentation" {onkeydown}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} style="width: {width}px; min-height: {height}px; background: {background}">
    <div class="titlebar">
      <span>{title}</span>
      <button type="button" class="close" aria-label={t('dlg.cancel')} onclick={oncancel ?? onok}>×</button>
    </div>
    <div class="body">
      <div class="icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48">
          {#if icon === 'error'}
            <circle cx="24" cy="24" r="21" fill="#d9302c" stroke="#a5201d" stroke-width="2" />
            <path d="M16 16 32 32M32 16 16 32" stroke="#fff" stroke-width="5" stroke-linecap="round" />
          {:else if icon === 'info'}
            <circle cx="24" cy="24" r="21" fill="#2f78d2" stroke="#1f58a0" stroke-width="2" />
            <circle cx="24" cy="14" r="3.2" fill="#fff" />
            <rect x="21" y="20" width="6" height="16" rx="2" fill="#fff" />
          {:else}
            <circle cx="24" cy="24" r="21" fill="#2f78d2" stroke="#1f58a0" stroke-width="2" />
            <text x="24" y="33" text-anchor="middle" font-size="26" font-weight="bold" fill="#fff">?</text>
          {/if}
        </svg>
      </div>
      <div class="content">{@render children()}</div>
    </div>
    <div class="buttons">
      <button type="button" bind:this={okButton} onclick={onok}>{t('dlg.ok')}</button>
      {#if oncancel}<button type="button" onclick={oncancel}>{t('dlg.cancel')}</button>{/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.18);
    padding: 8px;
  }
  .dialog {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    max-height: 100%;
    border: 1px solid #8c8c8c;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
    color: #000;
  }
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    padding: 0 0 0 10px;
    background: linear-gradient(#f9f9f9, #e9e9e9);
    border-bottom: 1px solid #c8c8c8;
    font-size: 12px;
  }
  .close {
    min-height: 0;
    height: 26px;
    width: 32px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 16px;
  }
  .close:hover {
    background: #e81123;
    color: #fff;
  }
  .body {
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
  }
  .icon {
    flex: 0 0 88px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .content {
    flex: 1 1 auto;
    min-width: 0;
    margin: 5px 20px 10px 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    font-size: 14px;
    line-height: 1.4;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 10px 20px 10px 10px;
  }
  .buttons button {
    min-width: 64px;
  }
</style>
