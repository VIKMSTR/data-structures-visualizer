import { describe, expect, it } from 'vitest';
import { cs } from './cs';
import { en } from './en';
import { format } from './index.svelte';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  it('Czech uses the same placeholders as English', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(placeholders(cs[key as keyof typeof cs]), key).toEqual(placeholders(value));
    }
  });
  it('interpolates and translates @-params', () => {
    expect(format(en, 'quad.descend', { x: 1, y: 2, q: '@q.NE' })).toBe('(1, 2) lies in the NE (north-east) quadrant → descend into it.');
    expect(format(cs, 'quad.descend', { x: 1, y: 2, q: '@q.NE' })).toContain('SV (severovýchod)');
  });
});
