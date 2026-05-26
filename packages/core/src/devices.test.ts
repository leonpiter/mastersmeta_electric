import { describe, it, expect } from "vitest";
import { createProject, type Project, type SymbolInstance } from "./model";
import { SymbolLibrary, type SymbolDef } from "./symbol";
import { computeDevices, findDevice, findUnlinked } from "./devices";
import { newId } from "./ids";

const coil: SymbolDef = {
  id: "t.coil",
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
const noContact: SymbolDef = {
  id: "t.no",
  name: "Контакт НО",
  category: "c",
  componentCode: "KM",
  kind: "contact-no",
  pins: [
    { name: "13", x: 0, y: 0 },
    { name: "14", x: 0, y: 15 },
  ],
  graphics: [],
};
const button: SymbolDef = {
  id: "t.sb",
  name: "Кнопка",
  category: "c",
  componentCode: "SB",
  kind: "contact-no",
  pins: [
    { name: "3", x: 0, y: 0 },
    { name: "4", x: 0, y: 15 },
  ],
  graphics: [],
};
const lib = new SymbolLibrary([coil, noContact, button]);

function inst(sym: SymbolDef, designation: string, x = 100, y = 100): SymbolInstance {
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

/** Проект с двумя листами; контент задаётся напрямую. */
function project2(): Project {
  const p = createProject();
  p.pages.push({ ...p.pages[0], id: newId(), instances: [], wires: [], nodes: [] });
  return p;
}

describe("устройства (master/slave, кросс-референсы)", () => {
  it("катушка и контакт с общей сиглой — одно устройство", () => {
    const p = project2();
    p.pages[0].instances.push(inst(coil, "KM1"));
    p.pages[1].instances.push(inst(noContact, "KM1"));

    const devices = computeDevices(p, lib);
    expect(devices).toHaveLength(1);
    const km1 = devices[0];
    expect(km1.designation).toBe("KM1");
    expect(km1.master?.kind).toBe("coil");
    expect(km1.contacts).toHaveLength(1);
    expect(km1.contacts[0].kind).toBe("contact-no");
    expect(km1.contacts[0].pins).toEqual(["13", "14"]);
  });

  it("адрес содержит номер листа и зону (лист.зона)", () => {
    const p = project2();
    p.pages[0].instances.push(inst(coil, "KM1"));
    p.pages[1].instances.push(inst(noContact, "KM1"));

    const km1 = computeDevices(p, lib)[0];
    expect(km1.master?.address).toMatch(/^1\.\d+[A-Z]$/); // лист 1
    expect(km1.contacts[0].address).toMatch(/^2\.\d+[A-Z]$/); // лист 2
  });

  it("разные сиглы → разные устройства", () => {
    const p = project2();
    p.pages[0].instances.push(inst(coil, "KM1"), inst(coil, "KM2"));
    expect(computeDevices(p, lib)).toHaveLength(2);
  });

  it("findUnlinked: катушка без контактов и контакт-сирота помечаются", () => {
    const p = project2();
    p.pages[0].instances.push(inst(coil, "KM1")); // катушка без контактов
    p.pages[0].instances.push(inst(noContact, "KM5")); // контакт без катушки KM5

    const r = findUnlinked(p, lib);
    expect(r.coilsWithoutContacts.map((d) => d.designation)).toEqual(["KM1"]);
    expect(r.orphanContacts.map((d) => d.designation)).toEqual(["KM5"]);
  });

  it("кнопка (свой код, без катушки в библиотеке) не считается сиротой", () => {
    const p = project2();
    p.pages[0].instances.push(inst(button, "SB1"));
    const r = findUnlinked(p, lib);
    expect(r.orphanContacts).toHaveLength(0);
  });

  it("findDevice находит устройство по сигле", () => {
    const p = project2();
    p.pages[0].instances.push(inst(coil, "KM1"));
    const devices = computeDevices(p, lib);
    expect(findDevice(devices, "KM1")?.designation).toBe("KM1");
    expect(findDevice(devices, "KM9")).toBeUndefined();
  });
});
