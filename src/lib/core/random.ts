export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) for reproducible tests and demos. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (min: number, max: number, rng: Rng = Math.random): number =>
  min + Math.floor(rng() * (max - min + 1));

/** `n` distinct integers from [min, max] in random order. */
export function randomDistinct(n: number, min: number, max: number, rng: Rng = Math.random): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const count = Math.min(n, max - min + 1);
  while (out.length < count) {
    const v = randomInt(min, max, rng);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function randomPoints(n: number, max: number, rng: Rng = Math.random): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  while (out.length < n) {
    const p: [number, number] = [randomInt(0, max, rng), randomInt(0, max, rng)];
    const k = p.join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}
