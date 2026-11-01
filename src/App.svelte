<script lang="ts">
  import { BinarySearchTree, MAX_VALUE, MIN_VALUE } from './lib/core/bst';
  import { TT_MAX_VALUE, TT_MIN_VALUE } from './lib/core/twothree';
  import { dialogs } from './lib/dialogs.svelte';
  import { i18n, t } from './lib/i18n/index.svelte';
  import type { PlayerControls } from './lib/player.svelte';
  import { BINARY_PRESETS, TWO_THREE_PRESETS } from './lib/presets';
  import { avlViz, bstViz, quadViz, ttViz } from './lib/state.svelte';
  import Dialogs from './lib/ui/Dialogs.svelte';
  import IntPage from './lib/ui/IntPage.svelte';
  import QuadPage from './lib/ui/QuadPage.svelte';
  import TreeCanvas from './lib/ui/TreeCanvas.svelte';
  import TwoThreeCanvas from './lib/ui/TwoThreeCanvas.svelte';

  const TABS = ['bst', 'avl', 'tt', 'quad'] as const;
  type Tab = (typeof TABS)[number];
  /** Window titles of the original applications. */
  const TITLES: Record<Tab, string> = { bst: 'Binary Search tree', avl: 'AVL tree', tt: '2-3 strom', quad: 'Quad Tree' };

  const fromHash = (): Tab => {
    const h = location.hash.replace('#', '');
    return (TABS as readonly string[]).indexOf(h) >= 0 ? (h as Tab) : 'bst';
  };

  let tab = $state<Tab>(fromHash());

  function select(next: Tab) {
    tab = next;
    history.replaceState(null, '', '#' + next);
  }

  const player = $derived<PlayerControls>(
    tab === 'bst' ? bstViz.player : tab === 'avl' ? avlViz.player : tab === 'tt' ? ttViz.player : quadViz.player,
  );

  $effect(() => {
    document.documentElement.lang = i18n.lang;
    document.title = `${TITLES[tab]} — ${t('app.title')}`;
  });

  function onkeydown(e: KeyboardEvent) {
    if (dialogs.current) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && el && el.tagName === 'BUTTON') return; // let Space activate buttons
    const actions: Record<string, () => void> = {
      ' ': player.toggle,
      ArrowLeft: () => player.stepBy(-1),
      ArrowRight: () => player.stepBy(1),
      Home: player.first,
      End: player.last,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  // Keep the generic page typed for both binary trees.
  const bstModel: BinarySearchTree = bstViz.model;
  const avlModel: BinarySearchTree = avlViz.model;
</script>

<svelte:window {onkeydown} onhashchange={() => (tab = fromHash())} />

<div class="app">
  <header>
    <div class="tabs" role="tablist" aria-label={t('app.title')}>
      {#each TABS as id (id)}
        <button type="button" role="tab" aria-selected={tab === id} aria-label={t('tab.' + id)} onclick={() => select(id)}>
          <span class="long">{t('tab.' + id)}</span><span class="short" aria-hidden="true">{t('tab.' + id + '.short')}</span>
        </button>
      {/each}
    </div>
    <button type="button" class="lang" onclick={i18n.toggle} lang={i18n.lang === 'cs' ? 'en' : 'cs'}>{t('lang.switch')}</button>
  </header>
  <main>
    {#if tab === 'bst'}
      <IntPage model={bstModel} player={bstViz.player} presets={BINARY_PRESETS} helpKey="help.bst" min={MIN_VALUE} max={MAX_VALUE}>
        {#snippet drawing()}<TreeCanvas step={bstViz.player.step} tweenMs={bstViz.player.tweenMs} fitKey={bstViz.player.opId} />{/snippet}
      </IntPage>
    {:else if tab === 'avl'}
      <IntPage model={avlModel} player={avlViz.player} presets={BINARY_PRESETS} helpKey="help.avl" min={MIN_VALUE} max={MAX_VALUE}>
        {#snippet drawing()}<TreeCanvas step={avlViz.player.step} tweenMs={avlViz.player.tweenMs} fitKey={avlViz.player.opId} />{/snippet}
      </IntPage>
    {:else if tab === 'tt'}
      <IntPage model={ttViz.model} player={ttViz.player} presets={TWO_THREE_PRESETS} helpKey="help.tt" min={TT_MIN_VALUE} max={TT_MAX_VALUE}>
        {#snippet drawing()}<TwoThreeCanvas step={ttViz.player.step} tweenMs={ttViz.player.tweenMs} fitKey={ttViz.player.opId} />{/snippet}
      </IntPage>
    {:else}
      <QuadPage />
    {/if}
  </main>
  <Dialogs />
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
  /* JavaFX Modena TabPane look */
  header {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 6px 8px 0;
    background: linear-gradient(#e4e4e4, #d6d6d6);
    border-bottom: 1px solid #b5b5b5;
  }
  .tabs {
    display: flex;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .tabs button {
    white-space: nowrap;
    border-radius: 4px 4px 0 0;
    border-bottom: 0;
    margin-bottom: -1px;
    background: linear-gradient(#f0f0f0, #dcdcdc);
  }
  .tabs button[aria-selected='true'] {
    background: linear-gradient(#ffffff, #fafafa);
    border-color: #b5b5b5;
    position: relative;
    z-index: 1;
    padding-bottom: 1px;
  }
  .lang {
    margin-left: auto;
    margin-bottom: 4px;
    white-space: nowrap;
  }
  .short {
    display: none;
  }
  @media (max-width: 600px) {
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
  }
  main {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
