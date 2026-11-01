import type { Msg, OpError } from './core/types';

export interface Preset {
  /** Display name (a message key is used when `nameKey` is set). */
  name: string;
  nameKey?: string;
  values: number[] | Array<[number, number]>;
}

export type DialogState =
  | { kind: 'error'; title: string; msg: Msg }
  | { kind: 'help'; key: string }
  | { kind: 'presets'; presets: Preset[]; format: (p: Preset) => string; onok: (p: Preset, animate: boolean) => void };

/** One modal at a time, like the original application-modal dialogs. */
class Dialogs {
  current = $state<DialogState | null>(null);

  error(e: OpError): void {
    this.current = { kind: 'error', title: e.title, msg: e.msg };
  }

  help(key: string): void {
    this.current = { kind: 'help', key };
  }

  presets(presets: Preset[], format: (p: Preset) => string, onok: (p: Preset, animate: boolean) => void): void {
    this.current = { kind: 'presets', presets, format, onok };
  }

  close = (): void => {
    this.current = null;
  };
}

export const dialogs = new Dialogs();
