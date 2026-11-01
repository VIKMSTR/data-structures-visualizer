import type { BTreeState } from './bst';
import type { QState } from './quadtree';

export interface Pos {
  x: number;
  y: number;
}
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TREE_GAP_X = 50;
export const TREE_GAP_Y = 76;

/**
 * Binary tree layout: x = in-order index, y = depth. Never overlaps, keeps
 * left/right children visibly on their side, and projects keys onto the x axis in sorted order.
 */
export function binaryLayout(s: BTreeState, gapX = TREE_GAP_X, gapY = TREE_GAP_Y): Map<number, Pos> {
  const out = new Map<number, Pos>();
  let i = 0;
  const walk = (id: number | null, depth: number): void => {
    if (id == null) return;
    const n = s.nodes[id];
    walk(n.left, depth + 1);
    out.set(id, { x: i++ * gapX, y: depth * gapY });
    walk(n.right, depth + 1);
  };
  walk(s.root, 0);
  // Center the root at x = 0 so the view stays steady as the tree grows sideways.
  const root = s.root != null ? out.get(s.root) : undefined;
  if (root) {
    const dx = root.x;
    out.forEach((p) => (p.x -= dx));
  }
  return out;
}

/** Quadtree diagram layout: leaves left-to-right (NW, NE, SW, SE), parents centered over children. */
export function quadTreeLayout(s: QState, gapX = 46, gapY = 70): Map<number, Pos> {
  const out = new Map<number, Pos>();
  let leaf = 0;
  const walk = (id: number, depth: number): number => {
    const n = s.nodes[id];
    let x: number;
    if (!n.children) {
      x = leaf++ * gapX;
    } else {
      const xs = n.children.map((c) => walk(c, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    out.set(id, { x, y: depth * gapY });
    return x;
  };
  walk(s.root, 0);
  return out;
}

export function boundsOf(points: Iterable<Pos>, pad: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (minX === Infinity) return { x: -pad, y: -pad, w: 2 * pad, h: 2 * pad };
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}
