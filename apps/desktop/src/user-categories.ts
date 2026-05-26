/**
 * Пользовательские категории оборудования (S27): свои классы УГО со своими
 * характеристиками, хранятся в localStorage. Мёржатся в `CategoryRegistry`
 * поверх `GOST_CATEGORIES`. Выгрузка/шеринг паком (категории + символы) — позже (S12).
 */
import { validateCategory, type EquipmentCategory } from "@see/core";

const KEY = "see.userCategories";

/** Загрузить пользовательские категории (с валидацией; битые — отбрасываются). */
export function loadUserCategories(): EquipmentCategory[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    const out: EquipmentCategory[] = [];
    for (const item of arr) {
      const v = validateCategory(item);
      if (v.ok) out.push({ ...v.category, user: true });
    }
    return out;
  } catch {
    return [];
  }
}

function persist(list: EquipmentCategory[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* недоступно — игнор */
  }
}

/** Добавить/обновить пользовательскую категорию (по имени). Возвращает новый список. */
export function upsertUserCategory(cat: EquipmentCategory): EquipmentCategory[] {
  const list = loadUserCategories().filter((c) => c.name !== cat.name);
  list.push({ ...cat, user: true });
  persist(list);
  return list;
}

/** Удалить пользовательскую категорию по имени. Возвращает новый список. */
export function removeUserCategory(name: string): EquipmentCategory[] {
  const list = loadUserCategories().filter((c) => c.name !== name);
  persist(list);
  return list;
}

/** Множество имён пользовательских категорий. */
export function userCategoryNames(): Set<string> {
  return new Set(loadUserCategories().map((c) => c.name));
}
