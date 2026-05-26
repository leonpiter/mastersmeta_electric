/**
 * Пользовательские блоки (S27 Ф4): сохранённые макрос-группы УГО в localStorage.
 * Аналогично user-symbols/user-categories. Шеринг паком — позже (S12).
 */
import { validateBlock, type BlockDef } from "@see/core";

const KEY = "see.userBlocks";

/** Загрузить блоки (с валидацией; битые — отбрасываются). */
export function loadUserBlocks(): BlockDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    const out: BlockDef[] = [];
    for (const item of arr) {
      const v = validateBlock(item);
      if (v.ok) out.push(v.block);
    }
    return out;
  } catch {
    return [];
  }
}

function persist(list: BlockDef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* недоступно — игнор */
  }
}

/** Добавить/обновить блок (по id). Возвращает новый список. */
export function upsertUserBlock(block: BlockDef): BlockDef[] {
  const list = loadUserBlocks().filter((b) => b.id !== block.id);
  list.push(block);
  persist(list);
  return list;
}

/** Удалить блок по id. Возвращает новый список. */
export function removeUserBlock(id: string): BlockDef[] {
  const list = loadUserBlocks().filter((b) => b.id !== id);
  persist(list);
  return list;
}
