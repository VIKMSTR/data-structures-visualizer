import type { MsgParams } from '../core/types';
import { cs } from './cs';
import { en, type MessageKey } from './en';

export type Lang = 'en' | 'cs';
const tables: Record<Lang, Record<string, string>> = { en, cs };
const STORAGE_KEY = 'dsviz.lang';

/** localStorage can throw (privacy modes, some embedded webviews) — never let that break the app. */
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function initialLang(): Lang {
  const stored = readStored();
  if (stored === 'en' || stored === 'cs') return stored;
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().indexOf('cs') === 0 || nav.toLowerCase().indexOf('sk') === 0 ? 'cs' : 'en';
}

class I18n {
  lang = $state<Lang>(initialLang());

  set(lang: Lang): void {
    this.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }

  toggle = (): void => this.set(this.lang === 'cs' ? 'en' : 'cs');
}

export const i18n = new I18n();

/** Translates a key. Reading `i18n.lang` makes every call site reactive. */
export function t(key: MessageKey | string, params?: MsgParams): string {
  return format(tables[i18n.lang], key, params);
}

export function format(table: Record<string, string>, key: string, params?: MsgParams): string {
  const template = table[key] ?? (en as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params ? params[name] : undefined;
    if (v === undefined) return whole;
    if (typeof v === 'string' && v.charAt(0) === '@') return format(table, v.slice(1));
    return String(v);
  });
}
