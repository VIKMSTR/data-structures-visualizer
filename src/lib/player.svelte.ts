import type { Step } from './core/types';

export const SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
const BASE_STEP_MS = 1400;

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Plays back a recorded list of steps; all state is reactive. */
export class Player<S> {
  steps = $state.raw<Step<S>[]>([]);
  index = $state(0);
  playing = $state(false);
  speed = $state(1);
  /** Increments on each new operation (used to re-fit the view). */
  opId = $state(0);

  step = $derived<Step<S> | undefined>(this.steps[this.index]);

  private timer: ReturnType<typeof setTimeout> | undefined;

  get atEnd(): boolean {
    return this.index >= this.steps.length - 1;
  }

  /** Duration of the movement between two steps. */
  get tweenMs(): number {
    if (reducedMotion) return 0;
    const pace = this.step ? this.step.pace : 1;
    return Math.min(520, (BASE_STEP_MS * pace * 0.5) / this.speed);
  }

  load(steps: Step<S>[], opts: { autoplay?: boolean; toEnd?: boolean } = {}): void {
    this.pause();
    this.steps = steps;
    this.index = opts.toEnd ? Math.max(0, steps.length - 1) : 0;
    this.opId++;
    if ((opts.autoplay ?? true) && steps.length > 1) this.play();
  }

  play = (): void => {
    if (this.atEnd) this.index = 0;
    this.playing = true;
    this.schedule();
  };

  pause = (): void => {
    this.playing = false;
    clearTimeout(this.timer);
  };

  toggle = (): void => (this.playing ? this.pause() : this.play());
  next = (): void => this.seek(this.index + 1);
  prev = (): void => this.seek(this.index - 1);
  first = (): void => this.seek(0);
  last = (): void => this.seek(this.steps.length - 1);

  seek = (i: number): void => {
    this.pause();
    this.index = Math.max(0, Math.min(this.steps.length - 1, i));
  };

  setSpeed = (s: number): void => {
    this.speed = s;
    if (this.playing) this.schedule();
  };

  private schedule(): void {
    clearTimeout(this.timer);
    const pace = this.step ? this.step.pace : 1;
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      if (!this.atEnd) this.index++;
      if (this.atEnd) this.playing = false;
      else this.schedule();
    }, (BASE_STEP_MS * pace) / this.speed);
  }
}

/** The subset of Player used by generic controls (independent of the state type). */
export type PlayerControls = Pick<
  Player<unknown>,
  'steps' | 'index' | 'playing' | 'speed' | 'step' | 'atEnd' | 'toggle' | 'next' | 'prev' | 'first' | 'last' | 'seek' | 'setSpeed'
>;
