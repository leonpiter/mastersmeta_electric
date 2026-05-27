import { describe, it, expect } from "vitest";
import { createPage } from "./model";
import { AddWireCommand, AddSymbolInstanceCommand, EditWireCommand } from "./commands";
import { SymbolLibrary, type SymbolDef } from "./symbol";
import { GOST_SYMBOLS } from "./symbols-gost";
import { connectorPartners, circuitNumberAt, partnersText } from "./crossref";

const conn: SymbolDef = {
  id: "test.pageconn",
  name: "Соединитель страниц",
  category: "Соединители",
  componentCode: "X",
  kind: "page-connector",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [{ type: "line", x1: 0, y1: 0, x2: 5, y2: 0 }],
};
const lib = new SymbolLibrary([...GOST_SYMBOLS, conn]);

/** Лист с соединителем `signal` в точке (x,y) и номером листа `sheet`. */
function sheet(signal: string, x: number, y: number, sheetNo: number) {
  const page = createPage();
  page.titleBlock.sheet = sheetNo;
  const c = new AddSymbolInstanceCommand(page, conn, x, y);
  c.do();
  c.instance.signal = signal;
  return { page, id: c.instance.id };
}

describe("адресация соединителей страниц (S29)", () => {
  it("партнёры по метке — с адресами «лист·зона», self исключается", () => {
    const a = sheet("L1", 60, 60, 1);
    const b = sheet("L1", 200, 120, 2);
    const pages = [a.page, b.page];

    const all = connectorPartners(pages, lib, "L1");
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.sheet).sort()).toEqual([1, 2]);
    expect(all.every((r) => /^\d+·\d+[A-Z]$/.test(r.address))).toBe(true);

    const partnersOfA = connectorPartners(pages, lib, "L1", a.id);
    expect(partnersOfA).toHaveLength(1);
    expect(partnersOfA[0].sheet).toBe(2);
  });

  it("другая метка / пустая метка — без партнёров", () => {
    const a = sheet("L1", 60, 60, 1);
    expect(connectorPartners([a.page], lib, "L2")).toHaveLength(0);
    expect(connectorPartners([a.page], lib, "")).toHaveLength(0);
  });

  it("partnersText склеивает адреса", () => {
    const a = sheet("L1", 60, 60, 1);
    const b = sheet("L1", 200, 120, 2);
    expect(partnersText(connectorPartners([a.page, b.page], lib, "L1"))).toContain("·");
  });

  it("circuitNumberAt отдаёт номер цепи в точке (для авто-метки)", () => {
    const page = createPage();
    const w = new AddWireCommand(page, [
      { x: 20, y: 20 },
      { x: 60, y: 20 },
    ]);
    w.do();
    new EditWireCommand(w.created, { number: "L1" }).do();
    expect(circuitNumberAt(page, lib, 60, 20)).toBe("L1");
    expect(circuitNumberAt(page, lib, 999, 999)).toBeUndefined();
  });
});
