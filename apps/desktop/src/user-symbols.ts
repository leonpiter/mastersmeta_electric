/**
 * Пользовательская библиотека УГО (S9): свои символы и override системных,
 * хранятся в localStorage. Резолв: пользовательский символ перекрывает системный
 * по `id`. Полноценные `*.symbol.json` на диске/в проекте — позже (S12).
 */
import { validateSymbol, type SymbolDef } from "@see/core";

const KEY = "see.userSymbols";

/** Загрузить пользовательские символы (с валидацией; битые — отбрасываются). */
export function loadUserSymbols(): SymbolDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    const out: SymbolDef[] = [];
    for (const item of arr) {
      const v = validateSymbol(item);
      if (v.ok) out.push(v.symbol);
    }
    return out;
  } catch {
    return [];
  }
}

function persist(list: SymbolDef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* недоступно — игнор */
  }
}

/** Добавить/обновить пользовательский символ (по `id`). Возвращает новый список. */
export function upsertUserSymbol(sym: SymbolDef): SymbolDef[] {
  const list = loadUserSymbols().filter((s) => s.id !== sym.id);
  list.push(sym);
  persist(list);
  return list;
}

/** Удалить пользовательский символ/override по `id`. Возвращает новый список. */
export function removeUserSymbol(id: string): SymbolDef[] {
  const list = loadUserSymbols().filter((s) => s.id !== id);
  persist(list);
  return list;
}

/** Множество id пользовательских символов (для бейджа «мой» в панели). */
export function userSymbolIds(): Set<string> {
  return new Set(loadUserSymbols().map((s) => s.id));
}
