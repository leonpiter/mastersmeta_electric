import { describe, it, expect } from "vitest";
import { CategoryRegistry, GOST_CATEGORIES, type EquipmentCategory } from "./categories";
import { GOST_SYMBOLS } from "./symbols-gost";

describe("категории оборудования", () => {
  const reg = new CategoryRegistry(GOST_CATEGORIES);

  it("реестр: доступ по имени и id", () => {
    expect(reg.byName("Автоматические выключатели")?.componentCode).toBe("QF");
    expect(reg.byId("contactor")?.name).toBe("Контакторы");
    expect(reg.byName("нет такой")).toBeUndefined();
    expect(reg.all().length).toBe(GOST_CATEGORIES.length);
  });

  it("пользовательская категория мёржится/перекрывает по имени", () => {
    const my: EquipmentCategory = {
      id: "my.sensor",
      name: "Датчики",
      componentCode: "BK",
      kinds: ["component"],
      attributes: [{ key: "range", label: "Диапазон" }],
      user: true,
    };
    const r2 = new CategoryRegistry([...GOST_CATEGORIES, my]);
    expect(r2.byName("Датчики")?.user).toBe(true);
    expect(r2.all().length).toBe(GOST_CATEGORIES.length + 1);
  });

  it("у каждой категории уникальные id и имена", () => {
    const ids = GOST_CATEGORIES.map((c) => c.id);
    const names = GOST_CATEGORIES.map((c) => c.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("каждый встроенный символ соответствует своей категории (код + поведение)", () => {
    for (const sym of GOST_SYMBOLS) {
      const cat = reg.byName(sym.category);
      expect(cat, `категория символа ${sym.id}: «${sym.category}»`).toBeDefined();
      if (!cat) continue;
      expect(sym.componentCode, `код ${sym.id}`).toBe(cat.componentCode);
      expect(cat.kinds, `kind ${sym.id}`).toContain(sym.kind);
    }
  });
});
