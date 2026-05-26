import { describe, it, expect } from "vitest";
import { createPage } from "./model";
import { CommandStack } from "./command";
import { AddWireCommand, AutoNumberCommand, SetWireNumberCommand } from "./commands";
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
