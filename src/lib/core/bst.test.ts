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
    // Original: no animation, only the "Prvek nelze vložit" dialog.
    expect(dup.steps).toHaveLength(0);
    expect(dup.error).toEqual({ title: 'errTitle.insert', msg: { key: 'err.duplicate', params: undefined } });
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
    expect(new BinarySearchTree().search(1).error!.msg.key).toBe('err.empty');
  });

  it('removes a leaf, a node with only a left child and an inner node (successor swap)', () => {
    const t = build([50, 30, 70, 20, 40, 60, 80, 35]);
    expect(t.remove(20).ok).toBe(true); // leaf
    expect(t.remove(40).ok).toBe(true); // only a left child (35) -> it takes the place
    expect(t.remove(50).ok).toBe(true); // root -> successor 60
    expect(t.root!.value).toBe(60);
    expect(t.values()).toEqual([30, 35, 60, 70, 80]);
    const missing = t.remove(99);
    expect(missing.ok).toBe(false);
    expect(missing.error!.msg.key).toBe('err.notInTree');
    expect(missing.steps).toHaveLength(0);
    checkTree(t, false);
  });

  it('removes the root down to an empty tree', () => {
    const t = build([2, 1, 3]);
    for (const v of [2, 1, 3]) expect(t.remove(v).ok).toBe(true);
    expect(t.root).toBeNull();
    expect(t.remove(1).error!.msg.key).toBe('err.empty');
  });

  it('swaps the removed node with its successor so both visibly trade places', () => {
    const t = build([50, 30, 70, 60, 80, 65]);
    const id50 = t.find(50)!.id;
    const id60 = t.find(60)!.id;
    const r = t.remove(50);
    const swap = r.steps.find((s) => s.msg.key === 'remove.swapped')!;
    // In the swap snapshot, 60 sits at the root and 50 hangs where 60 was (left child of 70).
    expect(swap.state.root).toBe(id60);
    expect(swap.state.nodes[id50].parent).toBe(t.find(70)!.id);
    expect(swap.state.nodes[id50].right).toBe(t.find(65)!.id);
    // Then 50 is cut off and its right child 65 moves up.
    expect(t.root!.id).toBe(id60);
    expect(t.find(70)!.left!.value).toBe(65);
    checkTree(t, false);
  });

  // Ported from the original JUnit RemoveTest (bvs repo, deleted in 52d564c), adapted from the
  // predecessor rule used there to the successor rule described in the thesis.
  describe('original RemoveTest fixture 5,2,8,4,9,1,7,0', () => {
    const fixture = () => build([5, 2, 8, 4, 9, 1, 7, 0]);
    it('buildTest', () => expect(fixture().root!.value).toBe(5));
    it('removeLeafTest', () => {
      const t = fixture();
      expect(t.root!.right!.right!.value).toBe(9);
      t.remove(9);
      expect(t.root!.right!.right).toBeNull();
    });
    it('removeInnerNode8Test (successor 9 replaces 8)', () => {
      const t = fixture();
      t.remove(8);
      expect(t.root!.right!.value).toBe(9);
      expect(t.root!.right!.left!.value).toBe(7);
      expect(t.root!.right!.right).toBeNull();
    });
    it('removeInnerNode1Test (single left child 0 lifts up)', () => {
      const t = fixture();
      t.remove(1);
      expect(t.root!.left!.value).toBe(2);
      expect(t.root!.left!.left!.value).toBe(0);
      expect(t.root!.left!.left!.left).toBeNull();
      expect(t.root!.left!.left!.right).toBeNull();
    });
    it('removeRootTest (successor 7 becomes root)', () => {
      const t = fixture();
      t.remove(5);
      expect(t.root!.value).toBe(7);
      expect(t.root!.left!.value).toBe(2);
      expect(t.root!.right!.value).toBe(8);
      expect(t.root!.right!.left).toBeNull();
    });
    it('SwapEventTest: removing 8, 2, 5, 1, 9 from fixture + 10 keeps a valid tree', () => {
      for (const v of [8, 2, 5, 1, 9]) {
        const t = build([5, 2, 8, 4, 9, 1, 7, 0, 10]);
        expect(t.remove(v).ok).toBe(true);
        checkTree(t, false);
      }
    });
    it('cases that crash the original: only a right child, root whose left has no right child', () => {
      const deg = build([10, 20, 30, 40, 50]); // "Degradovaný strom" preset
      for (const v of [20, 10, 40]) {
        expect(deg.remove(v).ok).toBe(true);
        checkTree(deg, false);
      }
      expect(deg.values()).toEqual([30, 50]);
      const t = build([5, 2, 8]);
      t.remove(5);
      expect(t.find(5)).toBeNull();
      checkTree(t, false);
    });
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
