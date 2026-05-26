import { describe, it, expect } from "vitest";
import { Catalog, partLabel } from "./catalog";
import { BUILTIN_PARTS } from "./catalog-builtin";
import { computeDevices } from "./devices";
import { createProject, type Project, type SymbolInstance } from "./model";
import { SymbolLibrary, type SymbolDef } from "./symbol";
import { newId } from "./ids";

describe("каталог изделий", () => {
  it("доступ по коду и фильтр по ГОСТ-коду", () => {
    const cat = new Catalog(BUILTIN_PARTS);
    expect(cat.get("LC1D09M7")?.manufacturer).toBe("Schneider Electric");
    expect(cat.get("нет такого")).toBeUndefined();
    const qf = cat.byComponentCode("QF");
    expect(qf.length).toBeGreaterThan(0);
    expect(qf.every((p) => p.componentCode === "QF")).toBe(true);
  });

  it("partLabel собирает производитель/тип/номинал", () => {
    expect(partLabel({ code: "X", manufacturer: "IEK", type: "ВА47-29", rating: "C16" })).toBe(
      "IEK ВА47-29 C16",
    );
    expect(partLabel({ code: "X", manufacturer: "IEK", type: "ЗНИ-4" })).toBe("IEK ЗНИ-4");
  });

  it("встроенный каталог: уникальные коды", () => {
    const codes = BUILTIN_PARTS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("двухуровневый выбор: производители по коду + фильтр по марке", () => {
    const cat = new Catalog(BUILTIN_PARTS);
    const makers = cat.manufacturers("QF");
    expect(makers).toContain("IEK");
    expect(makers).toContain("ABB");
    expect(makers).toEqual([...makers].sort((a, b) => a.localeCompare(b, "ru"))); // отсортированы
    const abbQf = cat.byCodeAndManufacturer("QF", "ABB");
    expect(abbQf.length).toBeGreaterThan(0);
    expect(abbQf.every((p) => p.manufacturer === "ABB" && p.componentCode === "QF")).toBe(true);
  });
});

describe("артикул устройства (Device.catalogCode)", () => {
  const coil: SymbolDef = {
    id: "t.coil",
    name: "Катушка",
    category: "c",
    componentCode: "KM",
    kind: "coil",
    pins: [{ name: "A1", x: 0, y: 0 }],
    graphics: [],
  };
  const noContact: SymbolDef = {
    id: "t.no",
    name: "Контакт",
    category: "c",
    componentCode: "KM",
    kind: "contact-no",
    pins: [{ name: "13", x: 0, y: 0 }],
    graphics: [],
  };
  const lib = new SymbolLibrary([coil, noContact]);

  function inst(sym: SymbolDef, designation: string, catalogCode?: string): SymbolInstance {
    return {
      id: newId(),
      symbolId: sym.id,
      designation,
      componentCode: sym.componentCode,
      x: 100,
      y: 100,
      rotation: 0,
      mirror: false,
      showLabels: true,
      catalogCode,
    };
  }

  function proj(insts: SymbolInstance[]): Project {
    const p = createProject();
    p.pages[0].instances.push(...insts);
    return p;
  }

  it("артикул берётся с master-катушки", () => {
    const p = proj([inst(coil, "KM1", "LC1D09M7"), inst(noContact, "KM1")]);
    const dev = computeDevices(p, lib).find((d) => d.designation === "KM1")!;
    expect(dev.catalogCode).toBe("LC1D09M7");
  });

  it("если у master нет кода — берётся с любого представления", () => {
    const p = proj([inst(coil, "KM1"), inst(noContact, "KM1", "X-99")]);
    const dev = computeDevices(p, lib).find((d) => d.designation === "KM1")!;
    expect(dev.catalogCode).toBe("X-99");
  });

  it("без привязки — undefined", () => {
    const p = proj([inst(coil, "KM1")]);
    const dev = computeDevices(p, lib)[0];
    expect(dev.catalogCode).toBeUndefined();
  });
});
