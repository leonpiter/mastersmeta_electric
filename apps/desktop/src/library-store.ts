/**
 * Хранилище пользовательской библиотеки УГО (S30): свои символы и override системных,
 * категории, блоки. Источник истины — in-memory кэш; за ним стоит backend:
 *  - Electron — папка на диске (файлы), путь меняется в настройках;
 *  - web — localStorage (как раньше, fallback).
 * Синхронные геттеры читают кэш; мутаторы пишут в backend. Гидрация — async (`initLibrary`).
 */
import {
  validateSymbol,
  validateCategory,
  validateBlock,
  type SymbolDef,
  type EquipmentCategory,
  type BlockDef,
} from "@see/core";
import { desktop } from "./electron-bridge";

const SKEY = "see.userSymbols";
const CKEY = "see.userCategories";
const BKEY = "see.userBlocks";
const DIRKEY = "see.libraryDir";

let symbols: SymbolDef[] = [];
let categories: EquipmentCategory[] = [];
let blocks: BlockDef[] = [];
/** Папка библиотеки (Electron). null → backend = localStorage (web). */
let dir: string | null = null;
let onChange: () => void = () => {
  /* задаётся в initLibrary */
};

const fsActive = (): boolean => !!desktop() && dir !== null;

// ---- валидация при гидрации (битые записи отбрасываются) ----
const valSymbols = (arr: unknown[]): SymbolDef[] => {
  const out: SymbolDef[] = [];
  for (const it of arr) {
    const v = validateSymbol(it);
    if (v.ok) out.push(v.symbol);
  }
  return out;
};
const valCategories = (arr: unknown[]): EquipmentCategory[] => {
  const out: EquipmentCategory[] = [];
  for (const it of arr) {
    const v = validateCategory(it);
    if (v.ok) out.push({ ...v.category, user: true });
  }
  return out;
};
const valBlocks = (arr: unknown[]): BlockDef[] => {
  const out: BlockDef[] = [];
  for (const it of arr) {
    const v = validateBlock(it);
    if (v.ok) out.push(v.block);
  }
  return out;
};

const readLocal = (key: string): unknown[] => {
  try {
    const raw = localStorage.getItem(key);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const writeLocal = (key: string, list: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* недоступно — игнор */
  }
};

// ---- backend-запись ----
function persistSymbol(sym: SymbolDef): void {
  const d = desktop();
  if (fsActive() && d && dir) void d.library.saveSymbol(dir, sym);
  else writeLocal(SKEY, symbols);
}
function deleteSymbolBackend(id: string): void {
  const d = desktop();
  if (fsActive() && d && dir) void d.library.deleteSymbol(dir, id);
  else writeLocal(SKEY, symbols);
}
function persistCategories(): void {
  const d = desktop();
  if (fsActive() && d && dir) void d.library.saveCategories(dir, categories);
  else writeLocal(CKEY, categories);
}
function persistBlocks(): void {
  const d = desktop();
  if (fsActive() && d && dir) void d.library.saveBlocks(dir, blocks);
  else writeLocal(BKEY, blocks);
}

// ---- геттеры (кэш) ----
export const loadUserSymbols = (): SymbolDef[] => symbols;
export const userSymbolIds = (): Set<string> => new Set(symbols.map((s) => s.id));
export const loadUserCategories = (): EquipmentCategory[] => categories;
export const userCategoryNames = (): Set<string> => new Set(categories.map((c) => c.name));
export const loadUserBlocks = (): BlockDef[] => blocks;

// ---- мутаторы (кэш + backend) ----
export function upsertUserSymbol(sym: SymbolDef): SymbolDef[] {
  symbols = symbols.filter((s) => s.id !== sym.id);
  symbols.push(sym);
  persistSymbol(sym);
  return symbols;
}
export function removeUserSymbol(id: string): SymbolDef[] {
  symbols = symbols.filter((s) => s.id !== id);
  deleteSymbolBackend(id);
  return symbols;
}
export function upsertUserCategory(cat: EquipmentCategory): EquipmentCategory[] {
  categories = categories.filter((c) => c.name !== cat.name);
  categories.push({ ...cat, user: true });
  persistCategories();
  return categories;
}
export function removeUserCategory(name: string): EquipmentCategory[] {
  categories = categories.filter((c) => c.name !== name);
  persistCategories();
  return categories;
}
export function upsertUserBlock(block: BlockDef): BlockDef[] {
  blocks = blocks.filter((b) => b.id !== block.id);
  blocks.push(block);
  persistBlocks();
  return blocks;
}
export function removeUserBlock(id: string): BlockDef[] {
  blocks = blocks.filter((b) => b.id !== id);
  persistBlocks();
  return blocks;
}

// ---- инициализация / папка ----

/** Гидрация кэша: web → localStorage; Electron → папка (+ миграция из localStorage). */
export async function initLibrary(refresh: () => void): Promise<void> {
  onChange = refresh;
  const d = desktop();
  if (!d) {
    symbols = valSymbols(readLocal(SKEY));
    categories = valCategories(readLocal(CKEY));
    blocks = valBlocks(readLocal(BKEY));
    refresh();
    return;
  }
  const saved = localStorage.getItem(DIRKEY);
  dir = saved && saved.length > 0 ? saved : await d.library.defaultDir();
  writeLocal(DIRKEY, dir);
  await hydrateFromFolder(d, dir, true);
  refresh();
}

/** Прочитать папку в кэш; при пустой папке и непустом localStorage — один раз мигрировать. */
async function hydrateFromFolder(
  d: NonNullable<ReturnType<typeof desktop>>,
  folder: string,
  allowMigrate: boolean,
): Promise<void> {
  const data = await d.library.load(folder);
  symbols = valSymbols(data.symbols);
  categories = valCategories(data.categories);
  blocks = valBlocks(data.blocks);

  if (allowMigrate && symbols.length === 0 && categories.length === 0 && blocks.length === 0) {
    const ls = valSymbols(readLocal(SKEY));
    const lc = valCategories(readLocal(CKEY));
    const lb = valBlocks(readLocal(BKEY));
    if (ls.length || lc.length || lb.length) {
      for (const s of ls) await d.library.saveSymbol(folder, s);
      if (lc.length) await d.library.saveCategories(folder, lc);
      if (lb.length) await d.library.saveBlocks(folder, lb);
      symbols = ls;
      categories = lc;
      blocks = lb;
    }
  }
}

/** Текущая папка библиотеки (Electron) или null (web). */
export const getLibraryDir = (): string | null => dir;

/** Сменить папку библиотеки нативным пикером, перезагрузить кэш. true — папка выбрана. */
export async function changeLibraryDir(): Promise<boolean> {
  const d = desktop();
  if (!d) return false;
  const picked = await d.library.pickDir();
  if (!picked) return false;
  dir = picked;
  writeLocal(DIRKEY, dir);
  await hydrateFromFolder(d, dir, false);
  onChange();
  return true;
}

/** Открыть папку библиотеки в проводнике. */
export function revealLibraryDir(): void {
  const d = desktop();
  if (d && dir) void d.library.reveal(dir);
}
