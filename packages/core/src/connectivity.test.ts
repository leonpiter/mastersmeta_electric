import { describe, it, expect } from "vitest";
import { createPage } from "./model";
import { CommandStack } from "./command";
import {
  AddWireCommand,
  RemoveWireCommand,
  EditWireCommand,
  AddSymbolInstanceCommand,
} from "./commands";
import { SymbolLibrary } from "./symbol";
import { GOST_SYMBOLS } from "./symbols-gost";
import { computeNets, danglingPins, computeJunctions } from "./connectivity";

const lib = new SymbolLibrary(GOST_SYMBOLS);
const qf = GOST_SYMBOLS.find((s) => s.id === "gost.qf")!;

describe("движок связности (union-find)", () => {
  it("два провода с общим концом — одна цепь", () => {
    const page = createPage();
    const stack = new CommandStack();
    stack.execute(
      new AddWireCommand(page, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    );
    stack.execute(
      new AddWireCommand(page, [
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    );
    const nets = computeNets(page, lib);
    expect(nets).toHaveLength(1);
    expect(nets[0].wireIds).toHaveLength(2);
  });

  it("два раздельных провода — две цепи", () => {
    const page = createPage();
    const stack = new CommandStack();
    stack.execute(
      new AddWireCommand(page, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    );
    stack.execute(
      new AddWireCommand(page, [
        { x: 50, y: 0 },
        { x: 60, y: 0 },
      ]),
    );
    expect(computeNets(page, lib)).toHaveLength(2);
  });

  it("вывод символа на конце провода подключается к цепи", () => {
    const page = createPage();
    const stack = new CommandStack();
    // QF: вывод «1» в (50,50), вывод «2» в (50,65)
    stack.execute(new AddSymbolInstanceCommand(page, qf, 50, 50));
    stack.execute(
      new AddWireCommand(page, [
        { x: 50, y: 65 },
        { x: 80, y: 65 },
      ]),
    );

    const nets = computeNets(page, lib);
    const wired = nets.find((n) => n.wireIds.length === 1)!;
    expect(wired.pins.map((p) => p.pinName)).toContain("2");

    const dangling = danglingPins(page, lib);
    expect(dangling).toHaveLength(1);
    expect(dangling[0].pinName).toBe("1");
  });

  it("AddWire / RemoveWire обратимы", () => {
    const page = createPage();
    const stack = new CommandStack();
    const add = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    stack.execute(add);
    expect(page.wires).toHaveLength(1);

    stack.undo();
    expect(page.wires).toHaveLength(0);
    stack.redo();
    expect(page.wires).toHaveLength(1);

    stack.execute(new RemoveWireCommand(page, add.created));
    expect(page.wires).toHaveLength(0);
    stack.undo();
    expect(page.wires).toHaveLength(1);
  });

  it("узел появляется на Т-ответвлении, но не на простом угле/пересечении", () => {
    // Т: горизонтальный провод + ответвление от его середины
    const t = createPage();
    new AddWireCommand(t, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]).do();
    new AddWireCommand(t, [
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]).do();
    const j = computeJunctions(t);
    expect(j).toHaveLength(1);
    expect(j[0]).toEqual({ x: 5, y: 0 });

    // угол (два провода встык одним концом) — не узел
    const corner = createPage();
    new AddWireCommand(corner, [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]).do();
    new AddWireCommand(corner, [
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]).do();
    expect(computeJunctions(corner)).toHaveLength(0);
  });

  it("EditWire (тип/сечение/цвет) обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const add = new AddWireCommand(page, [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    stack.execute(add);
    const w = add.created;
    expect(w.type).toBe("power");

    stack.execute(new EditWireCommand(w, { type: "control", section: "1.5", color: "#ff0000" }));
    expect(w).toMatchObject({ type: "control", section: "1.5", color: "#ff0000" });
    stack.undo();
    expect(w.type).toBe("power");
    expect(w.section).toBeUndefined();
    expect(w.color).toBeUndefined();
  });
});
