import type { Preset } from './dialogs.svelte';

/** "Vzory" of the original apps (BVSPresets / AVLPresets / TwoThreePresets / QuadTreePresets). */
export const BINARY_PRESETS: Preset[] = [
  { name: 'Sada 1', values: [50, 100, 20, 80, 10, 40, 120] },
  { name: 'Sada 2', values: [20, 10, 40, 5, 15, 35, 60, 30, 37, 50, 80] },
  { name: 'Sada 3', values: [60, 40, 50, 70, 80, 35] },
  { name: 'Degradovaný strom', nameKey: 'preset.degenerate', values: [10, 20, 30, 40, 50] },
];

export const TWO_THREE_PRESETS: Preset[] = [
  { name: 'Sada 1', values: [50, 100, 20, 80, 10, 40, 120] },
  { name: 'Sada 2', values: [50, 100, 80, 75, 120] },
  { name: 'Sada 3', values: [10, 20, 30, 40, 50] },
  { name: 'Sada 4', values: [50, 100, 20, 90, 5, 120] },
];

export const QUAD_PRESETS: Preset[] = [
  { name: 'Sada 1', values: [[60, 40], [10, 20], [30, 70], [80, 80]] },
  { name: 'Sada 2', values: [[40, 40], [10, 10], [30, 70], [80, 80]] },
  { name: 'Sada 3', values: [[60, 60], [10, 10], [30, 70], [80, 20]] },
  { name: 'Sada 4', values: [[60, 40], [5, 22], [10, 80], [60, 60]] },
];
