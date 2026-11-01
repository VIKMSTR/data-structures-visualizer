<script lang="ts">
  import { i18n, t } from './lib/i18n/index.svelte';
  import type { PlayerControls } from './lib/player.svelte';
  import { avlViz, bstViz, quadViz } from './lib/state.svelte';
  import QuadPage from './lib/ui/QuadPage.svelte';
  import TreePage from './lib/ui/TreePage.svelte';

  const TABS = ['bst', 'avl', 'quad'] as const;
  type Tab = (typeof TABS)[number];

  const fromHash = (): Tab => {
    const h = location.hash.replace('#', '');
    return (TABS as readonly string[]).indexOf(h) >= 0 ? (h as Tab) : 'bst';
  };

  let tab = $state<Tab>(fromHash());

  function select(next: Tab) {
    tab = next;
    history.replaceState(null, '', '#' + next);
  }

  const player = $derived<PlayerControls>(tab === 'bst' ? bstViz.player : tab === 'avl' ? avlViz.player : quadViz.player);

  $effect(() => {
    document.documentElement.lang = i18n.lang;
    document.title = t('app.title');
  });

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && el && el.tagName === 'BUTTON') return; // let Space activate buttons
    const actions: Record<string, () => void> = {
      ' ': player.toggle,
      ArrowLeft: player.prev,
      ArrowRight: player.next,
      Home: player.first,
      End: player.last,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }
</script>

<svelte:window {onkeydown} onhashchange={() => (tab = fromHash())} />

<div class="app">
  <header>
    <div class="brand">
      <img src="./icon.svg" alt="" width="28" height="28" />
      <h1>{t('app.title')}</h1>
    </div>
    <div class="tabs" role="tablist" aria-label={t('app.title')}>
      {#each TABS as id (id)}
        <button type="button" role="tab" aria-selected={tab === id} onclick={() => select(id)}>{t('tab.' + id)}</button>
      {/each}
    </div>
    <button type="button" class="lang" onclick={i18n.toggle} lang={i18n.lang === 'cs' ? 'en' : 'cs'}>{t('lang.switch')}</button>
  </header>
  <main>
    {#if tab === 'bst'}
      <TreePage viz={bstViz} />
    {:else if tab === 'avl'}
      <TreePage viz={avlViz} showBalance />
    {:else}
      <QuadPage viz={quadViz} />
    {/if}
  </main>
</div>

<style>
  .app {
    /* fixed + inset instead of 100vh: avoids the mobile-Safari/WKWebView viewport-height bugs */
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-left: auto;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .tabs button {
    white-space: nowrap;
    border-color: transparent;
    background: transparent;
  }
  .tabs button[aria-selected='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .lang {
    white-space: nowrap;
  }
  main {
    flex: 1 1 auto;
    min-height: 0;
  }
  @media (max-width: 799px) {
    header {
      flex-wrap: wrap;
      gap: 6px 10px;
    }
    .tabs {
      order: 3;
      flex-basis: 100%;
      margin-left: 0;
    }
    .tabs button {
      flex: 1 1 auto;
    }
    .lang {
      margin-left: auto;
    }
  }
</style>
