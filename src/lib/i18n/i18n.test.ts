import { describe, expect, it } from 'vitest';
import { cs } from './cs';
import { en } from './en';
import { format } from './index.svelte';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  it('English uses the same placeholders as the Czech original', () => {
    for (const [key, value] of Object.entries(cs)) {
      expect(placeholders(en[key as keyof typeof en]), key).toEqual(placeholders(value));
    }
  });
  it('interpolates and translates @-params', () => {
    expect(format(cs, 'quad.descend', { x: '1.0', y: '2.0', q: '@q.NE' })).toBe('[1.0,2.0] leží v kvadrantu NE (severovýchod) → sestupuji do něj.');
    expect(format(en, 'quad.descend', { x: '1.0', y: '2.0', q: '@q.NE' })).toContain('NE (north-east)');
  });
  it('keeps the original 2-3 split text verbatim', () => {
    expect(format(cs, 'tt.split', { up: 20, new: 30 })).toBe(
      'Došlo k rozdělení prvku, klíč 20 je přesunut do rodiče, zatímco klíč 30 je přesunut do nově vzniklého prvku',
    );
  });
  it('escapes interpolated values in HTML mode', () => {
    expect(format(cs, 'err.range1D', { min: '<x>', max: 1 }, (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;'))).toContain('&lt;x&gt;');
  });
});
