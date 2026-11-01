/** Parses "5, 3 8;12" into integers within [min, max]; null if anything is invalid or empty. */
export function parseValues(text: string, min: number, max: number): number[] | null {
  const parts = text.split(/[\s,;]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < min || n > max) return null;
    out.push(n);
  }
  return out;
}

/** Parses "20 70; 30,40" into coordinate pairs. */
export function parsePoints(text: string, max: number): Array<[number, number]> | null {
  const nums = parseValues(text, 0, max);
  if (!nums || nums.length % 2 !== 0) return null;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}
