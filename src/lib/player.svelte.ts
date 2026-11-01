import type { Step } from './core/types';

/** Original speed slider: a rate multiplier, duration = base / rate. */
export const SPEED_MIN = 0.3;
export const SPEED_MAX = 2.5;
/** Original base duration of a move (AnimationTools.DURATION). */
const BASE_MS = 1000;
/** Short pause after each step so the description can be read (the original had none). */
const HOLD = 0.15;

/**
 * Plays a recorded list of steps with the semantics of the original AnimationControl:
 *  - stepping off: steps chain automatically; `back()` rewinds the whole operation;
 *  - stepping on ("Krokovat"): one step per `forward()` / `back()`.
 */
export class Player<S> {
  steps = $state.raw<Step<S>[]>([]);
  index = $state(0);
  playing = $state(false);
  direction = $state<1 | -1>(1);
  speed = $state(1);
  stepping = $state(false);
  /** Increments on each new operation (used to re-fit the view). */
  opId = $state(0);
  /** Relative duration of the transition that led to the current step. */
  private transitionPace = $state(1);

  step = $derived<Step<S> | undefined>(this.steps[this.index]);

  private timer: ReturnType<typeof setTimeout> | undefined;

  get atEnd(): boolean {
    return this.index >= this.steps.length - 1;
  }

  get atStart(): boolean {
    return this.index <= 0;
  }

  /** Duration of the movement into the current step.
   *  Never zeroed by `prefers-reduced-motion`: the movement *is* the explanation
   *  (the moving badge travelling to each compared node, see docs/original/bvs.md §2.3). */
  get tweenMs(): number {
    return (BASE_MS * this.transitionPace) / this.speed;
  }

  load(steps: Step<S>[], opts: { autoplay?: boolean; toEnd?: boolean } = {}): void {
    this.pause();
    this.steps = steps;
    this.index = opts.toEnd ? Math.max(0, steps.length - 1) : 0;
    this.transitionPace = steps.length ? steps[this.index].pace : 1;
    this.direction = 1;
    this.opId++;
    if ((opts.autoplay ?? true) && !this.stepping && steps.length > 1) {
      this.playing = true;
      this.schedule();
    }
  }

  /** ">>": next step when stepping, otherwise resume playing forward. */
  forward = (): void => {
    if (this.stepping) this.stepBy(1);
    else this.run(1);
  };

  /** "<<": previous step when stepping, otherwise rewind the whole operation. */
  back = (): void => {
    if (this.stepping) this.stepBy(-1);
    else this.run(-1);
  };

  /** Play/Pause: toggles playback in the current direction. */
  toggle = (): void => {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.direction === 1 && this.atEnd) this.go(0, false);
    else if (this.direction === -1 && this.atStart) this.direction = 1;
    this.playing = true;
    this.schedule();
  };

  pause = (): void => {
    this.playing = false;
    clearTimeout(this.timer);
  };

  /** Single step regardless of the stepping mode (keyboard arrows, description clicks). */
  stepBy = (delta: 1 | -1): void => {
    this.pause();
    const i = this.index + delta;
    if (i < 0 || i >= this.steps.length) return;
    this.direction = delta;
    this.go(i, delta < 0);
  };

  seek = (i: number): void => {
    this.pause();
    const j = Math.max(0, Math.min(this.steps.length - 1, i));
    if (j !== this.index) this.go(j, j < this.index);
  };

  first = (): void => this.seek(0);
  last = (): void => this.seek(this.steps.length - 1);

  setSpeed = (s: number): void => {
    this.speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, s));
  };

  setStepping = (b: boolean): void => {
    this.stepping = b;
  };

  private run(dir: 1 | -1): void {
    if ((dir === 1 && this.atEnd) || (dir === -1 && this.atStart)) return;
    this.direction = dir;
    this.playing = true;
    clearTimeout(this.timer);
    this.advance();
  }

  private go(i: number, reverse: boolean): void {
    // Going back replays the transition of the step we leave, in reverse.
    this.transitionPace = reverse ? this.steps[this.index].pace : this.steps[i].pace;
    this.index = i;
  }

  private advance(): void {
    if (!this.playing) return;
    const next = this.index + this.direction;
    if (next < 0 || next >= this.steps.length) {
      this.playing = false;
      return;
    }
    this.go(next, this.direction < 0);
    if (this.stepping) {
      this.playing = false;
      return;
    }
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    const wait = this.tweenMs + (BASE_MS * HOLD * this.transitionPace) / this.speed;
    this.timer = setTimeout(() => this.advance(), wait);
  }
}

/** The subset of Player used by generic controls (independent of the state type). */
export type PlayerControls = Pick<
  Player<unknown>,
  | 'steps'
  | 'index'
  | 'playing'
  | 'speed'
  | 'stepping'
  | 'step'
  | 'atEnd'
  | 'atStart'
  | 'forward'
  | 'back'
  | 'toggle'
  | 'stepBy'
  | 'seek'
  | 'first'
  | 'last'
  | 'setSpeed'
  | 'setStepping'
>;
