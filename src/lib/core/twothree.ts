import { PACE, Recorder, type Cursor, type Marks, type OpResult } from './types';

/** A key cell is 22 px wide in the original, which fits three characters. */
export const TT_MIN_VALUE = -99;
export const TT_MAX_VALUE = 999;

/**
 * Immutable node as stored in a snapshot. Normally 1–2 keys (2-node / 3-node).
 * Intermediate snapshots may also contain a temporary 3-key overflow node (before a split)
 * or an empty "hole" node (after a removal, before it is fixed).
 */
export interface TTNode {
  id: number;
  keys: number[];
  children: number[];
  parent: number | null;
}

export interface TTState {
  root: number | null;
  nodes: Record<number, TTNode>;
}

class Node {
  keys: number[];
  children: Node[] = [];
  parent: Node | null = null;
  id: number;

  constructor(id: number, keys: number[]) {
    this.id = id;
    this.keys = keys;
  }

  get leaf(): boolean {
    return this.children.length === 0;
  }

  setChildren(children: Node[]): void {
    this.children = children;
    for (const c of children) c.parent = this;
  }
}

/** Index of the child to descend into for value v (left / middle / right). */
function childIndex(n: Node, v: number): number {
  let i = 0;
  while (i < n.keys.length && v > n.keys[i]) i++;
  return i;
}

const cursor = (value: number, at: number | null, extra: Partial<Cursor> = {}): Cursor => ({ label: String(value), at, ...extra });

/**
 * 2-3 tree recording every step. Behaviour follows the original thesis implementation
 * (2-3-tree repo, B23tree.java) where it works, and the corrected textbook algorithm from
 * the spec where the original is broken (inner-key removal, deep underflow):
 *  - insert: bottom-up; on a split the middle key moves up, the minimum stays in the original
 *    node (same id), the maximum goes to a new node; a split root keeps its id on top;
 *  - remove: inner keys are swapped with their in-order successor; an underflow first borrows
 *    from a 3-node sibling (right before left), otherwise merges (right before left);
 *    the root shrinks when it becomes empty.
 */
export class TwoThreeTree {
  private root: Node | null = null;
  private nextId = 0;

  get size(): number {
    return this.values().length;
  }

  values(): number[] {
    const out: number[] = [];
    const walk = (n: Node | null): void => {
      if (!n) return;
      if (n.leaf) {
        out.push(...n.keys);
        return;
      }
      n.children.forEach((c, i) => {
        walk(c);
        if (i < n.keys.length) out.push(n.keys[i]);
      });
    };
    walk(this.root);
    return out;
  }

  /** Bracket notation used in the spec, e.g. `[20]{[10],[30]}`. */
  toString(): string {
    const fmt = (n: Node): string =>
      `[${n.keys.join(',')}]` + (n.leaf ? '' : `{${n.children.map(fmt).join(',')}}`);
    return this.root ? fmt(this.root) : '';
  }

  snapshot(): TTState {
    const nodes: Record<number, TTNode> = {};
    const walk = (n: Node): void => {
      nodes[n.id] = {
        id: n.id,
        keys: n.keys.slice(),
        children: n.children.map((c) => c.id),
        parent: n.parent ? n.parent.id : null,
      };
      n.children.forEach(walk);
    };
    if (this.root) walk(this.root);
    return { root: this.root ? this.root.id : null, nodes };
  }

  private recorder(): Recorder<TTState> {
    return new Recorder(() => this.snapshot());
  }

  private newNode(keys: number[]): Node {
    return new Node(this.nextId++, keys);
  }

  private findNode(v: number): Node | null {
    let n = this.root;
    while (n) {
      if (n.keys.indexOf(v) >= 0) return n;
      if (n.leaf) return null;
      n = n.children[childIndex(n, v)];
    }
    return null;
  }

  clear(): OpResult<TTState> {
    this.root = null;
    this.nextId = 0;
    const r = this.recorder();
    r.add('tree.cleared');
    return r.done(true);
  }

  /** Preset build ("Vzory"): reset, then insert every value with full animation played at 10x. */
  build(values: number[]): OpResult<TTState> {
    this.root = null;
    this.nextId = 0;
    const r = this.recorder();
    r.add('build.start', { n: values.length });
    r.pace = 0.1;
    for (const v of values) {
      if (this.findNode(v)) r.add('build.duplicate', { value: v });
      else this.doInsert(v, r);
    }
    r.pace = 1;
    r.add('build.done', { n: this.size });
    return r.done(true);
  }

  insert(v: number): OpResult<TTState> {
    const r = this.recorder();
    if (this.findNode(v)) return r.fail('errTitle.insert', 'err.duplicate');
    this.doInsert(v, r);
    return r.done(true);
  }

  search(v: number): OpResult<TTState> {
    const r = this.recorder();
    if (!this.root) return r.fail('errTitle.search', 'err.empty');
    const { node, path } = this.descend(v, r, 'tt.search.start', true);
    const at = node.keys.indexOf(v);
    if (at >= 0) {
      r.add('tt.found', { value: v }, { ...path, [node.id]: 'found' }, cursor(v, node.id, { slot: at, result: 'found' }), { pace: PACE.fade });
      return r.done(true);
    }
    r.add('tt.notFound', { value: v }, { ...path, [node.id]: 'notfound' }, cursor(v, node.id, { result: 'notfound' }), { pace: PACE.fade });
    return r.done(false);
  }

  remove(v: number): OpResult<TTState> {
    const r = this.recorder();
    if (!this.root) return r.fail('errTitle.remove', 'err.empty');
    if (!this.findNode(v)) return r.fail('errTitle.remove', 'err.notInTree');
    const found = this.descend(v, r, 'tt.remove.start', true);
    let n = found.node;
    r.add('tt.found', { value: v }, { ...found.path, [n.id]: 'found' }, cursor(v, n.id, { slot: n.keys.indexOf(v), result: 'found' }), { pace: PACE.fade });

    if (!n.leaf) {
      const i = n.keys.indexOf(v);
      let c = n.children[i + 1];
      while (!c.leaf) c = c.children[0];
      const succ = c.keys[0];
      n.keys[i] = succ;
      c.keys[0] = v;
      r.add('tt.swap', { value: v, succ }, { [n.id]: 'moved', [c.id]: 'remove' });
      n = c;
    }

    if (n.keys.length === 2) {
      n.keys.splice(n.keys.indexOf(v), 1);
      r.add('tt.removeFromLeaf', { value: v }, { [n.id]: 'current' }, undefined, { pace: PACE.fade });
      return r.done(true);
    }
    if (n === this.root) {
      this.root = null;
      r.add('tt.removeFromLeaf', { value: v }, {}, undefined, { pace: PACE.fade });
      return r.done(true);
    }
    n.keys = [];
    r.add('tt.hole', { value: v }, { [n.id]: 'remove' }, undefined, { pace: PACE.fade });
    this.fixHole(n, null, r);
    r.add('tt.removed', { value: v });
    return r.done(true);
  }

  // ---- helpers ---------------------------------------------------------------

  /** Walks from the root towards v (one step per node); returns the node holding v or the last leaf. */
  private descend(v: number, r: Recorder<TTState>, startKey: string, stopAtKey: boolean): { node: Node; path: Marks } {
    let n = this.root!;
    const path: Marks = {};
    r.add(startKey, { value: v }, { [n.id]: 'current' }, cursor(v, n.id));
    for (;;) {
      if (stopAtKey && n.keys.indexOf(v) >= 0) return { node: n, path };
      if (n.leaf) return { node: n, path };
      const i = childIndex(n, v);
      const next = n.children[i];
      path[n.id] = 'path';
      const key = n.keys.length === 1 ? (i === 0 ? 'tt.go.left' : 'tt.go.right') : ['tt.go.left', 'tt.go.middle', 'tt.go.right'][i];
      r.add(key, { value: v, k1: n.keys[0], k2: n.keys[n.keys.length - 1] }, { ...path, [next.id]: 'current' }, cursor(v, next.id));
      n = next;
    }
  }

  private doInsert(v: number, r: Recorder<TTState>): void {
    if (!this.root) {
      this.root = this.newNode([v]);
      r.add('tt.insert.root', { value: v }, { [this.root.id]: 'new' });
      return;
    }
    const { node: leaf, path } = this.descend(v, r, 'tt.insert.start', false);
    const keys = leaf.keys.concat(v).sort((a, b) => a - b);
    leaf.keys = keys;
    if (keys.length === 2) {
      r.add('tt.insertLeaf', { value: v }, { ...path, [leaf.id]: 'new' }, undefined, { pace: PACE.fade + PACE.shift });
      return;
    }
    // Overflow: the leaf temporarily holds three keys, then splits upwards as long as needed.
    r.add('tt.overflow', { value: v }, { ...path, [leaf.id]: 'imbalanced' }, undefined, { pace: PACE.fade + PACE.shift });
    let n = leaf;
    for (;;) {
      const [min, mid, max] = n.keys;
      const kids = n.children;
      const right = this.newNode([max]);
      if (!n.leaf) right.setChildren(kids.slice(2));
      const p = n.parent;
      if (!p) {
        // Root split: the old root keeps its id on top (original behaviour).
        const left = this.newNode([min]);
        if (!n.leaf) left.setChildren(kids.slice(0, 2));
        n.keys = [mid];
        n.setChildren([left, right]);
        r.add('tt.split', { up: mid, new: max }, { [n.id]: 'new', [left.id]: 'moved', [right.id]: 'new' });
        r.add('tt.rootSplit', { up: mid }, { [n.id]: 'new' }, undefined, { pace: PACE.fade });
        return;
      }
      // The node keeps its id as the left half (min); the right half (max) is new.
      n.keys = [min];
      if (!n.leaf) n.setChildren(kids.slice(0, 2));
      const at = p.children.indexOf(n);
      p.keys.splice(at, 0, mid);
      p.children.splice(at + 1, 0, right);
      right.parent = p;
      r.add('tt.split', { up: mid, new: max }, { [p.id]: p.keys.length > 2 ? 'imbalanced' : 'new', [n.id]: 'moved', [right.id]: 'new' });
      if (p.keys.length <= 2) return;
      n = p;
    }
  }

  /** h has lost its only key; `orphan` is its single remaining child (null at leaf level). */
  private fixHole(h: Node, orphan: Node | null, r: Recorder<TTState>): void {
    const p = h.parent;
    if (!p) {
      this.root = orphan;
      if (orphan) orphan.parent = null;
      r.add('tt.shrink', {}, orphan ? { [orphan.id]: 'moved' } : {});
      return;
    }
    const i = p.children.indexOf(h);
    const right = i + 1 < p.children.length ? p.children[i + 1] : null;
    const left = i > 0 ? p.children[i - 1] : null;
    const rich = right && right.keys.length === 2 ? right : left && left.keys.length === 2 ? left : null;

    if (rich) {
      // Borrow ("rotation"): the separating key comes down, the sibling's adjacent key goes up.
      if (rich === right) {
        const sep = p.keys[i];
        const up = rich.keys.shift()!;
        h.keys = [sep];
        p.keys[i] = up;
        if (orphan) h.setChildren([orphan, rich.children.shift()!]);
        r.add('tt.borrow', { sep, up, sib: rich.keys.concat(up).sort((a, b) => a - b).join(', ') }, { [h.id]: 'new', [rich.id]: 'moved', [p.id]: 'current' });
      } else {
        const sep = p.keys[i - 1];
        const up = rich.keys.pop()!;
        h.keys = [sep];
        p.keys[i - 1] = up;
        if (orphan) h.setChildren([rich.children.pop()!, orphan]);
        r.add('tt.borrow', { sep, up, sib: rich.keys.concat(up).sort((a, b) => a - b).join(', ') }, { [h.id]: 'new', [rich.id]: 'moved', [p.id]: 'current' });
      }
      return;
    }

    // Merge with the right sibling (preferred) or the left one; the merged node keeps the sibling's id.
    const s = (right ?? left)!;
    let sep: number;
    if (s === right) {
      sep = p.keys[i];
      s.keys = [sep].concat(s.keys);
      if (orphan) s.setChildren([orphan].concat(s.children));
      p.keys.splice(i, 1);
    } else {
      sep = p.keys[i - 1];
      s.keys = s.keys.concat(sep);
      if (orphan) s.setChildren(s.children.concat(orphan));
      p.keys.splice(i - 1, 1);
    }
    p.children.splice(p.children.indexOf(h), 1);
    h.parent = null;
    r.add('tt.merge', { sep, merged: s.keys.join(', ') }, { [s.id]: 'new', [p.id]: p.keys.length ? 'current' : 'remove' });
    if (p.keys.length > 0) return;
    // The parent lost its only key: it is now a hole whose single child is the merged node.
    this.fixHole(p, s, r);
  }
}
