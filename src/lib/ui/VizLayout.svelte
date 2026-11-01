<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PlayerControls } from '../player.svelte';
  import PlaybackBar from './PlaybackBar.svelte';
  import StepPanel from './StepPanel.svelte';

  let { player, toolbar, canvas }: { player: PlayerControls; toolbar: Snippet; canvas: Snippet } = $props();
</script>

<section class="viz">
  <div class="toolbar">{@render toolbar()}</div>
  <div class="canvas">{@render canvas()}</div>
  <aside class="side"><StepPanel {player} /></aside>
  <div class="playback"><PlaybackBar {player} /></div>
</section>

<style>
  .viz {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'toolbar toolbar'
      'canvas side'
      'playback playback';
    height: 100%;
    min-height: 0;
  }
  .toolbar {
    grid-area: toolbar;
    border-bottom: 1px solid var(--border);
  }
  .canvas {
    grid-area: canvas;
    min-height: 0;
    min-width: 0;
    background: var(--canvas);
  }
  .side {
    grid-area: side;
    min-height: 0;
    border-left: 1px solid var(--border);
    background: var(--bg);
  }
  .playback {
    grid-area: playback;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 799px) {
    .viz {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      grid-template-areas: 'toolbar' 'canvas' 'side' 'playback';
    }
    .side {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
  }
</style>
