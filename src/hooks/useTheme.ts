import { useSyncExternalStore } from 'react';

/** Preferencia visual (no es un dato financiero; se puede guardar en localStorage). */
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'roa-theme';
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function applyTheme(pref: ThemePref = readPref()) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  const root = document.documentElement;
  root.classList.toggle('dark', !!dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', dark ? '#0b0d12' : '#f5f6f8');
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* modo privado */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    applyTheme();
    listeners.forEach((l) => l());
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, readPref, () => 'system' as ThemePref);
  const resolved: 'light' | 'dark' = pref === 'dark' || (pref === 'system' && systemDark()) ? 'dark' : 'light';
  return { pref, resolved, setPref: setThemePref };
}
