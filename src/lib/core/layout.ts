import type { BTreeState } from './bst';
import type { QState } from './quadtree';
import type { TTState } from './twothree';

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

/** Original BVS/AVL layout (MT-common LayoutNodesPositionInsertedNodes): 30x15 nodes,
 *  one 50 px column per node in in-order order, rows 35 px apart, root fixed in the middle. */
export const TREE_GAP_X = 50;
export const TREE_GAP_Y = 35;

/**
 * Binary tree layout: x = in-order index, y = depth. Never overlaps, keeps
 * left/right children visibly on their side, and projects keys onto the x axis in sorted order.
 * Returns node centres.
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

/** Quadtree diagram layout: leaves left-to-right (NW, NE, SW, SE), parents centred over children.
 *  Original boxes are 48x50 with 20 px gaps and 30 px between rows. */
export function quadTreeLayout(s: QState, gapX = 68, gapY = 80): Map<number, Pos> {
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

/** 2-3 tree node geometry (original TwoThreeElement): 22 px key cells, 22 px high. */
export const TT_CELL = 22;
export const ttNodeWidth = (keys: number): number => TT_CELL * Math.max(2, keys);

/** 2-3 tree layout: leaves left-to-right, parents centred over their children; rows 55 px apart. */
export function twoThreeLayout(s: TTState, gap = 26, gapY = 55): Map<number, Pos> {
  const out = new Map<number, Pos>();
  let cursor = 0;
  const walk = (id: number, depth: number): number => {
    const n = s.nodes[id];
    let x: number;
    if (n.children.length === 0) {
      const w = ttNodeWidth(n.keys.length);
      x = cursor + w / 2;
      cursor += w + gap;
    } else {
      const xs = n.children.map((c) => walk(c, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    out.set(id, { x, y: depth * gapY });
    return x;
  };
  if (s.root != null) walk(s.root, 0);
  const root = s.root != null ? out.get(s.root) : undefined;
  if (root) {
    const dx = root.x;
    out.forEach((p) => (p.x -= dx));
  }
  return out;
}
