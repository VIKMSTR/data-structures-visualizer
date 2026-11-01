/** Translatable message: a key into the i18n tables plus interpolation params.
 *  A string param starting with '@' is itself translated (e.g. '@side.left'). */
export type MsgParams = Record<string, string | number>;
export interface Msg {
  key: string;
  params?: MsgParams;
}

/** How a node/point is highlighted in a step. */
export type Mark =
  | 'current'
  | 'path'
  | 'found'
  | 'new'
  | 'remove'
  | 'notfound'
  | 'imbalanced'
  | 'pivot'
  | 'moved';

export type Marks = Record<number, Mark>;

/** The floating "value being processed" badge. `at` is the node it hovers over. */
export interface Cursor {
  label: string;
  at: number | null;
  /** Optional plane coordinates (quadtree). */
  x?: number;
  y?: number;
}

/** One frame of an animation: a full immutable snapshot plus annotations. */
export interface Step<S> {
  state: S;
  msg: Msg;
  marks: Marks;
  cursor?: Cursor;
  /** Relative duration multiplier (1 = normal). */
  pace: number;
}

export interface OpResult<S> {
  ok: boolean;
  steps: Step<S>[];
}

/** Collects steps while an algorithm runs. Every step snapshots the whole structure,
 *  which keeps stepping backwards trivial (structures here are small). */
export class Recorder<S> {
  readonly steps: Step<S>[] = [];
  pace = 1;
  private readonly snapshot: () => S;

  constructor(snapshot: () => S) {
    this.snapshot = snapshot;
  }

  add(key: string, params?: MsgParams, marks: Marks = {}, cursor?: Cursor): void {
    this.steps.push({ state: this.snapshot(), msg: { key, params }, marks, cursor, pace: this.pace });
  }

  done(ok: boolean): OpResult<S> {
    return { ok, steps: this.steps };
  }
}

/** Runs several operations and concatenates their steps into one animation. */
export function concatResults<S>(results: OpResult<S>[]): OpResult<S> {
  const steps: Step<S>[] = [];
  let ok = true;
  for (const r of results) {
    steps.push(...r.steps);
    ok = ok && r.ok;
  }
  return { ok, steps };
}
