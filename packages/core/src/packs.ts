/**
 * Библиотечные паки (S12) — переносимый набор пользовательского контента:
 * категории + УГО + блоки в одном JSON-файле. Шеринг между инженерами (CLAUDE: open-source
 * с сообществом). Манифест с версией формата и (опц.) лицензией контента.
 *
 * Импорт устойчив: битые элементы отбрасываются (как в загрузчиках localStorage),
 * фундаментально неверная структура — ошибка. JSON Schema/CI-валидация и реестр — далее в S12.
 */
import { validateSymbol, type SymbolDef } from "./symbol";
import { validateCategory, type EquipmentCategory } from "./categories";
import { validateBlock, type BlockDef } from "./blocks";

/** Версия формата пака (для миграций). */
export const PACK_FORMAT_VERSION = 1;

/** Пак: манифест + контент (категории/символы/блоки). */
export interface LibraryPack {
  formatVersion: number;
  name: string;
  /** Лицензия контента (напр. «CC-BY-4.0»); опционально. */
  license?: string;
  categories: EquipmentCategory[];
  symbols: SymbolDef[];
  blocks: BlockDef[];
}

/** Собрать пак из частей. */
export function buildPack(
  name: string,
  parts: {
    categories?: EquipmentCategory[];
    symbols?: SymbolDef[];
    blocks?: BlockDef[];
    license?: string;
  },
): LibraryPack {
  return {
    formatVersion: PACK_FORMAT_VERSION,
    name: name || "Пак",
    ...(parts.license ? { license: parts.license } : {}),
    categories: parts.categories ?? [],
    symbols: parts.symbols ?? [],
    blocks: parts.blocks ?? [],
  };
}

export type PackValidation = { ok: true; pack: LibraryPack } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Разобрать произвольный объект как пак: оставить только валидные элементы каждого вида
 * (битые отбрасываются). Ошибка — только если это не объект или версия новее текущей.
 */
export function validatePack(input: unknown): PackValidation {
  if (!isObj(input)) return { ok: false, errors: ["pack must be an object"] };
  const version =
    typeof input.formatVersion === "number" ? input.formatVersion : PACK_FORMAT_VERSION;
  if (version > PACK_FORMAT_VERSION) {
    return { ok: false, errors: [`pack format ${version} новее — обновите приложение`] };
  }

  const categories: EquipmentCategory[] = [];
  if (Array.isArray(input.categories)) {
    for (const c of input.categories) {
      const v = validateCategory(c);
      if (v.ok) categories.push({ ...v.category, user: true });
    }
  }
  const symbols: SymbolDef[] = [];
  if (Array.isArray(input.symbols)) {
    for (const s of input.symbols) {
      const v = validateSymbol(s);
      if (v.ok) symbols.push(v.symbol);
    }
  }
  const blocks: BlockDef[] = [];
  if (Array.isArray(input.blocks)) {
    for (const b of input.blocks) {
      const v = validateBlock(b);
      if (v.ok) blocks.push(v.block);
    }
  }

  return {
    ok: true,
    pack: {
      formatVersion: PACK_FORMAT_VERSION,
      name: typeof input.name === "string" && input.name ? input.name : "Пак",
      ...(typeof input.license === "string" ? { license: input.license } : {}),
      categories,
      symbols,
      blocks,
    },
  };
}

/** Сериализовать пак в текст (детерминированно). */
export function serializePack(pack: LibraryPack): string {
  return JSON.stringify(pack, null, 2);
}

/** Разобрать текст пака (JSON) с валидацией. */
export function parsePack(text: string): PackValidation {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["файл не является корректным JSON"] };
  }
  return validatePack(data);
}
