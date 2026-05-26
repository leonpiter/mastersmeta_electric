import { describe, it, expect } from "vitest";
import { createPage } from "./model";
import { SymbolLibrary, type SymbolDef } from "./symbol";
import { CommandStack } from "./command";
import { AddSymbolInstanceCommand } from "./commands";
import { captureBlock, validateBlock, InsertBlockCommand } from "./blocks";

const qf: SymbolDef = {
  id: "t.qf",
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
const xt: SymbolDef = {
  id: "t.xt",
  name: "Клемма",
  category: "c",
  componentCode: "XT",
  kind: "terminal",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [],
};
const lib = new SymbolLibrary([qf, xt]);

describe("составные блоки (макрос-группа)", () => {
  it("captureBlock: относительные размещения от левого-верхнего угла", () => {
    const page = createPage();
    const stack = new CommandStack();
    const a = new AddSymbolInstanceCommand(page, qf, 30, 40);
    const b = new AddSymbolInstanceCommand(page, xt, 30, 60);
    stack.execute(a);
    stack.execute(b);

    const block = captureBlock("Ввод", page, [a.instance.id, b.instance.id]);
    expect(block.name).toBe("Ввод");
    expect(block.members).toHaveLength(2);
    expect(block.members[0]).toMatchObject({ symbolId: "t.qf", dx: 0, dy: 0 });
    expect(block.members[1]).toMatchObject({ symbolId: "t.xt", dx: 0, dy: 20 });
    expect(validateBlock(block).ok).toBe(true);
  });

  it("InsertBlockCommand: раскрытие со сдвигом + последовательная нумерация; обратимо", () => {
    const src = createPage();
    const s = new CommandStack();
    const a = new AddSymbolInstanceCommand(src, qf, 0, 0);
    const b = new AddSymbolInstanceCommand(src, qf, 0, 20); // два автомата в блоке
    s.execute(a);
    s.execute(b);
    const block = captureBlock("2×QF", src, [a.instance.id, b.instance.id]);

    const page = createPage();
    const stack = new CommandStack();
    const cmd = new InsertBlockCommand(page, block, lib, 100, 100);
    stack.execute(cmd);
    expect(page.instances).toHaveLength(2);
    // разные сиглы (последовательная нумерация), сдвиг сохранён
    expect(page.instances.map((i) => i.designation)).toEqual(["QF1", "QF2"]);
    expect({ x: page.instances[0].x, y: page.instances[0].y }).toEqual({ x: 100, y: 100 });
    expect({ x: page.instances[1].x, y: page.instances[1].y }).toEqual({ x: 100, y: 120 });

    // повторная вставка продолжает нумерацию
    stack.execute(new InsertBlockCommand(page, block, lib, 200, 100));
    expect(page.instances.map((i) => i.designation)).toEqual(["QF1", "QF2", "QF3", "QF4"]);

    stack.undo();
    expect(page.instances).toHaveLength(2);
    stack.undo();
    expect(page.instances).toHaveLength(0);
  });

  it("validateBlock ловит пустые members и битый member", () => {
    expect(validateBlock({ id: "b", name: "x", members: [] }).ok).toBe(false);
    expect(validateBlock({ id: "b", name: "x", members: [{ dx: 0 }] }).ok).toBe(false);
  });
});
