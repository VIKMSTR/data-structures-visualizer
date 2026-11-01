import { describe, expect, it } from 'vitest';
import { Player } from './player.svelte';
import { PACE, type Step } from './core/types';

const step = (pace: number): Step<null> => ({ state: null, msg: { key: 'x' }, marks: {}, pace });

describe('Player.tweenMs', () => {
  it('keeps the move duration of the original (1000 ms / rate)', () => {
    const p = new Player<null>();
    p.load([step(PACE.move), step(PACE.move)], { autoplay: false });
    expect(p.tweenMs).toBe(1000);
    p.setSpeed(2.5);
    expect(p.tweenMs).toBe(400);
    p.setSpeed(0.3);
    expect(Math.round(p.tweenMs)).toBe(3333);
  });

  it('animates every step, regardless of prefers-reduced-motion (the movement is the content)', () => {
    const p = new Player<null>();
    p.load([step(PACE.move), step(PACE.shift + PACE.fade)], { autoplay: false });
    p.stepBy(1);
    // The insert step (neighbours shift + new node fades in) must have a non-zero duration,
    // otherwise the new node appears without travelling/fading.
    expect(p.tweenMs).toBeGreaterThan(0);
    expect(p.tweenMs).toBeCloseTo(600, 6);
  });
});
