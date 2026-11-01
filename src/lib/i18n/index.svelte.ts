import type { MsgParams } from '../core/types';
import { cs, type MessageKey } from './cs';
import { en } from './en';

export type Lang = 'cs' | 'en';
const tables: Record<Lang, Record<string, string>> = { cs, en };
const STORAGE_KEY = 'dsviz.lang';

/** localStorage can throw (privacy modes, some embedded webviews) — never let that break the app. */
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Czech by default, like the original applications. */
function initialLang(): Lang {
  return readStored() === 'en' ? 'en' : 'cs';
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

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain-text translation (markup removed). Reading `i18n.lang` makes call sites reactive. */
export function t(key: MessageKey | string, params?: MsgParams): string {
  return stripTags(format(tables[i18n.lang], key, params));
}

/** Translation keeping the table's <b>/<br> markup; interpolated values are HTML-escaped. */
export function tHtml(key: MessageKey | string, params?: MsgParams): string {
  return format(tables[i18n.lang], key, params, escapeHtml);
}

export function format(
  table: Record<string, string>,
  key: string,
  params?: MsgParams,
  escape: (s: string) => string = (s) => s,
): string {
  const template = table[key] ?? (cs as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params ? params[name] : undefined;
    if (v === undefined) return whole;
    if (typeof v === 'string' && v.charAt(0) === '@') return format(table, v.slice(1), undefined, escape);
    return escape(String(v));
  });
}
