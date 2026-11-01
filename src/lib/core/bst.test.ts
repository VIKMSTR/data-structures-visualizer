import { describe, expect, it } from 'vitest';
import { BinarySearchTree } from './bst';
import { seeded, randomDistinct, randomInt } from './random';
import { checkTree } from './testing';

const build = (values: number[]) => {
  const t = new BinarySearchTree();
  t.build(values);
  return t;
};

describe('BinarySearchTree', () => {
  it('inserts in order and rejects duplicates', () => {
    const t = new BinarySearchTree();
    expect(t.insert(50).ok).toBe(true);
    expect(t.insert(30).ok).toBe(true);
    expect(t.insert(70).ok).toBe(true);
    const dup = t.insert(30);
    expect(dup.ok).toBe(false);
    expect(dup.steps[dup.steps.length - 1].msg.key).toBe('insert.duplicate');
    expect(t.values()).toEqual([30, 50, 70]);
    checkTree(t, false);
  });

  it('records the comparison path', () => {
    const t = build([50, 30, 70, 40]);
    const keys = t.insert(45).steps.map((s) => s.msg.key);
    expect(keys).toEqual(['insert.start', 'cmp.left', 'cmp.right', 'insert.asRight']);
  });

  it('searches', () => {
    const t = build([50, 30, 70, 20, 40]);
    expect(t.search(40).ok).toBe(true);
    const miss = t.search(45);
    expect(miss.ok).toBe(false);
    expect(miss.steps[miss.steps.length - 1].msg).toEqual({ key: 'search.notFoundRight', params: { value: 45, node: 40 } });
    expect(new BinarySearchTree().search(1).ok).toBe(false);
  });

  it('removes a leaf, a node with one child and a node with two children', () => {
    const t = build([50, 30, 70, 20, 40, 60, 80, 35]);
    expect(t.remove(20).ok).toBe(true); // leaf
    expect(t.remove(40).ok).toBe(true); // one child (35)
    expect(t.remove(50).ok).toBe(true); // root with two children -> predecessor 35
    expect(t.root!.value).toBe(35);
    expect(t.values()).toEqual([30, 35, 60, 70, 80]);
    expect(t.remove(99).ok).toBe(false);
    checkTree(t, false);
  });

  it('removes the root down to an empty tree', () => {
    const t = build([2, 1, 3]);
    for (const v of [2, 1, 3]) expect(t.remove(v).ok).toBe(true);
    expect(t.root).toBeNull();
    expect(t.remove(1).ok).toBe(false);
  });

  it('keeps node identity when the predecessor moves up (for animation)', () => {
    const t = build([50, 30, 70, 40]);
    const id40 = t.find(40)!.id;
    t.remove(50);
    expect(t.root!.id).toBe(id40);
  });

  it('every step snapshot is self-consistent', () => {
    const t = build([50, 30, 70]);
    for (const s of t.remove(50).steps) {
      for (const n of Object.values(s.state.nodes)) {
        if (n.left != null) expect(s.state.nodes[n.left].parent).toBe(n.id);
        if (n.right != null) expect(s.state.nodes[n.right].parent).toBe(n.id);
      }
    }
  });

  it('survives random insert/remove sequences', () => {
    const rng = seeded(42);
    for (let round = 0; round < 50; round++) {
      const t = build(randomDistinct(20, 0, 60, rng));
      const ref = new Set(t.values());
      for (let i = 0; i < 40; i++) {
        const v = randomInt(0, 60, rng);
        if (rng() < 0.5) {
          expect(t.insert(v).ok).toBe(!ref.has(v));
          ref.add(v);
        } else {
          expect(t.remove(v).ok).toBe(ref.has(v));
          ref.delete(v);
        }
        checkTree(t, false);
      }
      expect(t.values()).toEqual([...ref].sort((a, b) => a - b));
    }
  });
});
