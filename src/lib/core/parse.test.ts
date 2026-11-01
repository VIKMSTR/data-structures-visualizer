import { describe, expect, it } from 'vitest';
import { parsePoints, parseValues } from './parse';

describe('parse', () => {
  it('parses value lists', () => {
    expect(parseValues(' 5, 3 8;12 ', 0, 99)).toEqual([5, 3, 8, 12]);
    expect(parseValues('', 0, 99)).toBeNull();
    expect(parseValues('5, x', 0, 99)).toBeNull();
    expect(parseValues('100', 0, 99)).toBeNull();
    expect(parseValues('-1', 0, 99)).toBeNull();
    expect(parseValues('1.5', 0, 99)).toBeNull();
  });
  it('parses point lists', () => {
    expect(parsePoints('20 70; 30,40', 99)).toEqual([[20, 70], [30, 40]]);
    expect(parsePoints('20', 99)).toBeNull();
  });
});
