import { Recorder, type Cursor, type Marks, type OpResult } from './types';

/** The plane is [0, PLANE] x [0, PLANE] (inclusive, as in the original); coordinates may be decimals. */
export const PLANE = 100;
/** The original has no limit; points closer than ~0.0001 would split forever. */
export const MAX_DEPTH = 20;

/** Java-style double formatting used by the original labels: 60 -> "60.0", 12.5 -> "12.5". */
export const fmtCoord = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v * 1e6) / 1e6));
export const fmtPoint = (x: number, y: number): string => `[${fmtCoord(x)},${fmtCoord(y)}]`;
export const QUADRANTS = ['NW', 'NE', 'SW', 'SE'] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export interface QPoint {
  id: number;
  x: number;
  y: number;
}

/** Immutable node as stored in a snapshot. (x, y) is the lower-left corner; y grows upwards. */
export interface QNode {
  id: number;
  x: number;
  y: number;
  size: number;
  depth: number;
  parent: number | null;
  /** Child ids in order NW, NE, SW, SE, or null for a leaf. */
  children: number[] | null;
  point: QPoint | null;
}

export interface QState {
  root: number;
  nodes: Record<number, QNode>;
}

class Cell {
  children: Cell[] | null = null;
  point: QPoint | null = null;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly depth: number;
  readonly parent: Cell | null;

  constructor(id: number, x: number, y: number, size: number, depth: number, parent: Cell | null) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.size = size;
    this.depth = depth;
    this.parent = parent;
  }

  quadrantOf(px: number, py: number): number {
    const half = this.size / 2;
    const east = px >= this.x + half;
    const north = py >= this.y + half;
    return north ? (east ? 1 : 0) : east ? 3 : 2;
  }
}

const cursor = (x: number, y: number, at: number): Cursor => ({ label: fmtPoint(x, y), at, x, y });
const quadrantParam = (q: number): string => `@q.${QUADRANTS[q]}`;

export const isValidCoord = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= PLANE;

/**
 * Point-region quadtree with one point per leaf. Unlike the original thesis code
 * it also merges quadrants back together after a removal, so the structure stays minimal.
 */
export class QuadTree {
  private nextId = 1;
  private root: Cell = this.newCell(0, 0, PLANE, 0, null);

  get size(): number {
    return this.points().length;
  }

  points(): QPoint[] {
    const out: QPoint[] = [];
    const stack: Cell[] = [this.root];
    while (stack.length) {
      const c = stack.pop()!;
      if (c.point) out.push(c.point);
      if (c.children) stack.push(...c.children);
    }
    return out;
  }

  snapshot(): QState {
    const nodes: Record<number, QNode> = {};
    const stack: Cell[] = [this.root];
    while (stack.length) {
      const c = stack.pop()!;
      nodes[c.id] = {
        id: c.id,
        x: c.x,
        y: c.y,
        size: c.size,
        depth: c.depth,
        parent: c.parent ? c.parent.id : null,
        children: c.children ? c.children.map((k) => k.id) : null,
        point: c.point ? { ...c.point } : null,
      };
      if (c.children) stack.push(...c.children);
    }
    return { root: this.root.id, nodes };
  }

  private recorder(): Recorder<QState> {
    return new Recorder(() => this.snapshot());
  }

  clear(): OpResult<QState> {
    this.nextId = 1;
    this.root = this.newCell(0, 0, PLANE, 0, null);
    const r = this.recorder();
    r.add('quad.cleared');
    return r.done(true);
  }

  /** Preset build ("Vzory"): reset, then insert every point with its full animation. */
  build(points: Array<[number, number]>): OpResult<QState> {
    this.nextId = 1;
    this.root = this.newCell(0, 0, PLANE, 0, null);
    const r = this.recorder();
    r.add('quad.build.start', { n: points.length });
    for (const [x, y] of points) {
      if (this.has(x, y)) r.add('quad.build.duplicate', { x: fmtCoord(x), y: fmtCoord(y) });
      else this.doInsert(x, y, r);
    }
    r.add('quad.build.done', { n: this.size });
    return r.done(true);
  }

  insert(x: number, y: number): OpResult<QState> {
    const r = this.recorder();
    if (!isValidCoord(x) || !isValidCoord(y)) return r.fail('errTitle.insert', 'err.range');
    if (this.has(x, y)) return r.fail('errTitle.insert', 'err.duplicate');
    if (this.depthNeeded(x, y) > MAX_DEPTH) return r.fail('errTitle.insert', 'err.tooClose');
    return r.done(this.doInsert(x, y, r));
  }

  has(x: number, y: number): boolean {
    const p = this.leafFor(x, y).point;
    return !!p && p.x === x && p.y === y;
  }

  /** Depth at which (x, y) would separate from the point currently in its leaf. */
  private depthNeeded(x: number, y: number): number {
    let c = this.leafFor(x, y);
    const p = c.point;
    if (!p) return c.depth;
    let { depth } = c;
    let cx = c.x;
    let cy = c.y;
    let size = c.size;
    for (;;) {
      const h = size / 2;
      const qa = (p.y >= cy + h ? 0 : 2) + (p.x >= cx + h ? 1 : 0);
      const qb = (y >= cy + h ? 0 : 2) + (x >= cx + h ? 1 : 0);
      depth++;
      if (qa !== qb || depth > MAX_DEPTH) return depth;
      if (qb & 1) cx += h;
      if (!(qb & 2)) cy += h;
      size = h;
    }
  }

  search(x: number, y: number): OpResult<QState> {
    const r = this.recorder();
    if (!isValidCoord(x) || !isValidCoord(y)) return r.fail('errTitle.search', 'err.range');
    const { leaf, path } = this.descend(x, y, r, 'quad.search.start');
    const p = leaf.point;
    if (p && p.x === x && p.y === y) {
      r.add('quad.found', { x: fmtCoord(x), y: fmtCoord(y) }, { ...path, [leaf.id]: 'found', [p.id]: 'found' }, { ...cursor(x, y, leaf.id), result: 'found' });
      return r.done(true);
    }
    this.notFound(x, y, leaf, path, r);
    return r.done(false);
  }

  remove(x: number, y: number): OpResult<QState> {
    const r = this.recorder();
    if (!isValidCoord(x) || !isValidCoord(y)) return r.fail('errTitle.remove', 'err.range');
    if (!this.has(x, y)) return r.fail('errTitle.remove', 'err.notInTree');
    const { leaf, path } = this.descend(x, y, r, 'quad.remove.start');
    const p = leaf.point!;
    r.add('quad.remove.found', { x: fmtCoord(x), y: fmtCoord(y) }, { ...path, [leaf.id]: 'remove', [p.id]: 'remove' });
    leaf.point = null;
    r.add('quad.removed', { x: fmtCoord(x), y: fmtCoord(y) }, { [leaf.id]: 'current' });

    // Collapse parents whose four quadrants together hold at most one point.
    for (let c = leaf.parent; c; c = c.parent) {
      const kids = c.children!;
      if (kids.some((k) => k.children)) break;
      const pts = kids.filter((k) => k.point).map((k) => k.point!);
      if (pts.length > 1) break;
      r.add('quad.mergeCheck', { n: pts.length }, { [c.id]: 'current', ...Object.fromEntries(kids.map((k) => [k.id, 'path'])) });
      c.children = null;
      c.point = pts.length ? pts[0] : null;
      r.add('quad.merged', {}, { [c.id]: 'new' });
    }
    return r.done(true);
  }

  // ---- helpers ---------------------------------------------------------------

  private doInsert(x: number, y: number, r: Recorder<QState>): boolean {
    let { leaf, path } = this.descend(x, y, r, 'quad.insert.start');
    for (;;) {
      const existing = leaf.point;
      if (!existing) {
        leaf.point = { id: this.nextId++, x, y };
        r.add('quad.insert.empty', { x: fmtCoord(x), y: fmtCoord(y) }, { ...path, [leaf.id]: 'new', [leaf.point.id]: 'new' });
        return true;
      }
      if (existing.x === x && existing.y === y) {
        r.add('quad.duplicate', { x: fmtCoord(x), y: fmtCoord(y) }, { ...path, [leaf.id]: 'found', [existing.id]: 'found' }, cursor(x, y, leaf.id));
        return false;
      }
      
      r.add('quad.occupied', { ox: fmtCoord(existing.x), oy: fmtCoord(existing.y) }, { ...path, [leaf.id]: 'current', [existing.id]: 'moved' }, cursor(x, y, leaf.id));
      this.split(leaf);
      const q = leaf.quadrantOf(existing.x, existing.y);
      r.add(
        'quad.split',
        { ox: fmtCoord(existing.x), oy: fmtCoord(existing.y), q: quadrantParam(q) },
        { ...path, [leaf.id]: 'current', [leaf.children![q].id]: 'moved', [existing.id]: 'moved' },
        cursor(x, y, leaf.id),
      );
      // Continue descending from the freshly split node.
      const qi = leaf.quadrantOf(x, y);
      const next = leaf.children![qi];
      path[leaf.id] = 'path';
      r.add('quad.descend', { x: fmtCoord(x), y: fmtCoord(y), q: quadrantParam(qi) }, { ...path, [next.id]: 'current' }, cursor(x, y, next.id));
      leaf = next;
    }
  }

  private descend(x: number, y: number, r: Recorder<QState>, startKey: string): { leaf: Cell; path: Marks } {
    let c = this.root;
    const path: Marks = {};
    r.add(startKey, { x: fmtCoord(x), y: fmtCoord(y) }, { [c.id]: 'current' }, cursor(x, y, c.id));
    while (c.children) {
      const q = c.quadrantOf(x, y);
      const next = c.children[q];
      path[c.id] = 'path';
      r.add('quad.descend', { x: fmtCoord(x), y: fmtCoord(y), q: quadrantParam(q) }, { ...path, [next.id]: 'current' }, cursor(x, y, next.id));
      c = next;
    }
    return { leaf: c, path };
  }

  private notFound(x: number, y: number, leaf: Cell, path: Marks, r: Recorder<QState>): void {
    const p = leaf.point;
    if (p) {
      r.add('quad.notFoundOther', { x: fmtCoord(x), y: fmtCoord(y), ox: fmtCoord(p.x), oy: fmtCoord(p.y) }, { ...path, [leaf.id]: 'notfound' }, { ...cursor(x, y, leaf.id), result: 'notfound' });
    } else {
      r.add('quad.notFoundEmpty', { x: fmtCoord(x), y: fmtCoord(y) }, { ...path, [leaf.id]: 'notfound' }, { ...cursor(x, y, leaf.id), result: 'notfound' });
    }
  }

  private split(c: Cell): void {
    const h = c.size / 2;
    const d = c.depth + 1;
    c.children = [
      this.newCell(c.x, c.y + h, h, d, c), // NW
      this.newCell(c.x + h, c.y + h, h, d, c), // NE
      this.newCell(c.x, c.y, h, d, c), // SW
      this.newCell(c.x + h, c.y, h, d, c), // SE
    ];
    const p = c.point;
    c.point = null;
    if (p) c.children[c.quadrantOf(p.x, p.y)].point = p;
  }

  private leafFor(x: number, y: number): Cell {
    let c = this.root;
    while (c.children) c = c.children[c.quadrantOf(x, y)];
    return c;
  }

  private newCell(x: number, y: number, size: number, depth: number, parent: Cell | null): Cell {
    return new Cell(this.nextId++, x, y, size, depth, parent);
  }
}
