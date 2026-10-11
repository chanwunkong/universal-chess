import type { VariantDef } from './engine/types';

const KEY = 'universal-chess.custom-variants';

export function loadCustom(): VariantDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VariantDef[]) : [];
  } catch {
    return [];
  }
}

export function saveCustom(list: VariantDef[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 無法存取 localStorage（私密模式等）時只在本次工作階段有效
  }
}

export function exportVariant(v: VariantDef) {
  const blob = new Blob([JSON.stringify(v, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${v.name || 'variant'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importVariant(file: File): Promise<VariantDef> {
  const v = JSON.parse(await file.text()) as VariantDef;
  if (!v.board || !v.pieces || !v.setup || !v.rules) throw new Error('不是有效的變體檔案');
  return { ...v, id: 'custom-' + Date.now(), custom: true };
}

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
