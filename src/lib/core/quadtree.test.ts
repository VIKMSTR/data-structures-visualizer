import { describe, expect, it } from 'vitest';
import { QuadTree, type QState } from './quadtree';
import { seeded, randomPoints, randomInt } from './random';

/** Every point lies inside its leaf, no internal node holds a point, and no mergeable node exists. */
function checkQuad(s: QState) {
  for (const n of Object.values(s.nodes)) {
    if (n.children) {
      expect(n.point).toBeNull();
      expect(n.children).toHaveLength(4);
      const kids = n.children.map((c) => s.nodes[c]);
      if (kids.every((k) => !k.children)) {
        expect(kids.filter((k) => k.point).length).toBeGreaterThan(1);
      }
    } else if (n.point) {
      const { x, y } = n.point;
      expect(x >= n.x && x < n.x + n.size && y >= n.y && y < n.y + n.size).toBe(true);
    }
  }
}

describe('QuadTree', () => {
  it('stores the first point in the root leaf', () => {
    const q = new QuadTree();
    const r = q.insert(10, 10);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.msg.key)).toEqual(['quad.insert.start', 'quad.insert.empty']);
  });

  it('splits an occupied leaf, repeatedly if needed', () => {
    const q = new QuadTree();
    q.insert(10, 10);
    const r = q.insert(11, 11); // same quadrant for several levels
    const splits = r.steps.filter((s) => s.msg.key === 'quad.split').length;
    expect(splits).toBeGreaterThan(3);
    checkQuad(q.snapshot());
    expect(q.size).toBe(2);
  });

  it('uses the NW/NE/SW/SE quadrants with y growing upwards', () => {
    const q = new QuadTree();
    q.insert(10, 90);
    const r = q.insert(90, 90);
    const split = r.steps.find((s) => s.msg.key === 'quad.split')!;
    expect(split.msg.params!.q).toBe('@q.NW');
    const last = r.steps[r.steps.length - 2];
    expect(last.msg.params!.q).toBe('@q.NE');
  });

  it('rejects duplicates and out-of-range points', () => {
    const q = new QuadTree();
    q.insert(5, 5);
    expect(q.insert(5, 5).ok).toBe(false);
    expect(q.insert(100, 5).ok).toBe(false);
    expect(q.insert(-1, 5).ok).toBe(false);
  });

  it('searches', () => {
    const q = new QuadTree();
    q.build([[10, 10], [80, 80], [30, 70]]);
    expect(q.search(80, 80).ok).toBe(true);
    expect(q.search(81, 80).ok).toBe(false);
  });

  it('merges quadrants after removal', () => {
    const q = new QuadTree();
    q.build([[10, 10], [11, 11]]);
    const r = q.remove(11, 11);
    expect(r.ok).toBe(true);
    const s = q.snapshot();
    expect(Object.keys(s.nodes)).toHaveLength(1);
    expect(s.nodes[s.root].point).toMatchObject({ x: 10, y: 10 });
  });

  it('stays consistent under random operations', () => {
    const rng = seeded(3);
    for (let round = 0; round < 30; round++) {
      const q = new QuadTree();
      const ref = new Set<string>();
      for (const [x, y] of randomPoints(15, 99, rng)) {
        q.insert(x, y);
        ref.add(`${x},${y}`);
      }
      for (let i = 0; i < 60; i++) {
        const x = randomInt(0, 20, rng);
        const y = randomInt(0, 20, rng);
        const k = `${x},${y}`;
        if (rng() < 0.5) {
          expect(q.insert(x, y).ok).toBe(!ref.has(k));
          ref.add(k);
        } else {
          expect(q.remove(x, y).ok).toBe(ref.has(k));
          ref.delete(k);
        }
        checkQuad(q.snapshot());
      }
      expect(q.size).toBe(ref.size);
    }
  });
});
