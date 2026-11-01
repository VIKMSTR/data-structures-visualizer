<script lang="ts" module>
  export type Op = 'insert' | 'remove' | 'search';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../i18n/index.svelte';
  import { SPEED_MAX, SPEED_MIN, type PlayerControls } from '../player.svelte';

  /** Original CommonControls toolbar:
   *  Prvek: [text] | Vložit Odstranit Najít | ☐ Krokovat << >> | Rychlost: [slider] Play/Pause Vzory Reset ? */
  interface Props {
    player: PlayerControls;
    twoD?: boolean;
    onop: (op: Op, a: string, b: string) => void;
    onpresets: () => void;
    onreset: () => void;
    onhelp: () => void;
    extra?: Snippet;
  }
  let { player, twoD = false, onop, onpresets, onreset, onhelp, extra }: Props = $props();

  let a = $state('');
  let b = $state('');

  export function setInput(x: string, y = '') {
    a = x;
    b = y;
  }

  function run(op: Op) {
    onop(op, a, b);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      run('insert');
    }
  }
</script>

<div class="toolbar" role="toolbar">
  <div class="group">
    <label class="label" for="element-input">{t('ui.element')}</label>
    <input id="element-input" class:short={twoD} data-testid="value-input" bind:value={a} {onkeydown} inputmode={twoD ? 'decimal' : 'numeric'} autocomplete="off" placeholder={twoD ? 'x' : ''} />
    {#if twoD}
      <input class="short" data-testid="value-input-y" aria-label="y" bind:value={b} {onkeydown} inputmode="decimal" autocomplete="off" placeholder="y" />
    {/if}
  </div>
  <span class="sep"></span>
  <div class="group">
    <button type="button" onclick={() => run('insert')}>{t('op.insert')}</button>
    <button type="button" onclick={() => run('remove')}>{t('op.remove')}</button>
    <button type="button" onclick={() => run('search')}>{t('op.search')}</button>
  </div>
  {#if extra}
    <span class="sep"></span>
    <div class="group">{@render extra()}</div>
  {/if}
  <span class="sep"></span>
  <div class="group">
    <label class="check">
      <input type="checkbox" checked={player.stepping} onchange={(e) => player.setStepping((e.currentTarget as HTMLInputElement).checked)} />
      {t('ui.stepping')}
    </label>
    <button type="button" title={t('ui.prev')} aria-label={t('ui.prev')} onclick={player.back} disabled={player.atStart}>&lt;&lt;</button>
    <button type="button" title={t('ui.next')} aria-label={t('ui.next')} onclick={player.forward} disabled={player.atEnd}>&gt;&gt;</button>
  </div>
  <span class="sep"></span>
  <div class="group">
    <label class="label" for="speed">{t('ui.speed')}</label>
    <input
      id="speed"
      class="slider"
      type="range"
      min={SPEED_MIN}
      max={SPEED_MAX}
      step="0.05"
      value={player.speed}
      oninput={(e) => player.setSpeed(Number((e.currentTarget as HTMLInputElement).value))}
    />
    <button type="button" data-testid="play" aria-pressed={player.playing} onclick={player.toggle}>{t('ui.playPause')}</button>
    <button type="button" onclick={onpresets}>{t('op.presets')}</button>
    <button type="button" onclick={onreset}>{t('op.reset')}</button>
    <button type="button" title={t('ui.helpTitle')} aria-label={t('ui.helpTitle')} onclick={onhelp}>?</button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: linear-gradient(#fafafa, #f2f2f2 85%, #e8e8e8);
    border-top: 1px solid #dadada;
    border-bottom: 1px solid #b5b5b5;
    font-size: 12px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label {
    padding: 0 2px 0 4px;
  }
  .sep {
    align-self: stretch;
    width: 0;
    margin: 2px 4px;
    border-left: 1px solid #c8c8c8;
    border-right: 1px solid #fff;
  }
  input:not([type]) {
    width: 149px;
  }
  input.short {
    width: 50px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 4px;
  }
  .slider {
    width: 132px;
  }
  @media (max-width: 760px) {
    .sep {
      display: none;
    }
    .toolbar {
      gap: 6px;
    }
    input:not([type]) {
      flex: 1 1 auto;
      width: 90px;
    }
    .slider {
      width: 100px;
    }
  }
</style>
