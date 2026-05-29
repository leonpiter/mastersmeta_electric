import { describe, it, expect } from "vitest";
import { createPage } from "./model";
import { CommandStack } from "./command";
import {
  AddWireCommand,
  AutoNumberCommand,
  AutoNumberProjectCommand,
  AddSymbolInstanceCommand,
  SetWireNumberCommand,
  ClearNumbersCommand,
} from "./commands";
import { SymbolLibrary } from "./symbol";
import { GOST_SYMBOLS } from "./symbols-gost";

const lib = new SymbolLibrary(GOST_SYMBOLS);

describe("автонумерация цепей (ГОСТ 2.709)", () => {
  it("раздельные цепи получают разные номера", () => {
    const page = createPage();
    const a = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    a.do();
    const c = new AddWireCommand(page, [
      { x: 50, y: 0 },
      { x: 60, y: 0 },
    ]);
    c.do();

    new AutoNumberCommand(page, lib).do();
    expect([a.created.number, c.created.number].sort()).toEqual(["1", "2"]);
  });

  it("ручной/заблокированный номер становится номером всей цепи", () => {
    const page = createPage();
    const stack = new CommandStack();
    const a = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    a.do();
    const b = new AddWireCommand(page, [
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]); // общий конец (10,0) → одна цепь
    b.do();

    stack.execute(new SetWireNumberCommand(a.created, "L1", true));
    stack.execute(new AutoNumberCommand(page, lib));
    expect(a.created.number).toBe("L1");
    expect(b.created.number).toBe("L1"); // унаследовал номер цепи
  });

  it("опции: режим unique + start/step", () => {
    const page = createPage();
    const a = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    a.do();
    const b = new AddWireCommand(page, [
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]); // одна цепь с a
    b.do();

    // unique: каждый провод свой номер, старт 10 шаг 5
    new AutoNumberCommand(page, lib, { mode: "unique", start: 10, step: 5 }).do();
    expect([a.created.number, b.created.number].sort()).toEqual(["10", "15"]);
  });

  it("ClearNumbers очищает и обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const a = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    a.do();
    stack.execute(new AutoNumberCommand(page, lib));
    expect(a.created.number).toBe("1");
    stack.execute(new ClearNumbersCommand(page));
    expect(a.created.number).toBeUndefined();
    stack.undo();
    expect(a.created.number).toBe("1");
  });

  it("сквозная нумерация: один номер на цепь через листы (соединители, S29)", () => {
    const conn = GOST_SYMBOLS.find((s) => s.id === "gost.page-connector")!;
    // лист 1: провод (0,0)→(20,0) + соединитель L1 в (20,0)
    const p1 = createPage();
    const w1 = new AddWireCommand(p1, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    w1.do();
    const c1 = new AddSymbolInstanceCommand(p1, conn, 20, 0);
    c1.do();
    c1.instance.signal = "L1";
    // лист 2: соединитель L1 в (0,0) + провод (0,0)→(20,0)
    const p2 = createPage();
    const c2 = new AddSymbolInstanceCommand(p2, conn, 0, 0);
    c2.do();
    c2.instance.signal = "L1";
    const w2 = new AddWireCommand(p2, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    w2.do();

    const cmd = new AutoNumberProjectCommand([p1, p2], lib);
    cmd.do();
    expect(w1.created.number).toBe("L1"); // провод наследует метку соединителя
    expect(w1.created.number).toBe(w2.created.number); // один номер через листы
    cmd.undo();
    expect(w1.created.number).toBeUndefined();
    expect(w2.created.number).toBeUndefined();
  });

  it("сквозная нумерация: без общей метки — разные номера", () => {
    const conn = GOST_SYMBOLS.find((s) => s.id === "gost.page-connector")!;
    const p1 = createPage();
    const w1 = new AddWireCommand(p1, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    w1.do();
    const c1 = new AddSymbolInstanceCommand(p1, conn, 20, 0);
    c1.do();
    c1.instance.signal = "L1";
    const p2 = createPage();
    const c2 = new AddSymbolInstanceCommand(p2, conn, 0, 0);
    c2.do();
    c2.instance.signal = "L2"; // другая метка
    const w2 = new AddWireCommand(p2, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    w2.do();

    new AutoNumberProjectCommand([p1, p2], lib).do();
    expect(w1.created.number).not.toBe(w2.created.number);
  });

  it("на одном листе провод наследует метку соединителя (S29)", () => {
    const conn = GOST_SYMBOLS.find((s) => s.id === "gost.page-connector")!;
    const page = createPage();
    const w = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    w.do();
    const c = new AddSymbolInstanceCommand(page, conn, 20, 0);
    c.do();
    c.instance.signal = "PE";
    new AutoNumberCommand(page, lib).do();
    expect(w.created.number).toBe("PE");
  });

  it("SetWireNumber (потенциал/lock) обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const w = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    w.do();

    stack.execute(new SetWireNumberCommand(w.created, "PE", true));
    expect(w.created.number).toBe("PE");
    expect(w.created.locked).toBe(true);
    stack.undo();
    expect(w.created.number).toBeUndefined();
    expect(w.created.locked).toBeUndefined();
  });
});
