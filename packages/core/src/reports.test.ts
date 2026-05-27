import { describe, it, expect } from "vitest";
import {
  computeBom,
  bomToCsv,
  computeConnections,
  connectionsToCsv,
  computeTerminals,
  terminalsToCsv,
  computeTerminalStrips,
} from "./reports";
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

describe("таблица соединений", () => {
  const coil2: SymbolDef = {
    id: "t.coil2",
    name: "Катушка",
    category: "c",
    componentCode: "KM",
    kind: "coil",
    pins: [
      { name: "A1", x: 0, y: 0 },
      { name: "A2", x: 0, y: 15 },
    ],
    graphics: [],
  };
  const brk2: SymbolDef = {
    id: "t.brk2",
    name: "Автомат",
    category: "c",
    componentCode: "QF",
    kind: "component-aux",
    pins: [
      { name: "1", x: 0, y: 0 },
      { name: "2", x: 0, y: 15 },
    ],
    graphics: [],
  };
  const lib2 = new SymbolLibrary([coil2, brk2]);

  function instAt(sym: SymbolDef, designation: string, x: number, y: number): SymbolInstance {
    return {
      id: newId(),
      symbolId: sym.id,
      designation,
      componentCode: sym.componentCode,
      x,
      y,
      rotation: 0,
      mirror: false,
      showLabels: true,
    };
  }

  it("цепь с двумя выводами → строка соединения", () => {
    const p = createProject();
    p.pages[0].instances.push(instAt(coil2, "KM1", 0, 0), instAt(brk2, "QF1", 10, 0));
    // провод соединяет KM1:A1 (0,0) и QF1:1 (10,0)
    p.pages[0].wires.push({
      id: newId(),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      type: "power",
      number: "1",
      section: "2.5",
    });
    const rows = computeConnections(p, lib2);
    expect(rows).toHaveLength(1);
    expect(rows[0].net).toBe("1");
    expect(rows[0].pins).toBe("KM1:A1 · QF1:1"); // отсортировано
    expect(rows[0].wire).toBe("силовой · 2.5 мм²");
    expect(rows[0].sheet).toBe("1");
  });

  it("висящие выводы (цепь из одного вывода) не попадают", () => {
    const p = createProject();
    p.pages[0].instances.push(instAt(coil2, "KM1", 0, 0));
    expect(computeConnections(p, lib2)).toHaveLength(0);
  });

  it("connectionsToCsv: заголовок и поля", () => {
    const csv = connectionsToCsv([
      { net: "1", pins: "KM1:A1 · QF1:1", wire: "силовой", sheet: "1" },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Цепь;Соединяемые выводы;Провод;Лист");
    expect(lines[1]).toBe("1;KM1:A1 · QF1:1;силовой;1");
  });
});

describe("таблица клемм", () => {
  const term: SymbolDef = {
    id: "t.xt",
    name: "Клемма",
    category: "c",
    componentCode: "XT",
    kind: "terminal",
    pins: [
      { name: "1", x: 0, y: 0 },
      { name: "2", x: 0, y: 10 },
    ],
    graphics: [],
  };
  const coil3: SymbolDef = {
    id: "t.coil3",
    name: "Катушка",
    category: "c",
    componentCode: "KM",
    kind: "coil",
    pins: [{ name: "A1", x: 0, y: 0 }],
    graphics: [],
  };
  const brk3: SymbolDef = {
    id: "t.brk3",
    name: "Автомат",
    category: "c",
    componentCode: "QF",
    kind: "component-aux",
    pins: [{ name: "1", x: 0, y: 0 }],
    graphics: [],
  };
  const lib3 = new SymbolLibrary([term, coil3, brk3]);

  function at(sym: SymbolDef, designation: string, x: number, y: number): SymbolInstance {
    return {
      id: newId(),
      symbolId: sym.id,
      designation,
      componentCode: sym.componentCode,
      x,
      y,
      rotation: 0,
      mirror: false,
      showLabels: true,
    };
  }

  it("клемма с подключениями к обоим выводам (совпадающие координаты выводов)", () => {
    const p = createProject();
    p.pages[0].instances.push(
      at(term, "XT1", 0, 0), // выводы 1(0,0), 2(0,10)
      at(coil3, "KM1", 0, 0), // A1 совпадает с XT1:1
      at(brk3, "QF1", 0, 10), // 1 совпадает с XT1:2
    );
    const rows = computeTerminals(p, lib3);
    expect(rows).toHaveLength(1);
    expect(rows[0].terminal).toBe("XT1");
    expect(rows[0].side1).toBe("KM1:A1");
    expect(rows[0].side2).toBe("QF1:1");
    expect(rows[0].sheet).toBe("1");
  });

  it("несоединённый вывод → «—»; не-клеммы игнорируются", () => {
    const p = createProject();
    p.pages[0].instances.push(at(term, "XT1", 50, 50), at(coil3, "KM1", 100, 100));
    const rows = computeTerminals(p, lib3);
    expect(rows).toHaveLength(1); // только клемма
    expect(rows[0].side1).toBe("—");
    expect(rows[0].side2).toBe("—");
  });

  it("terminalsToCsv: заголовок", () => {
    const csv = terminalsToCsv([{ terminal: "XT1", side1: "KM1:A1", side2: "QF1:1", sheet: "1" }]);
    expect(csv.split("\r\n")[0]).toBe("Клемма;Вывод 1;Вывод 2;Лист");
  });

  it("computeTerminalStrips: группировка по префиксу, сортировка по номеру", () => {
    const p = createProject();
    p.pages[0].instances.push(
      at(term, "XT2", 0, 0),
      at(term, "XT10", 0, 30),
      at(term, "XT1", 0, 60),
      at(term, "X1", 0, 90), // другая рейка
    );
    const strips = computeTerminalStrips(p, lib3);
    expect(strips.map((s) => s.name)).toEqual(["X", "XT"]);
    const xt = strips.find((s) => s.name === "XT")!;
    expect(xt.rows.map((r) => r.terminal)).toEqual(["XT1", "XT2", "XT10"]); // числовая сортировка
  });
});
