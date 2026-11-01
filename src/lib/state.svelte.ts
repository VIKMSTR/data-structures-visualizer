import { AVLTree } from './core/avl';
import { BinarySearchTree, type BTreeState } from './core/bst';
import { QuadTree, type QState } from './core/quadtree';
import { Player } from './player.svelte';

export interface TreeViz {
  model: BinarySearchTree;
  player: Player<BTreeState>;
}
export interface QuadViz {
  model: QuadTree;
  player: Player<QState>;
}

function treeViz(model: BinarySearchTree, initial: number[]): TreeViz {
  const player = new Player<BTreeState>();
  player.load(model.build(initial).steps, { autoplay: false, toEnd: true });
  return { model, player };
}

/** Lives at module level so that each visualization keeps its state across tab switches. */
export const bstViz = treeViz(new BinarySearchTree(), [50, 30, 70, 20, 40, 60, 80]);
export const avlViz = treeViz(new AVLTree(), [40, 20, 60, 10, 30]);

const quadModel = new QuadTree();
const quadPlayer = new Player<QState>();
quadPlayer.load(
  quadModel.build([
    [20, 75],
    [70, 85],
    [60, 30],
    [85, 15],
    [35, 40],
    [80, 60],
  ]).steps,
  { autoplay: false, toEnd: true },
);
export const quadViz: QuadViz = { model: quadModel, player: quadPlayer };
