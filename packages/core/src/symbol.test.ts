import { describe, it, expect } from "vitest";
import {
  rotatePoint,
  transformLocalPoint,
  symbolBounds,
  arcPath,
  nextDesignation,
  validateSymbol,
  SymbolLibrary,
  type SymbolDef,
} from "./symbol";
import { GOST_SYMBOLS } from "./symbols-gost";
import { createPage, instanceLabels, type SymbolInstance } from "./model";
import { CommandStack } from "./command";
import {
  AddSymbolInstanceCommand,
  RotateInstanceCommand,
  MirrorInstanceCommand,
  RemoveInstanceCommand,
  MoveInstanceCommand,
  EditInstanceCommand,
} from "./commands";

const sample: SymbolDef = {
  id: "test.x",
  name: "Тест",
  category: "Тест",
  componentCode: "QF",
  kind: "component",
  pins: [
    { name: "1", x: 0, y: 0 },
    { name: "2", x: 0, y: 10 },
  ],
  graphics: [{ type: "rect", x: -2, y: 2, w: 4, h: 6 }],
};

describe("трансформы выводов", () => {
  it("поворот на 0/90/180/270 (y вниз)", () => {
    expect(rotatePoint({ x: 3, y: 0 }, 0)).toEqual({ x: 3, y: 0 });
    expect(rotatePoint({ x: 3, y: 0 }, 90)).toEqual({ x: 0, y: 3 });
    expect(rotatePoint({ x: 3, y: 0 }, 180)).toEqual({ x: -3, y: 0 });
    expect(rotatePoint({ x: 3, y: 0 }, 270)).toEqual({ x: 0, y: -3 });
  });

  it("зеркало по X применяется до поворота", () => {
    expect(transformLocalPoint({ x: 4, y: 1 }, 0, true)).toEqual({ x: -4, y: 1 });
    // зеркало → (-4,1), затем поворот 90 → (-1,-4)
    expect(transformLocalPoint({ x: 4, y: 1 }, 90, true)).toEqual({ x: -1, y: -4 });
  });

  it("поворот на 360° (4×90) возвращает исходную точку", () => {
    let p = { x: 5, y: 2 };
    for (let i = 0; i < 4; i++) p = rotatePoint(p, 90);
    expect(p).toEqual({ x: 5, y: 2 });
  });
});

describe("symbolBounds", () => {
  it("охватывает графику и выводы", () => {
    expect(symbolBounds(sample)).toEqual({ x: -2, y: 0, w: 4, h: 10 });
  });
});

describe("автопозобозначение (ГОСТ 2.710)", () => {
  it("первое = код+1", () => {
    expect(nextDesignation([], "QF")).toBe("QF1");
  });
  it("следующее = max+1, по своему коду", () => {
    expect(nextDesignation(["QF1", "QF2", "KM1"], "QF")).toBe("QF3");
    expect(nextDesignation(["QF1", "QF2", "KM1"], "KM")).toBe("KM2");
  });
  it("учитывает только точные совпадения префикса", () => {
    expect(nextDesignation(["QF10", "QFX1"], "QF")).toBe("QF11");
  });
});

describe("валидация *.symbol.json", () => {
  it("корректный символ проходит", () => {
    const r = validateSymbol(sample);
    expect(r.ok).toBe(true);
  });
  it("все встроенные ГОСТ-символы валидны", () => {
    for (const s of GOST_SYMBOLS) {
      const r = validateSymbol(s);
      expect(r.ok, `${s.id}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
    }
  });
  it("ловит отсутствующие поля и плохой kind", () => {
    const r = validateSymbol({ id: "x", kind: "wrong", pins: [], graphics: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("name"))).toBe(true);
      expect(r.errors.some((e) => e.includes("kind"))).toBe(true);
    }
  });
  it("ловит битый графический примитив", () => {
    const bad = { ...sample, graphics: [{ type: "line", x1: 0 }] };
    const r = validateSymbol(bad);
    expect(r.ok).toBe(false);
  });
});

describe("дуга (arc, S28)", () => {
  const arcSym = {
    ...sample,
    pins: [{ name: "1", x: 0, y: 0 }],
    graphics: [{ type: "arc", cx: 0, cy: 0, r: 5, a0: 180, a1: 360 }],
  };

  it("валидируется; габарит — по описанной окружности", () => {
    expect(validateSymbol(arcSym).ok).toBe(true);
    expect(symbolBounds(arcSym as SymbolDef)).toEqual({ x: -5, y: -5, w: 10, h: 10 });
  });

  it("arcPath строит SVG-дугу (M … A r r …)", () => {
    const d = arcPath(0, 0, 5, 0, 180);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain(" A 5 5 ");
  });

  it("ловит дугу без углов a0/a1", () => {
    const r = validateSymbol({ ...sample, graphics: [{ type: "arc", cx: 0, cy: 0, r: 5 }] });
    expect(r.ok).toBe(false);
  });
});

describe("SymbolLibrary", () => {
  it("группирует по категориям", () => {
    const lib = new SymbolLibrary(GOST_SYMBOLS);
    expect(lib.all().length).toBe(GOST_SYMBOLS.length);
    expect(lib.get("gost.qf")?.componentCode).toBe("QF");
    const cats = lib.byCategory();
    // контакторы: катушка KM + контакты НО + НЗ + силовой (S: contact-main)
    expect(cats.get("Контакторы")?.length).toBe(4);
    expect(cats.get("Автоматические выключатели")?.length).toBe(1); // QF
  });
});

describe("команды инстансов (обратимость)", () => {
  const qf = GOST_SYMBOLS.find((s) => s.id === "gost.qf")!;

  it("постановка с авто-обозначением + undo/redo", () => {
    const page = createPage();
    const stack = new CommandStack();

    const c1 = new AddSymbolInstanceCommand(page, qf, 50, 50);
    stack.execute(c1);
    expect(page.instances).toHaveLength(1);
    expect(c1.instance.designation).toBe("QF1");

    stack.execute(new AddSymbolInstanceCommand(page, qf, 60, 50));
    expect(page.instances[1].designation).toBe("QF2");

    stack.undo();
    expect(page.instances).toHaveLength(1);
    stack.redo();
    expect(page.instances).toHaveLength(2);
    expect(page.instances[1].designation).toBe("QF2");
  });

  it("поворот / зеркало / удаление обратимы", () => {
    const page = createPage();
    const stack = new CommandStack();
    const c = new AddSymbolInstanceCommand(page, qf, 0, 0);
    stack.execute(c);
    const inst = c.instance;

    stack.execute(new RotateInstanceCommand(inst));
    expect(inst.rotation).toBe(90);
    stack.execute(new RotateInstanceCommand(inst));
    expect(inst.rotation).toBe(180);
    stack.undo();
    expect(inst.rotation).toBe(90);

    stack.execute(new MirrorInstanceCommand(inst));
    expect(inst.mirror).toBe(true);
    stack.undo();
    expect(inst.mirror).toBe(false);

    stack.execute(new RemoveInstanceCommand(page, inst));
    expect(page.instances).toHaveLength(0);
    stack.undo();
    expect(page.instances).toHaveLength(1);
    expect(page.instances[0]).toBe(inst);
  });

  it("перемещение обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const c = new AddSymbolInstanceCommand(page, qf, 10, 10);
    stack.execute(c);
    const inst = c.instance;

    stack.execute(new MoveInstanceCommand(inst, 10, 10, 40, 25));
    expect({ x: inst.x, y: inst.y }).toEqual({ x: 40, y: 25 });
    stack.undo();
    expect({ x: inst.x, y: inst.y }).toEqual({ x: 10, y: 10 });
    stack.redo();
    expect({ x: inst.x, y: inst.y }).toEqual({ x: 40, y: 25 });
  });

  it("редактирование (переименование) обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const c = new AddSymbolInstanceCommand(page, qf, 0, 0);
    stack.execute(c);
    const inst = c.instance;
    expect(inst.designation).toBe("QF1");

    stack.execute(new EditInstanceCommand(inst, { designation: "QF5", showLabels: false }));
    expect(inst.designation).toBe("QF5");
    expect(inst.showLabels).toBe(false);
    stack.undo();
    expect(inst.designation).toBe("QF1");
    expect(inst.showLabels).toBe(true);
  });

  it("характеристики и поля-подписи обратимы", () => {
    const page = createPage();
    const stack = new CommandStack();
    const c = new AddSymbolInstanceCommand(page, qf, 0, 0);
    stack.execute(c);
    const inst = c.instance;

    stack.execute(
      new EditInstanceCommand(inst, {
        attributes: { current: "10А", curve: "C" },
        labelFields: ["current", "curve"],
      }),
    );
    expect(inst.attributes).toEqual({ current: "10А", curve: "C" });
    expect(inst.labelFields).toEqual(["current", "curve"]);
    stack.undo();
    expect(inst.attributes).toBeUndefined();
    expect(inst.labelFields).toBeUndefined();
  });
});

describe("instanceLabels", () => {
  const base: SymbolInstance = {
    id: "i1",
    symbolId: "gost.qf",
    designation: "QF1",
    componentCode: "QF",
    x: 0,
    y: 0,
    rotation: 0,
    mirror: false,
    showLabels: true,
  };

  it("только сигла, если нет выбранных полей", () => {
    expect(instanceLabels(base)).toEqual([{ text: "QF1", primary: true }]);
  });

  it("стопка сигла + значения выбранных характеристик (по порядку)", () => {
    const inst: SymbolInstance = {
      ...base,
      attributes: { current: "10А", curve: "C" },
      labelFields: ["current", "curve"],
    };
    expect(instanceLabels(inst)).toEqual([
      { text: "QF1", primary: true },
      { text: "10А", primary: false },
      { text: "C", primary: false },
    ]);
  });

  it("пропускает поле без значения", () => {
    const inst: SymbolInstance = {
      ...base,
      attributes: { current: "10А" },
      labelFields: ["current", "curve"],
    };
    expect(instanceLabels(inst).map((l) => l.text)).toEqual(["QF1", "10А"]);
  });
});
