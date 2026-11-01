import { AVLTree } from './core/avl';
import { BinarySearchTree, type BTreeState } from './core/bst';
import { QuadTree, type QState } from './core/quadtree';
import { TwoThreeTree, type TTState } from './core/twothree';
import type { OpResult } from './core/types';
import { dialogs } from './dialogs.svelte';
import { Player } from './player.svelte';

export interface Viz<M, S> {
  model: M;
  player: Player<S>;
}

/** The original apps start empty. */
function viz<M extends { clear(): OpResult<S> }, S>(model: M): Viz<M, S> {
  const player = new Player<S>();
  player.load(model.clear().steps, { autoplay: false });
  return { model, player };
}

/** Module level so that each visualization keeps its state across tab switches. */
export const bstViz = viz<BinarySearchTree, BTreeState>(new BinarySearchTree());
export const avlViz = viz<BinarySearchTree, BTreeState>(new AVLTree());
export const ttViz = viz<TwoThreeTree, TTState>(new TwoThreeTree());
export const quadViz = viz<QuadTree, QState>(new QuadTree());

export type TreeViz = typeof bstViz;

/** Plays an operation, or shows its error dialog (the original shows no animation then). */
export function play<S>(player: Player<S>, result: OpResult<S>, opts: { animate?: boolean } = {}): boolean {
  if (result.error) {
    dialogs.error(result.error);
    return false;
  }
  player.load(result.steps, opts.animate === false ? { autoplay: false, toEnd: true } : {});
  return true;
}
