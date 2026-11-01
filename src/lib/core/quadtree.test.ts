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
      // Half-open cells, except that cells on the outer edge also include the bound 100.
      const inX = x >= n.x && (x < n.x + n.size || (x === 100 && n.x + n.size === 100));
      const inY = y >= n.y && (y < n.y + n.size || (y === 100 && n.y + n.size === 100));
      expect(inX && inY).toBe(true);
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

  it('rejects duplicates and out-of-range points with the original dialogs (no animation)', () => {
    const q = new QuadTree();
    q.insert(5, 5);
    const dup = q.insert(5, 5);
    expect(dup.error!.msg.key).toBe('err.duplicate');
    expect(dup.steps).toHaveLength(0);
    expect(q.insert(100.5, 5).error!.msg.key).toBe('err.range');
    expect(q.insert(-1, 5).error!.msg.key).toBe('err.range');
    expect(q.remove(1, 1).error!.msg.key).toBe('err.notInTree');
  });

  it('accepts the inclusive bounds 0..100 and decimals', () => {
    const q = new QuadTree();
    for (const [x, y] of [[0, 0], [100, 100], [0, 100], [12.5, 37.25]]) expect(q.insert(x, y).ok).toBe(true);
    expect(q.search(12.5, 37.25).ok).toBe(true);
    checkQuad(q.snapshot());
  });

  it('boundary rule: a point on a split line goes East / North', () => {
    const q = new QuadTree();
    q.insert(10, 10);
    const r = q.insert(50, 50);
    const desc = r.steps.filter((s) => s.msg.key === 'quad.descend').map((s) => s.msg.params!.q);
    expect(desc[desc.length - 1]).toBe('@q.NE');
  });

  it('refuses points too close to separate', () => {
    const q = new QuadTree();
    q.insert(10, 10);
    expect(q.insert(10, 10.0000001).error!.msg.key).toBe('err.tooClose');
    expect(q.insert(10, 10.01).ok).toBe(true);
    checkQuad(q.snapshot());
  });

  it('formats coordinates like the original (Java doubles)', () => {
    const q = new QuadTree();
    const r = q.insert(60, 40);
    expect(r.steps[0].cursor!.label).toBe('[60.0,40.0]');
    expect(r.steps[0].msg.params).toMatchObject({ x: '60.0', y: '40.0' });
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
