import { balanceOf, type BinarySearchTree, type TreeNode } from './bst';

/** Throws if BST ordering, parent links or stored heights are inconsistent; returns the height. */
export function checkTree(tree: BinarySearchTree, avl: boolean): number {
  const walk = (n: TreeNode | null, parent: TreeNode | null, lo: number, hi: number): number => {
    if (!n) return -1;
    if (n.parent !== parent) throw new Error(`bad parent link at ${n.value}`);
    if (n.value <= lo || n.value >= hi) throw new Error(`order violated at ${n.value}`);
    const h = 1 + Math.max(walk(n.left, n, lo, n.value), walk(n.right, n, n.value, hi));
    if (h !== n.height) throw new Error(`stale height at ${n.value}: ${n.height} != ${h}`);
    if (avl && Math.abs(balanceOf(n)) > 1) throw new Error(`unbalanced at ${n.value}`);
    return h;
  };
  return walk(tree.root, null, -Infinity, Infinity);
}
