import { describe, expect, it } from 'vitest';
import { AVLTree } from './avl';
import { seeded, randomInt } from './random';
import { checkTree } from './testing';

const keys = (r: { steps: { msg: { key: string } }[] }) => r.steps.map((s) => s.msg.key);

describe('AVLTree', () => {
  it.each([
    ['LL', [30, 20, 10], 'avl.rotateRight'],
    ['RR', [10, 20, 30], 'avl.rotateLeft'],
    ['LR', [30, 10, 20], 'avl.doubleLR'],
    ['RL', [10, 30, 20], 'avl.doubleRL'],
  ])('fixes the %s case', (kase, values, rotation) => {
    const t = new AVLTree();
    t.insert(values[0]);
    t.insert(values[1]);
    const r = t.insert(values[2]);
    const imb = r.steps.find((s) => s.msg.key === 'avl.imbalance')!;
    expect(imb.msg.params!.case).toBe(kase);
    expect(keys(r)).toContain(rotation);
    expect(t.root!.value).toBe(20);
    checkTree(t, true);
  });

  it('snapshots carry balance factors', () => {
    const t = new AVLTree();
    t.build([20, 10, 30, 40]);
    const s = t.snapshot();
    const byValue = Object.fromEntries(Object.values(s.nodes).map((n) => [n.value, n.bal]));
    expect(byValue).toEqual({ 10: 0, 20: 1, 30: 1, 40: 0 });
  });

  it('stops retracing when a height does not change', () => {
    const t = new AVLTree();
    t.build([20, 10, 30]);
    const r = t.insert(5);
    expect(keys(r)).not.toContain('avl.imbalance');
    expect(keys(r)).toContain('avl.root');
    const r2 = t.insert(15); // 10 becomes balanced, height unchanged -> stop
    expect(keys(r2)).toContain('avl.stop');
  });

  it('rebalances after removals, including the root', () => {
    const t = new AVLTree();
    t.build([50, 30, 70, 20, 40, 60, 80, 10]);
    t.remove(60);
    t.remove(70);
    checkTree(t, true);
    t.remove(t.root!.value);
    checkTree(t, true);
  });

  it('stays an AVL tree under random operations', () => {
    const rng = seeded(7);
    for (let round = 0; round < 40; round++) {
      const t = new AVLTree();
      const ref = new Set<number>();
      for (let i = 0; i < 120; i++) {
        const v = randomInt(0, 80, rng);
        if (rng() < 0.6) {
          expect(t.insert(v).ok).toBe(!ref.has(v));
          ref.add(v);
        } else {
          expect(t.remove(v).ok).toBe(ref.has(v));
          ref.delete(v);
        }
        const h = checkTree(t, true);
        // AVL height bound: h < 1.44 log2(n + 2)
        if (ref.size > 0) expect(h).toBeLessThan(1.45 * Math.log2(ref.size + 2));
      }
      expect(t.values()).toEqual([...ref].sort((a, b) => a - b));
    }
  });
});
