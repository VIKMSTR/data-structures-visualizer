import { describe, expect, it } from 'vitest';
import { seeded, randomInt } from './random';
import { TwoThreeTree, type TTState } from './twothree';

/** Valid 2-3 tree: 1-2 keys per node, sorted keys, keys+1 children, all leaves at one depth, parent links. */
function check(s: TTState): void {
  if (s.root == null) return;
  let leafDepth = -1;
  const walk = (id: number, parent: number | null, depth: number, lo: number, hi: number): void => {
    const n = s.nodes[id];
    expect(n.parent).toBe(parent);
    expect(n.keys.length === 1 || n.keys.length === 2).toBe(true);
    for (let i = 0; i < n.keys.length; i++) {
      expect(n.keys[i] > lo && n.keys[i] < hi).toBe(true);
      if (i > 0) expect(n.keys[i] > n.keys[i - 1]).toBe(true);
    }
    if (n.children.length === 0) {
      if (leafDepth < 0) leafDepth = depth;
      expect(depth).toBe(leafDepth);
      return;
    }
    expect(n.children.length).toBe(n.keys.length + 1);
    const bounds = [lo, ...n.keys, hi];
    n.children.forEach((c, i) => walk(c, id, depth + 1, bounds[i], bounds[i + 1]));
  };
  walk(s.root, null, 0, -Infinity, Infinity);
}

const tree = (values: number[]) => {
  const t = new TwoThreeTree();
  t.build(values);
  return t;
};
const keys = (r: { steps: { msg: { key: string } }[] }) => r.steps.map((s) => s.msg.key);

describe('TwoThreeTree – insert (traces from the original, spec §2.5)', () => {
  it('10, 20, 30 splits the root; the root keeps its id', () => {
    const t = new TwoThreeTree();
    t.insert(10);
    const rootId = t.snapshot().root;
    t.insert(20);
    const r = t.insert(30);
    expect(t.toString()).toBe('[20]{[10],[30]}');
    expect(t.snapshot().root).toBe(rootId);
    const split = r.steps.find((s) => s.msg.key === 'tt.split')!;
    expect(split.msg.params).toEqual({ up: 20, new: 30 });
    expect(keys(r)).toContain('tt.overflow');
  });

  it('cascading split 10..70', () => {
    const t = tree([10, 20, 30, 40, 50, 60, 70]);
    expect(t.toString()).toBe('[40]{[20]{[10],[30]},[60]{[50],[70]}}');
    check(t.snapshot());
  });

  it.each([
    ['Sada 1', [50, 100, 20, 80, 10, 40, 120], '[50]{[20]{[10],[40]},[100]{[80],[120]}}'],
    ['Sada 2', [50, 100, 80, 75, 120], '[80]{[50,75],[100,120]}'],
    ['Sada 3', [10, 20, 30, 40, 50], '[20,40]{[10],[30],[50]}'],
    ['Sada 4', [50, 100, 20, 90, 5, 120], '[50,100]{[5,20],[90],[120]}'],
  ])('preset %s gives the documented tree', (_name, values, expected) => {
    expect(tree(values).toString()).toBe(expected);
  });

  it('rejects duplicates with the original dialog', () => {
    const t = tree([1, 2]);
    expect(t.insert(2).error!.msg.key).toBe('err.duplicate');
  });
});

describe('TwoThreeTree – search', () => {
  it('finds a key and reports a miss with the original texts', () => {
    const t = tree([10, 20, 30, 40, 50, 60, 70]);
    const miss = t.search(55);
    expect(miss.steps[miss.steps.length - 1].msg).toEqual({ key: 'tt.notFound', params: { value: 55 } });
    const hit = t.search(60);
    const last = hit.steps[hit.steps.length - 1];
    expect(last.msg.key).toBe('tt.found');
    expect(last.cursor).toMatchObject({ slot: 0, result: 'found' });
  });
});

describe('TwoThreeTree – remove (spec §1.5.3 and traces)', () => {
  it('3-key leaf: just drops the key', () => {
    const t = tree([50, 100, 80, 75, 120]);
    const r = t.remove(75);
    expect(keys(r)).toContain('tt.removeFromLeaf');
    expect(t.toString()).toBe('[80]{[50],[100,120]}');
  });

  it('borrow from the right sibling', () => {
    const t = tree([50, 100, 20, 80, 10, 40, 120, 30]);
    expect(t.toString()).toBe('[50]{[20]{[10],[30,40]},[100]{[80],[120]}}');
    const r = t.remove(10);
    expect(keys(r)).toContain('tt.borrow');
    expect(t.toString()).toBe('[50]{[30]{[20],[40]},[100]{[80],[120]}}');
  });

  it('merge propagating to a root shrink', () => {
    const t = tree([50, 100, 20, 80, 10, 40, 120]);
    const r = t.remove(10);
    expect(keys(r)).toEqual(expect.arrayContaining(['tt.hole', 'tt.merge', 'tt.shrink']));
    expect(t.toString()).toBe('[50,100]{[20,40],[80],[120]}');
    check(t.snapshot());
  });

  it('deeper propagation that the original gets wrong', () => {
    const t = tree([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(t.toString()).toBe('[40]{[20]{[10],[30]},[60,80]{[50],[70],[90]}}');
    t.remove(10);
    expect(t.toString()).toBe('[60]{[40]{[20,30],[50]},[80]{[70],[90]}}');
    check(t.snapshot());
  });

  it('inner key: swap with the in-order successor', () => {
    const t = tree([25, 22, 40, 20, 24, 30, 60]);
    expect(t.toString()).toBe('[25]{[22]{[20],[24]},[40]{[30],[60]}}');
    const r = t.remove(22);
    expect(r.steps.find((s) => s.msg.key === 'tt.swap')!.msg.params).toEqual({ value: 22, succ: 24 });
    expect(t.toString()).toBe('[25,40]{[20,24],[30],[60]}');
    t.remove(40);
    expect(t.toString()).toBe('[25]{[20,24],[30,60]}');
    check(t.snapshot());
  });

  it('missing key and empty tree use the original error dialogs', () => {
    expect(new TwoThreeTree().remove(1).error!.msg.key).toBe('err.empty');
    expect(tree([1]).remove(2).error!.msg.key).toBe('err.notInTree');
  });

  it('removing the last key empties the tree', () => {
    const t = tree([5]);
    t.remove(5);
    expect(t.toString()).toBe('');
  });

  it('stays a valid 2-3 tree under random operations (every intermediate step renders)', () => {
    const rng = seeded(11);
    for (let round = 0; round < 60; round++) {
      const t = new TwoThreeTree();
      const ref = new Set<number>();
      for (let i = 0; i < 120; i++) {
        const v = randomInt(0, 60, rng);
        const r = rng() < 0.6 ? t.insert(v) : t.remove(v);
        if (r.error) continue;
        if (ref.has(v)) ref.delete(v);
        else ref.add(v);
        check(t.snapshot());
        // Intermediate snapshots must stay structurally linked (parents/children agree).
        for (const s of r.steps) {
          for (const n of Object.values(s.state.nodes)) for (const c of n.children) expect(s.state.nodes[c].parent).toBe(n.id);
        }
      }
      expect(t.values()).toEqual([...ref].sort((a, b) => a - b));
    }
  });
});
