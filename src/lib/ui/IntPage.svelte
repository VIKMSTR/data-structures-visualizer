<script lang="ts" generics="S">
  import type { Snippet } from 'svelte';
  import type { OpResult } from '../core/types';
  import { dialogs, type Preset } from '../dialogs.svelte';
  import type { Player } from '../player.svelte';
  import { play } from '../state.svelte';
  import Toolbar, { type Op } from './Toolbar.svelte';
  import VizLayout from './VizLayout.svelte';

  interface Model {
    insert(v: number): OpResult<S>;
    remove(v: number): OpResult<S>;
    search(v: number): OpResult<S>;
    build(values: number[]): OpResult<S>;
    clear(): OpResult<S>;
  }
  interface Props {
    model: Model;
    player: Player<S>;
    presets: Preset[];
    helpKey: string;
    min: number;
    max: number;
    drawing: Snippet;
  }
  let { model, player, presets, helpKey, min, max, drawing }: Props = $props();

  const TITLE = { insert: 'errTitle.insert', remove: 'errTitle.remove', search: 'errTitle.search' } as const;
  const FORMAT = { insert: 'err.formatInsert', remove: 'err.formatRemove', search: 'err.formatSearch' } as const;

  /** Original: Integer.parseInt of the text field; anything else shows the format error dialog. */
  function onop(op: Op, text: string) {
    const s = text.trim();
    if (!/^[+-]?\d+$/.test(s)) {
      dialogs.error({ title: TITLE[op], msg: { key: FORMAT[op] } });
      return;
    }
    const v = Number(s);
    if (v < min || v > max) {
      dialogs.error({ title: TITLE[op], msg: { key: 'err.range1D', params: { min, max } } });
      return;
    }
    play(player, model[op](v));
  }

  function onpresets() {
    dialogs.presets(
      presets,
      (p) => (p.values as number[]).join(', '),
      (p, animate) => play(player, model.build(p.values as number[]), { animate }),
    );
  }
</script>

<VizLayout {player}>
  {#snippet toolbar()}
    <Toolbar
      {player}
      {onop}
      {onpresets}
      onreset={() => player.load(model.clear().steps, { autoplay: false })}
      onhelp={() => dialogs.help(helpKey)}
    />
  {/snippet}
  {#snippet canvas()}{@render drawing()}{/snippet}
</VizLayout>
