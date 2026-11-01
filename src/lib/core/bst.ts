import { Recorder, type Cursor, type Marks, type OpResult } from './types';

export const MIN_VALUE = 0;
export const MAX_VALUE = 999;

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
  private nextId = 1;

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
    const r = this.recorder();
    r.add('tree.cleared');
    return r.done(true);
  }

  /** Builds a tree from scratch by inserting values one by one; one quick step per value. */
  build(values: number[]): OpResult<BTreeState> {
    this.root = null;
    const r = this.recorder();
    r.pace = 0.45;
    r.add('build.start', { n: values.length });
    for (const v of values) {
      const scratch = this.recorder();
      if (this.doInsert(v, scratch)) {
        const n = this.find(v)!;
        r.add('build.inserted', { value: v }, { [n.id]: 'new' });
      } else {
        r.add('build.duplicate', { value: v });
      }
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
    const ok = this.doInsert(value, r);
    return r.done(ok);
  }

  search(value: number): OpResult<BTreeState> {
    const r = this.recorder();
    if (!this.root) {
      r.add('search.empty', { value });
      return r.done(false);
    }
    const d = this.descend(value, r, 'search.start');
    if (d.node) {
      r.add('search.found', { value }, { ...d.path, [d.node.id]: 'found' }, cursor(value, d.node.id));
      return r.done(true);
    }
    this.notFound(value, d, r);
    return r.done(false);
  }

  remove(value: number): OpResult<BTreeState> {
    const r = this.recorder();
    if (!this.root) {
      r.add('remove.empty', { value });
      return r.done(false);
    }
    const d = this.descend(value, r, 'remove.start');
    const t = d.node;
    if (!t) {
      this.notFound(value, d, r);
      return r.done(false);
    }
    const marks: Marks = { ...d.path, [t.id]: 'remove' };
    let retraceFrom: TreeNode | null;

    if (!t.left && !t.right) {
      r.add('remove.leaf', { value }, marks);
      retraceFrom = t.parent;
      this.replace(t, null);
      r.add('remove.done', { value });
    } else if (!t.left || !t.right) {
      const child = (t.left ?? t.right)!;
      r.add('remove.oneChild', { value, child: child.value }, { ...marks, [child.id]: 'moved' });
      retraceFrom = t.parent;
      this.replace(t, child);
      r.add('remove.done', { value }, { [child.id]: 'moved' });
    } else {
      r.add('remove.twoChildren', { value }, marks);
      let p = t.left;
      const pm: Marks = { ...marks };
      r.add('pred.start', { node: p.value }, { ...pm, [p.id]: 'current' });
      while (p.right) {
        pm[p.id] = 'path';
        p = p.right;
        r.add('pred.right', { node: p.value }, { ...pm, [p.id]: 'current' });
      }
      r.add('pred.found', { pred: p.value, value }, { ...pm, [p.id]: 'moved' });

      if (p.parent === t) {
        // Predecessor is the direct left child: it keeps its left subtree.
        retraceFrom = p;
      } else {
        retraceFrom = p.parent;
        this.replace(p, p.left);
        p.left = t.left;
        p.left.parent = p;
      }
      p.right = t.right;
      p.right.parent = p;
      // p now occupies t's position; inherit its height so retracing compares correctly.
      p.height = t.height;
      this.replace(t, p);
      r.add('remove.replaced', { value, pred: p.value }, { [p.id]: 'moved' });
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
    r.add(
      d.goLeft ? 'insert.asLeft' : 'insert.asRight',
      { value, node: d.last.value },
      { ...d.path, [d.last.id]: 'path', [n.id]: 'new' },
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

  private notFound(value: number, d: DescendResult, r: Recorder<BTreeState>): void {
    r.add(
      d.goLeft ? 'search.notFoundLeft' : 'search.notFoundRight',
      { value, node: d.last.value },
      { ...d.path, [d.last.id]: 'notfound' },
      cursor(value, d.last.id),
    );
  }

  private newNode(value: number): TreeNode {
    return new TreeNode(this.nextId++, value);
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
