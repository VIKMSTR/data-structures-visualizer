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
        r.add('avl.balanceOk', { node: n.value, bal: fmtBalance(b) }, { [n.id]: 'current' });
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
      r.add(
        'avl.imbalance',
        { node: n.value, bal: fmtBalance(b), case: kase },
        { [n.id]: 'imbalanced', [child.id]: 'pivot' },
      );

      if (kase === 'LR') {
        const top = this.rotateLeft(child);
        r.add('avl.doubleLR', { node: child.value }, { [n.id]: 'imbalanced', [top.id]: 'pivot' });
      } else if (kase === 'RL') {
        const top = this.rotateRight(child);
        r.add('avl.doubleRL', { node: child.value }, { [n.id]: 'imbalanced', [top.id]: 'pivot' });
      }
      const rotRight = kase === 'LL' || kase === 'LR';
      r.add(rotRight ? 'avl.rotateRight' : 'avl.rotateLeft', { node: n.value }, {
        [n.id]: 'imbalanced',
        [(rotRight ? n.left : n.right)!.id]: 'pivot',
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
