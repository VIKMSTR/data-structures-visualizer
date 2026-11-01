import { PACE, Recorder, type Cursor, type Marks, type OpResult } from './types';

/** The original accepted any int; the 30 px wide node box fits four characters. */
export const MIN_VALUE = -999;
export const MAX_VALUE = 9999;

/** Immutable node as stored in a step snapshot. */
export interface BNode {
  id: number;
  value: number;
  left: number | null;
  right: number | null;
  parent: number | null;
  /** AVL balance factor = height(right) - height(left); only present for AVL trees. */
  bal?: number;
}

export interface BTreeState {
  root: number | null;
  nodes: Record<number, BNode>;
}

export class TreeNode {
  left: TreeNode | null = null;
  right: TreeNode | null = null;
  parent: TreeNode | null = null;
  /** Height of the subtree; a leaf has height 0, an empty subtree -1. */
  height = 0;
  readonly id: number;
  readonly value: number;

  constructor(id: number, value: number) {
    this.id = id;
    this.value = value;
  }
}

export const heightOf = (n: TreeNode | null): number => (n ? n.height : -1);
export const balanceOf = (n: TreeNode): number => heightOf(n.right) - heightOf(n.left);
export const updateHeight = (n: TreeNode): void => {
  n.height = 1 + Math.max(heightOf(n.left), heightOf(n.right));
};
export const fmtBalance = (b: number): string => (b > 0 ? `+${b}` : String(b));

interface DescendResult {
  node: TreeNode | null;
  last: TreeNode;
  goLeft: boolean;
  path: Marks;
}

const cursor = (value: number, at: number | null): Cursor => ({ label: String(value), at });

/**
 * Binary search tree that records every step of its operations.
 * Removal of a node with two children uses the in-order predecessor
 * (maximum of the left subtree), as in the original thesis implementation.
 */
export class BinarySearchTree {
  root: TreeNode | null = null;
  protected trackBalance = false;
  protected nextId = 1;

  get size(): number {
    let count = 0;
    const stack: TreeNode[] = this.root ? [this.root] : [];
    while (stack.length) {
      const n = stack.pop()!;
      count++;
      if (n.left) stack.push(n.left);
      if (n.right) stack.push(n.right);
    }
    return count;
  }

  snapshot(): BTreeState {
    const nodes: Record<number, BNode> = {};
    const stack: TreeNode[] = this.root ? [this.root] : [];
    while (stack.length) {
      const n = stack.pop()!;
      const s: BNode = {
        id: n.id,
        value: n.value,
        left: n.left ? n.left.id : null,
        right: n.right ? n.right.id : null,
        parent: n.parent ? n.parent.id : null,
      };
      if (this.trackBalance) s.bal = balanceOf(n);
      nodes[n.id] = s;
      if (n.left) stack.push(n.left);
      if (n.right) stack.push(n.right);
    }
    return { root: this.root ? this.root.id : null, nodes };
  }

  /** Sorted values (in-order traversal). */
  values(): number[] {
    const out: number[] = [];
    const walk = (n: TreeNode | null): void => {
      if (!n) return;
      walk(n.left);
      out.push(n.value);
      walk(n.right);
    };
    walk(this.root);
    return out;
  }

  protected recorder(): Recorder<BTreeState> {
    return new Recorder(() => this.snapshot());
  }

  clear(): OpResult<BTreeState> {
    this.root = null;
    this.nextId = 1;
    const r = this.recorder();
    r.add('tree.cleared');
    return r.done(true);
  }

  /** Preset build ("Vzory"): reset, then insert every value with full animation played at 10x. */
  build(values: number[]): OpResult<BTreeState> {
    this.root = null;
    this.nextId = 1;
    const r = this.recorder();
    r.add('build.start', { n: values.length });
    r.pace = 0.1;
    for (const v of values) {
      if (this.find(v)) r.add('build.duplicate', { value: v });
      else this.doInsert(v, r);
    }
    r.pace = 1;
    r.add('build.done', { n: this.size });
    return r.done(true);
  }

  find(value: number): TreeNode | null {
    let n = this.root;
    while (n && n.value !== value) n = value < n.value ? n.left : n.right;
    return n;
  }

  insert(value: number): OpResult<BTreeState> {
    const r = this.recorder();
    if (this.find(value)) return r.fail('errTitle.insert', 'err.duplicate');
    return r.done(this.doInsert(value, r));
  }

  search(value: number): OpResult<BTreeState> {
    const r = this.recorder();
    if (!this.root) return r.fail('errTitle.search', 'err.empty');
    const d = this.descend(value, r, 'search.start');
    // Original: the badge turns LIGHTGREEN / LIGHTPINK on the last node, then drops 50 px.
    if (d.node) {
      r.add('search.found', { value }, { ...d.path, [d.node.id]: 'found' }, { ...cursor(value, d.node.id), result: 'found', drop: true });
      return r.done(true);
    }
    r.add(
      d.goLeft ? 'search.notFoundLeft' : 'search.notFoundRight',
      { value, node: d.last.value },
      { ...d.path, [d.last.id]: 'notfound' },
      { ...cursor(value, d.last.id), result: 'notfound', drop: true },
    );
    return r.done(false);
  }

  /**
   * Remove as described in the thesis: an inner node is first swapped with its in-order
   * successor (leftmost node of the right subtree) — the two nodes visibly trade places —
   * and is then cut off. A node with only a left child is replaced by that child.
   */
  remove(value: number): OpResult<BTreeState> {
    const r = this.recorder();
    if (!this.root) return r.fail('errTitle.remove', 'err.empty');
    if (!this.find(value)) return r.fail('errTitle.remove', 'err.notInTree');
    const d = this.descend(value, r, 'remove.start');
    const t = d.node!;
    const path = d.path;
    let retraceFrom: TreeNode | null;

    if (t.right) {
      let s = t.right;
      while (s.left) s = s.left;
      {
        r.add('remove.inner', { value, succ: s.value }, { ...path, [t.id]: 'remove', [s.id]: 'moved' }, cursor(value, t.id));
      }
      this.swapWithSuccessor(t, s);
      // The badge stays on the original slot, which the successor now occupies.
      r.add('remove.swapped', { value, succ: s.value }, { [t.id]: 'remove', [s.id]: 'moved' }, cursor(value, s.id));
      retraceFrom = t.parent;
      const child = t.right;
      this.replace(t, child);
      r.add(child ? 'remove.doneSpliced' : 'remove.done', { value, child: child ? child.value : '' }, child ? { [child.id]: 'moved' } : {}, undefined, {
        pace: PACE.fade + PACE.shift,
      });
    } else if (t.left) {
      const child = t.left;
      r.add('remove.leftOnly', { value, child: child.value }, { ...path, [t.id]: 'remove', [child.id]: 'moved' }, cursor(value, t.id));
      retraceFrom = t.parent;
      this.replace(t, child);
      r.add('remove.done', { value }, { [child.id]: 'moved' }, undefined, { pace: PACE.fade + PACE.shift });
    } else {
      r.add('remove.leaf', { value }, { ...path, [t.id]: 'remove' }, cursor(value, t.id));
      retraceFrom = t.parent;
      this.replace(t, null);
      r.add('remove.done', { value }, {}, undefined, { pace: PACE.fade + PACE.shift });
    }
    this.afterRemove(retraceFrom, r);
    return r.done(true);
  }

  // ---- hooks for subclasses -------------------------------------------------

  /** Called after a new leaf was linked in. */
  protected afterInsert(node: TreeNode, _r: Recorder<BTreeState>): void {
    for (let n = node.parent; n; n = n.parent) updateHeight(n);
  }

  /** Called after a node was unlinked; `from` is the lowest node whose subtree changed. */
  protected afterRemove(from: TreeNode | null, _r: Recorder<BTreeState>): void {
    for (let n = from; n; n = n.parent) updateHeight(n);
  }

  // ---- helpers ---------------------------------------------------------------

  protected doInsert(value: number, r: Recorder<BTreeState>): boolean {
    if (!this.root) {
      this.root = this.newNode(value);
      r.add('insert.root', { value }, { [this.root.id]: 'new' });
      this.afterInsert(this.root, r);
      return true;
    }
    const d = this.descend(value, r, 'insert.start');
    if (d.node) {
      r.add('insert.duplicate', { value }, { ...d.path, [d.node.id]: 'found' }, cursor(value, d.node.id));
      return false;
    }
    const n = this.newNode(value);
    n.parent = d.last;
    if (d.goLeft) d.last.left = n;
    else d.last.right = n;
    // Original: neighbours shift aside (400 ms), the badge vanishes and the new node fades in (200 ms).
    r.add(
      d.goLeft ? 'insert.asLeft' : 'insert.asRight',
      { value, node: d.last.value },
      { ...d.path, [d.last.id]: 'path', [n.id]: 'new' },
      undefined,
      { pace: PACE.shift + PACE.fade },
    );
    this.afterInsert(n, r);
    return true;
  }

  /** Walks from the root towards `value`, recording one step per comparison. */
  private descend(value: number, r: Recorder<BTreeState>, startKey: string): DescendResult {
    let cur = this.root!;
    const path: Marks = {};
    r.add(startKey, { value }, { [cur.id]: 'current' }, cursor(value, cur.id));
    for (;;) {
      if (value === cur.value) return { node: cur, last: cur, goLeft: false, path };
      const goLeft = value < cur.value;
      const next = goLeft ? cur.left : cur.right;
      if (!next) return { node: null, last: cur, goLeft, path };
      path[cur.id] = 'path';
      r.add(
        goLeft ? 'cmp.left' : 'cmp.right',
        { value, node: cur.value },
        { ...path, [next.id]: 'current' },
        cursor(value, next.id),
      );
      cur = next;
    }
  }

  private newNode(value: number): TreeNode {
    return new TreeNode(this.nextId++, value);
  }

  /** Swaps node `t` with its in-order successor `s` (s has no left child and lies in t's right subtree). */
  private swapWithSuccessor(t: TreeNode, s: TreeNode): void {
    const tLeft = t.left;
    const tRight = t.right;
    const sParent = s.parent;
    const sRight = s.right;
    this.replace(t, s);
    s.left = tLeft;
    if (tLeft) tLeft.parent = s;
    if (sParent === t) {
      s.right = t;
      t.parent = s;
    } else {
      s.right = tRight;
      tRight!.parent = s;
      sParent!.left = t;
      t.parent = sParent;
    }
    t.left = null;
    t.right = sRight;
    if (sRight) sRight.parent = t;
    // Heights belong to positions; swap them so AVL retracing sees the old values.
    const h = t.height;
    t.height = s.height;
    s.height = h;
  }

  /** Puts `replacement` where `old` hangs in the tree (parent link or root). */
  protected replace(old: TreeNode, replacement: TreeNode | null): void {
    const parent = old.parent;
    if (!parent) this.root = replacement;
    else if (parent.left === old) parent.left = replacement;
    else parent.right = replacement;
    if (replacement) replacement.parent = parent;
  }
}
