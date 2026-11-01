<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PlayerControls } from '../player.svelte';
  import Description from './Description.svelte';

  /** Original BorderPane: toolbar on top, scrollable canvas in the centre, description area at the bottom. */
  let { player, toolbar, canvas }: { player: PlayerControls; toolbar: Snippet; canvas: Snippet } = $props();
</script>

<section class="viz">
  {@render toolbar()}
  <div class="canvas">{@render canvas()}</div>
  <div class="desc"><Description {player} /></div>
</section>

<style>
  .viz {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .canvas {
    flex: 1 1 auto;
    min-height: 0;
    background: #f4f4f4;
  }
  .desc {
    flex: 0 0 92px;
    min-height: 0;
  }
  @media (max-height: 560px), (max-width: 600px) {
    .desc {
      flex-basis: 64px;
    }
  }
</style>
