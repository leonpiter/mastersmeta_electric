import { describe, it, expect } from "vitest";
import { computeBom, bomToCsv } from "./reports";
import { Catalog } from "./catalog";
import { createProject, type Project, type SymbolInstance } from "./model";
import { SymbolLibrary, type SymbolDef } from "./symbol";
import { newId } from "./ids";

const coil: SymbolDef = {
  id: "t.coil",
  name: "Катушка контактора",
  category: "c",
  componentCode: "KM",
  kind: "coil",
  pins: [{ name: "A1", x: 0, y: 0 }],
  graphics: [],
};
const noContact: SymbolDef = {
  id: "t.no",
  name: "Контакт КМ (НО)",
  category: "c",
  componentCode: "KM",
  kind: "contact-no",
  pins: [{ name: "13", x: 0, y: 0 }],
  graphics: [],
};
const breaker: SymbolDef = {
  id: "t.qf",
  name: "Выключатель автоматический",
  category: "c",
  componentCode: "QF",
  kind: "component-aux",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [],
};
const lib = new SymbolLibrary([coil, noContact, breaker]);
const catalog = new Catalog([
  { code: "LC1D09M7", manufacturer: "Schneider Electric", type: "TeSys D", rating: "9А" },
]);

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

describe("перечень элементов (BOM)", () => {
  it("одно устройство (катушка+контакт) = одна строка", () => {
    const p = proj([inst(coil, "KM1", "LC1D09M7"), inst(noContact, "KM1"), inst(breaker, "QF1")]);
    const rows = computeBom(p, lib, catalog);
    expect(rows).toHaveLength(2); // KM1 (катушка+контакт слиты) + QF1
    const km1 = rows.find((r) => r.designation === "KM1");
    expect(km1?.name).toBe("Катушка контактора · Schneider Electric TeSys D 9А");
    expect(km1?.note).toBe("LC1D09M7");
    expect(km1?.quantity).toBe(1);
  });

  it("без артикула — только имя УГО, примечание пустое", () => {
    const rows = computeBom(proj([inst(breaker, "QF1")]), lib, catalog);
    expect(rows[0].name).toBe("Выключатель автоматический");
    expect(rows[0].note).toBe("");
  });

  it("натуральная сортировка сигл (QF2 < QF10)", () => {
    const p = proj([inst(breaker, "QF10"), inst(breaker, "QF2"), inst(coil, "KM1")]);
    expect(computeBom(p, lib, catalog).map((r) => r.designation)).toEqual(["KM1", "QF2", "QF10"]);
  });

  it("bomToCsv: заголовок, разделитель ; и экранирование", () => {
    const csv = bomToCsv([{ designation: "QF1", name: "Авт; «ВА»", quantity: 1, note: "X" }]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Поз. обозначение;Наименование;Кол.;Примечание");
    expect(lines[1]).toBe('QF1;"Авт; «ВА»";1;X'); // запятая→кавычки из-за ;
  });
});
