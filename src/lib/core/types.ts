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

/** The floating "value being processed" badge (the original's moving node). `at` is the node it covers. */
export interface Cursor {
  label: string;
  at: number | null;
  /** Optional plane coordinates (quadtree). */
  x?: number;
  y?: number;
  /** Search outcome colouring (original: LIGHTGREEN / LIGHTPINK). */
  result?: 'found' | 'notfound';
  /** Drop the badge below the node (original: +50 px after a search). */
  drop?: boolean;
  /** 2-3 tree: index of the key cell the badge sits over / drops into. */
  slot?: number;
}

/** AVL rotation direction indicator (original RotationDirectionElement) drawn under node `at`. */
export interface RotationArrow {
  at: number;
  dir: 'left' | 'right';
}

/** User-facing error, shown as a dialog like the original HTMLDialog (title + message). */
export interface OpError {
  title: string;
  msg: Msg;
}

/** One frame of an animation: a full immutable snapshot plus annotations. */
export interface Step<S> {
  state: S;
  msg: Msg;
  marks: Marks;
  cursor?: Cursor;
  /** Duration of the transition into this step, relative to the original 1000 ms move. */
  pace: number;
  arrow?: RotationArrow;
}

export interface OpResult<S> {
  ok: boolean;
  steps: Step<S>[];
  /** Set when the operation is rejected (duplicate, missing element, …). */
  error?: OpError;
}

/** Original durations relative to the 1000 ms move: fades 200 ms, layout shifts 400 ms. */
export const PACE = { move: 1, shift: 0.4, fade: 0.2 } as const;

export interface StepExtra {
  pace?: number;
  arrow?: RotationArrow;
}

/** Collects steps while an algorithm runs. Every step snapshots the whole structure,
 *  which keeps stepping backwards trivial (structures here are small). */
export class Recorder<S> {
  readonly steps: Step<S>[] = [];
  /** Multiplier applied to every added step (preset builds play at 10x: 0.1). */
  pace = 1;
  private readonly snapshot: () => S;

  constructor(snapshot: () => S) {
    this.snapshot = snapshot;
  }

  add(key: string, params?: MsgParams, marks: Marks = {}, cursor?: Cursor, extra: StepExtra = {}): void {
    this.steps.push({
      state: this.snapshot(),
      msg: { key, params },
      marks,
      cursor,
      pace: (extra.pace ?? PACE.move) * this.pace,
      arrow: extra.arrow,
    });
  }

  done(ok: boolean): OpResult<S> {
    return { ok, steps: this.steps };
  }

  fail(title: string, key: string, params?: MsgParams): OpResult<S> {
    return { ok: false, steps: this.steps, error: { title, msg: { key, params } } };
  }
}

/** Runs several operations and concatenates their steps into one animation. */
export function concatResults<S>(results: OpResult<S>[]): OpResult<S> {
  const steps: Step<S>[] = [];
  let ok = true;
  for (const r of results) {
    steps.push(...r.steps);
    ok = ok && r.ok;
    if (r.error) return { ok: false, steps, error: r.error };
  }
  return { ok, steps };
}
