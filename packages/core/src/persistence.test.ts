import { describe, it, expect } from "vitest";
import { createProject } from "./model";
import { AddPageCommand, AddWireCommand, AddSymbolInstanceCommand } from "./commands";
import { GOST_SYMBOLS } from "./symbols-gost";
import { serializeProject, deserializeProject, PROJECT_SCHEMA_VERSION } from "./persistence";

const qf = GOST_SYMBOLS.find((s) => s.id === "gost.qf")!;

describe("сериализация проекта (.seeproj)", () => {
  it("round-trip сохраняет листы, символы, провода и настройки", () => {
    const proj = createProject();
    proj.name = "Щит ЩР1";
    proj.wireWidthPower = 0.35;
    new AddPageCommand(proj).do();
    const page = proj.pages[0]!;
    new AddSymbolInstanceCommand(page, qf, 50, 50).do();
    new AddWireCommand(page, [
      { x: 50, y: 65 },
      { x: 80, y: 65 },
    ]).do();

    const restored = deserializeProject(serializeProject(proj));
    expect(restored.name).toBe("Щит ЩР1");
    expect(restored.wireWidthPower).toBe(0.35);
    expect(restored.pages).toHaveLength(2);
    expect(restored.activePageId).toBe(proj.activePageId);
    expect(restored.pages[0]!.instances).toHaveLength(1);
    expect(restored.pages[0]!.wires).toHaveLength(1);
    expect(restored.pages[0]!.instances[0]!.designation).toBe("QF1");
  });

  it("отклоняет файл с более новой схемой", () => {
    const text = JSON.stringify({ schemaVersion: PROJECT_SCHEMA_VERSION + 1, project: {} });
    expect(() => deserializeProject(text)).toThrow();
  });

  it("отклоняет мусор", () => {
    expect(() => deserializeProject("не json")).toThrow();
    expect(() => deserializeProject(JSON.stringify({ schemaVersion: 1 }))).toThrow();
  });
});
