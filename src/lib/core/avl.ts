import {
  BinarySearchTree,
  balanceOf,
  fmtBalance,
  updateHeight,
  type BTreeState,
  type TreeNode,
} from './bst';
import type { Recorder } from './types';

export type AvlCase = 'LL' | 'RR' | 'LR' | 'RL';

/** AVL tree: a BST that re-balances itself with rotations after every change. */
export class AVLTree extends BinarySearchTree {
  constructor() {
    super();
    this.trackBalance = true;
  }

  protected override afterInsert(node: TreeNode, r: Recorder<BTreeState>): void {
    this.retrace(node.parent, r);
  }

  protected override afterRemove(from: TreeNode | null, r: Recorder<BTreeState>): void {
    this.retrace(from, r);
  }

  /** Walks up from `start`, fixing heights and rotating where |balance| = 2. */
  private retrace(start: TreeNode | null, r: Recorder<BTreeState>): void {
    let n = start;
    while (n) {
      const oldHeight = n.height;
      updateHeight(n);
      const b = balanceOf(n);

      if (Math.abs(b) <= 1) {
        r.add('avl.balanceOk', { node: n.value, bal: fmtBalance(b) }, { [n.id]: 'current' }, undefined, { pace: 0.5 });
        if (n.height === oldHeight && n.parent) {
          r.add('avl.stop', { node: n.value });
          return;
        }
        n = n.parent;
        continue;
      }

      const heavyRight = b > 0;
      const child = (heavyRight ? n.right : n.left)!;
      const cb = balanceOf(child);
      const kase: AvlCase = heavyRight ? (cb >= 0 ? 'RR' : 'RL') : cb <= 0 ? 'LL' : 'LR';
      r.add('avl.imbalance', { node: n.value, bal: fmtBalance(b), case: kase }, { [n.id]: 'imbalanced', [child.id]: 'pivot' });

      // Original: before each rotation a curved arrow fades in under the rotated node (2 s),
      // then the subtree glides into its new slots (1 s).
      if (kase === 'LR' || kase === 'RL') {
        const first: 'left' | 'right' = kase === 'LR' ? 'left' : 'right';
        r.add(kase === 'LR' ? 'avl.doubleLR' : 'avl.doubleRL', { node: child.value }, { [n.id]: 'imbalanced', [child.id]: 'pivot' }, undefined, {
          pace: 2,
          arrow: { at: child.id, dir: first },
        });
        const sub = first === 'left' ? this.rotateLeft(child) : this.rotateRight(child);
        r.add('avl.rotated', { top: sub.value }, { [n.id]: 'imbalanced', [sub.id]: 'pivot' });
      }
      const rotRight = kase === 'LL' || kase === 'LR';
      r.add(rotRight ? 'avl.rotateRight' : 'avl.rotateLeft', { node: n.value }, { [n.id]: 'imbalanced', [(rotRight ? n.left : n.right)!.id]: 'pivot' }, undefined, {
        pace: 2,
        arrow: { at: n.id, dir: rotRight ? 'right' : 'left' },
      });
      const top = rotRight ? this.rotateRight(n) : this.rotateLeft(n);
      r.add('avl.rotated', { top: top.value }, { [top.id]: 'pivot', [n.id]: 'moved' });
      n = top.parent;
    }
    if (start) r.add('avl.root');
  }

  /** Left rotation around x; returns the new subtree root. */
  private rotateLeft(x: TreeNode): TreeNode {
    const y = x.right!;
    x.right = y.left;
    if (y.left) y.left.parent = x;
    this.replace(x, y);
    y.left = x;
    x.parent = y;
    updateHeight(x);
    updateHeight(y);
    return y;
  }

  /** Right rotation around x; returns the new subtree root. */
  private rotateRight(x: TreeNode): TreeNode {
    const y = x.left!;
    x.left = y.right;
    if (y.right) y.right.parent = x;
    this.replace(x, y);
    y.right = x;
    x.parent = y;
    updateHeight(x);
    updateHeight(y);
    return y;
  }
}
