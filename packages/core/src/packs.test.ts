import { describe, it, expect } from "vitest";
import { buildPack, validatePack, serializePack, parsePack, PACK_FORMAT_VERSION } from "./packs";
import { GOST_CATEGORIES } from "./categories";
import type { SymbolDef } from "./symbol";
import type { BlockDef } from "./blocks";

const sym: SymbolDef = {
  id: "user.x",
  name: "Мой",
  category: "Датчики",
  componentCode: "BK",
  kind: "component",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [],
};
const block: BlockDef = {
  id: "block.1",
  name: "Ввод",
  members: [{ symbolId: "user.x", dx: 0, dy: 0, rotation: 0, mirror: false }],
};
const cat = { ...GOST_CATEGORIES[0], id: "user.c", name: "Датчики", user: true };

describe("библиотечные паки", () => {
  it("buildPack + round-trip через serialize/parse", () => {
    const pack = buildPack("Мой пак", { categories: [cat], symbols: [sym], blocks: [block] });
    expect(pack.formatVersion).toBe(PACK_FORMAT_VERSION);
    const r = parsePack(serializePack(pack));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.name).toBe("Мой пак");
      expect(r.pack.categories).toHaveLength(1);
      expect(r.pack.symbols[0].id).toBe("user.x");
      expect(r.pack.blocks[0].name).toBe("Ввод");
    }
  });

  it("импорт лоялен: битые элементы отбрасываются, валидные остаются", () => {
    const r = validatePack({
      name: "Сборная",
      symbols: [sym, { id: "bad" }],
      categories: [cat, { id: "x" }],
      blocks: [block, { id: "b", members: [] }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.symbols).toHaveLength(1);
      expect(r.pack.categories).toHaveLength(1);
      expect(r.pack.blocks).toHaveLength(1);
    }
  });

  it("не объект — ошибка; версия новее — ошибка", () => {
    expect(parsePack("[]").ok).toBe(false);
    expect(parsePack("не json").ok).toBe(false);
    expect(validatePack({ formatVersion: PACK_FORMAT_VERSION + 1 }).ok).toBe(false);
  });
});
