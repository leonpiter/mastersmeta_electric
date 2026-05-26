import "./style.css";
import {
  createProject,
  activePage,
  CommandStack,
  SymbolLibrary,
  GOST_SYMBOLS,
  EditInstanceCommand,
  EditWireCommand,
  AddPageCommand,
  RemovePageCommand,
  serializeProject,
  deserializeProject,
  computeDevices,
  findUnlinked,
  computeBom,
  bomToCsv,
  computeConnections,
  connectionsToCsv,
  Catalog,
  BUILTIN_PARTS,
  partLabel,
  type SymbolInstance,
  type Wire,
  type Project,
} from "@see/core";
import { CanvasView } from "./canvas";
import { LibraryPanel } from "./library-panel";
import { ProjectPanel } from "./project-panel";

const svg = document.getElementById("canvas") as unknown as SVGSVGElement;
const hud = document.getElementById("hud-info")!;
const libraryEl = document.getElementById("library")!;
const projectEl = document.getElementById("project")!;

const project = createProject(); // 1 лист A3
const stack = new CommandStack();
const library = new SymbolLibrary(GOST_SYMBOLS);
const catalog = new Catalog(BUILTIN_PARTS);

let panel: LibraryPanel | undefined;
const view = new CanvasView(svg, activePage(project), stack, hud, library, {
  onArmedChange: (id) => panel?.setActive(id),
  onRequestEdit: (inst) => openProps(inst),
  onRequestEditWire: (wire) => openWireSettings(wire),
  onWireModeChange: (active, poles) => {
    wireBtn.classList.toggle("on", active && poles === 1);
    wire3Btn.classList.toggle("on", active && poles === 3);
  },
  getDevices: () => computeDevices(project, library),
  onDrawToolChange: (tool) => {
    for (const [t, b] of Object.entries(drawButtons)) b.classList.toggle("on", t === tool);
  },
  onAnnotationStyle: (style) => {
    if (!style) return;
    annoDash.value = style.dash;
    annoWidth.value = String(style.width);
    annoColor.value = style.color;
  },
  onRequestText: (commit) => {
    textCommit = commit;
    tdInput.value = "";
    textDialog.showModal();
    tdInput.focus();
  },
});
panel = new LibraryPanel(libraryEl, library, (sym) => view.arm(sym));

const projectPanel = new ProjectPanel(projectEl, project, {
  onSelect: (id) => {
    if (id !== project.activePageId) {
      project.activePageId = id;
      view.setPage(activePage(project));
      projectPanel.refresh();
    }
  },
  onAdd: () => stack.execute(new AddPageCommand(project)),
  onRemove: (id) => stack.execute(new RemovePageCommand(project, id)),
  onSettings: (focusName) => openProjectSettings(focusName),
});

// синхронизация дерева и вида при изменениях стека (в т.ч. add/remove листа)
stack.subscribe(() => {
  projectPanel.refresh();
  if (view.currentPageId !== project.activePageId) view.setPage(activePage(project));
});

view.setWireWidths(project.wireWidthPower, project.wireWidthControl);

// ----- настройки проекта (ПКМ на корне → модальное окно) -----
const psDialog = document.getElementById("project-settings") as HTMLDialogElement;
const psName = document.getElementById("ps-name") as HTMLInputElement;
const psInfo = document.getElementById("ps-info")!;
const psWPower = document.getElementById("ps-wpower") as HTMLSelectElement;
const psWControl = document.getElementById("ps-wcontrol") as HTMLSelectElement;

function openProjectSettings(focusName: boolean): void {
  psName.value = project.name;
  psWPower.value = String(project.wireWidthPower);
  psWControl.value = String(project.wireWidthControl);
  psInfo.textContent = `Листов: ${project.pages.length}`;
  psDialog.showModal();
  if (focusName) {
    psName.focus();
    psName.select();
  }
}

psDialog.addEventListener("close", () => {
  if (psDialog.returnValue === "ok") {
    const name = psName.value.trim();
    if (name) project.name = name;
    project.wireWidthPower = Number(psWPower.value);
    project.wireWidthControl = Number(psWControl.value);
    view.setWireWidths(project.wireWidthPower, project.wireWidthControl);
    projectPanel.refresh();
  }
});

// ----- свойства провода (двойной клик по проводу) -----
const wsDialog = document.getElementById("wire-settings") as HTMLDialogElement;
const wsType = document.getElementById("ws-type") as HTMLSelectElement;
const wsSection = document.getElementById("ws-section") as HTMLSelectElement;
const wsColor = document.getElementById("ws-color") as HTMLInputElement;
const wsNumber = document.getElementById("ws-number") as HTMLInputElement;
const wsLocked = document.getElementById("ws-locked") as HTMLInputElement;
const wsPresets = document.getElementById("ws-presets")!;
let editingWire: Wire | null = null;
let wireOrig: {
  type: Wire["type"];
  section?: string;
  color?: string;
  number?: string;
  locked?: boolean;
} | null = null;

function openWireSettings(wire: Wire): void {
  editingWire = wire;
  wireOrig = {
    type: wire.type,
    section: wire.section,
    color: wire.color,
    number: wire.number,
    locked: wire.locked,
  };
  wsType.value = wire.type;
  wsSection.value = wire.section ?? "";
  wsColor.value = wire.color ?? "#1a1a1a";
  wsNumber.value = wire.number ?? "";
  wsLocked.checked = !!wire.locked;
  wsDialog.showModal();
}

// пресет потенциала (L1/L2/L3/N/PE): задаёт номер и фиксирует от автонумерации
wsPresets.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pot]");
  if (!btn) return;
  wsNumber.value = btn.dataset.pot ?? "";
  wsLocked.checked = true;
});

// живое превью цвета на канвасе
wsColor.addEventListener("input", () => {
  if (editingWire) {
    editingWire.color = wsColor.value;
    view.rerenderWires();
  }
});

wsDialog.addEventListener("close", () => {
  const wire = editingWire;
  const orig = wireOrig;
  editingWire = null;
  wireOrig = null;
  if (!wire || !orig) return;
  // вернуть исходные значения (чтобы команда корректно записала «до»)
  wire.type = orig.type;
  wire.section = orig.section;
  wire.color = orig.color;
  wire.number = orig.number;
  wire.locked = orig.locked;
  if (wsDialog.returnValue === "ok") {
    stack.execute(
      new EditWireCommand(wire, {
        type: wsType.value as Wire["type"],
        section: wsSection.value || undefined,
        color: wsColor.value,
        number: wsNumber.value.trim() || undefined,
        locked: wsLocked.checked,
      }),
    );
  } else {
    view.rerenderWires(); // откатить превью
  }
});

// обмен боковых панелей местами (с запоминанием)
const SWAP_KEY = "see.swapped";
const swapBtn = document.getElementById("swap") as HTMLButtonElement;
if (localStorage.getItem(SWAP_KEY) === "1") document.body.classList.add("swapped");
swapBtn.addEventListener("click", () => {
  const on = document.body.classList.toggle("swapped");
  try {
    localStorage.setItem(SWAP_KEY, on ? "1" : "0");
  } catch {
    /* недоступно — игнор */
  }
});

// ----- ресайз боковых доков (перетаскивание границы) -----
const MIN_W = 150;
const MAX_W = 460;
const rootStyle = document.documentElement.style;

function restoreWidth(side: "left" | "right"): void {
  const v = localStorage.getItem(side === "left" ? "see.leftW" : "see.rightW");
  if (v) rootStyle.setProperty(side === "left" ? "--left-w" : "--right-w", v);
}
restoreWidth("left");
restoreWidth("right");

function setupSplitter(el: HTMLElement, side: "left" | "right"): void {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");

    const onMove = (ev: PointerEvent): void => {
      const raw = side === "left" ? ev.clientX : window.innerWidth - ev.clientX;
      const w = Math.max(MIN_W, Math.min(MAX_W, raw));
      rootStyle.setProperty(side === "left" ? "--left-w" : "--right-w", `${w}px`);
    };
    const onUp = (): void => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      document.body.classList.remove("resizing");
      const prop = side === "left" ? "--left-w" : "--right-w";
      const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
      try {
        localStorage.setItem(side === "left" ? "see.leftW" : "see.rightW", v);
      } catch {
        /* недоступно — игнор */
      }
      window.dispatchEvent(new Event("resize")); // канвас пересчитает вид
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  });
}

setupSplitter(document.getElementById("split-left")!, "left");
setupSplitter(document.getElementById("split-right")!, "right");

// ----- диалог свойств элемента (двойной клик) -----
const dialog = document.getElementById("props") as HTMLDialogElement;
const desigInput = document.getElementById("prop-desig") as HTMLInputElement;
const typeEl = document.getElementById("prop-type")!;
const showLabelsInput = document.getElementById("prop-showlabels") as HTMLInputElement;
const partSelect = document.getElementById("prop-part") as HTMLSelectElement;
const makerSelect = document.getElementById("prop-maker") as HTMLSelectElement;
let editing: SymbolInstance | null = null;
let editingCode = ""; // ГОСТ-код редактируемого инстанса (для перефильтра по марке)

function opt(value: string, text: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}

/** Наполнить список производителей по ГОСТ-коду; current — текущая марка. */
function fillMakers(componentCode: string, current: string): void {
  makerSelect.replaceChildren(opt("", "— любой —"));
  for (const m of catalog.manufacturers(componentCode)) makerSelect.append(opt(m, m));
  makerSelect.value = current;
}

/**
 * Наполнить список изделий по ГОСТ-коду и марке (пустая марка = все производители).
 * current — текущая привязка (сохраняется, даже если из другой группы).
 */
function fillParts(componentCode: string, maker: string, current?: string): void {
  partSelect.replaceChildren(opt("", "— без привязки —"));
  const applicable = maker
    ? catalog.byCodeAndManufacturer(componentCode, maker)
    : catalog.byComponentCode(componentCode);
  for (const p of applicable) partSelect.append(opt(p.code, `${p.code} · ${partLabel(p)}`));
  // текущий код вне выборки — добавить, чтобы не потерять привязку
  if (current && !applicable.some((p) => p.code === current)) {
    const part = catalog.get(current);
    partSelect.append(opt(current, part ? `${current} · ${partLabel(part)}` : current));
  }
  partSelect.value = current ?? "";
}

// смена производителя — перефильтровать изделия (сбросить выбор на «без привязки»)
makerSelect.addEventListener("change", () => fillParts(editingCode, makerSelect.value));

function openProps(inst: SymbolInstance): void {
  editing = inst;
  editingCode = inst.componentCode;
  desigInput.value = inst.designation;
  showLabelsInput.checked = inst.showLabels;
  const sym = library.get(inst.symbolId);
  typeEl.textContent = sym ? `${sym.name} · ${sym.componentCode}` : inst.symbolId;
  const currentMaker = inst.catalogCode ? (catalog.get(inst.catalogCode)?.manufacturer ?? "") : "";
  fillMakers(inst.componentCode, currentMaker);
  fillParts(inst.componentCode, currentMaker, inst.catalogCode);
  dialog.showModal();
  desigInput.focus();
  desigInput.select();
}

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "ok" && editing) {
    const designation = desigInput.value.trim() || editing.designation;
    const showLabels = showLabelsInput.checked;
    const catalogCode = partSelect.value || undefined;
    if (
      designation !== editing.designation ||
      showLabels !== editing.showLabels ||
      catalogCode !== editing.catalogCode
    ) {
      stack.execute(new EditInstanceCommand(editing, { designation, showLabels, catalogCode }));
    }
  }
  editing = null;
});

const undoBtn = document.getElementById("undo") as HTMLButtonElement;
const redoBtn = document.getElementById("redo") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const pdfBtn = document.getElementById("pdf") as HTMLButtonElement;
const rotateBtn = document.getElementById("rotate") as HTMLButtonElement;
const mirrorBtn = document.getElementById("mirror") as HTMLButtonElement;
const deleteBtn = document.getElementById("delete") as HTMLButtonElement;

// ----- меню «Файл» (классическое выпадающее) -----
const fileMenu = document.getElementById("file-menu")!;
const closeFileMenu = (): void => {
  fileMenu.hidden = true;
};
fileMenu.addEventListener("click", (e) => e.stopPropagation());

// ----- сохранение/открытие проекта (.esch) -----
function applyProject(loaded: Project): void {
  project.id = loaded.id;
  project.name = loaded.name;
  project.pages = loaded.pages;
  project.activePageId = loaded.activePageId;
  project.wireWidthPower = loaded.wireWidthPower;
  project.wireWidthControl = loaded.wireWidthControl;
  stack.clear();
  view.setWireWidths(project.wireWidthPower, project.wireWidthControl);
  view.setPage(activePage(project));
  projectPanel.refresh();
}

function saveProject(): void {
  const blob = new Blob([serializeProject(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name || "project"}.esch`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".esch,application/json";
fileInput.style.display = "none";
document.body.append(fileInput);
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  fileInput.value = "";
  if (!f) return;
  void f.text().then((text) => {
    try {
      applyProject(deserializeProject(text));
    } catch (e) {
      window.alert("Не удалось открыть файл: " + (e instanceof Error ? e.message : String(e)));
    }
  });
});

const saveHandler = (): void => {
  saveProject();
  closeFileMenu();
};
(document.getElementById("file-new") as HTMLButtonElement).addEventListener("click", () => {
  applyProject(createProject());
  closeFileMenu();
});
(document.getElementById("file-open") as HTMLButtonElement).addEventListener("click", () => {
  fileInput.click();
  closeFileMenu();
});
(document.getElementById("file-save") as HTMLButtonElement).addEventListener("click", saveHandler);
(document.getElementById("file-saveas") as HTMLButtonElement).addEventListener(
  "click",
  saveHandler,
);

undoBtn.addEventListener("click", () => stack.undo());
redoBtn.addEventListener("click", () => stack.redo());
resetBtn.addEventListener("click", () => view.resetView());
pdfBtn.addEventListener("click", () => {
  view.exportPdf();
  closeFileMenu();
});
rotateBtn.addEventListener("click", () => view.rotateSelectedOrPending());
mirrorBtn.addEventListener("click", () => view.mirrorSelectedOrPending());
deleteBtn.addEventListener("click", () => view.deleteSelected());

const wireBtn = document.getElementById("wire-1") as HTMLButtonElement;
const wire3Btn = document.getElementById("wire-3") as HTMLButtonElement;
wireBtn.addEventListener("click", () => view.armWire(1));
wire3Btn.addEventListener("click", () => view.armWire(3));

// ----- инструменты оформления (вкладка «Оформление», S25) -----
const drawButtons: Record<string, HTMLButtonElement> = {
  line: document.getElementById("draw-line") as HTMLButtonElement,
  rect: document.getElementById("draw-rect") as HTMLButtonElement,
  ellipse: document.getElementById("draw-ellipse") as HTMLButtonElement,
  arrow: document.getElementById("draw-arrow") as HTMLButtonElement,
  text: document.getElementById("draw-text") as HTMLButtonElement,
};
const annoDash = document.getElementById("anno-dash") as HTMLSelectElement;
const annoWidth = document.getElementById("anno-width") as HTMLSelectElement;
const annoColor = document.getElementById("anno-color") as HTMLInputElement;

for (const [tool, btn] of Object.entries(drawButtons)) {
  btn.addEventListener("click", () =>
    view.armDraw(tool as "line" | "rect" | "ellipse" | "arrow" | "text"),
  );
}
annoDash.addEventListener("change", () =>
  view.setAnnoStyle({ dash: annoDash.value as "solid" | "dashed" | "dotted" }),
);
annoWidth.addEventListener("change", () => view.setAnnoStyle({ width: Number(annoWidth.value) }));
annoColor.addEventListener("input", () => view.setAnnoStyle({ color: annoColor.value }));

// модалка ввода текста аннотации (вместо браузерного prompt)
const textDialog = document.getElementById("text-dialog") as HTMLDialogElement;
const tdInput = document.getElementById("td-input") as HTMLInputElement;
let textCommit: ((text: string) => void) | null = null;
textDialog.addEventListener("close", () => {
  const commit = textCommit;
  textCommit = null;
  if (textDialog.returnValue === "ok" && commit) commit(tdInput.value);
});

// ----- меню «Нумерация» (вкладка Соединения) -----
const numberingBtn = document.getElementById("numbering") as HTMLButtonElement;
const numberMenu = document.getElementById("number-menu")!;
const nsDialog = document.getElementById("number-settings") as HTMLDialogElement;
const nsMode = document.getElementById("ns-mode") as HTMLSelectElement;
const nsStart = document.getElementById("ns-start") as HTMLInputElement;
const nsStep = document.getElementById("ns-step") as HTMLInputElement;
const nsRelock = document.getElementById("ns-relock") as HTMLInputElement;
const numClearSel = document.getElementById("num-clear-sel") as HTMLButtonElement;

const closeNumberMenu = (): void => {
  numberMenu.hidden = true;
};

numberingBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeFileMenu();
  closeGridMenu();
  if (numberMenu.hidden) {
    numClearSel.disabled = !view.hasSelectedWire;
    const r = numberingBtn.getBoundingClientRect();
    numberMenu.style.left = `${r.left}px`;
    numberMenu.style.top = `${r.bottom + 2}px`;
    numberMenu.hidden = false;
  } else {
    closeNumberMenu();
  }
});
numberMenu.addEventListener("click", (e) => e.stopPropagation());

(document.getElementById("num-generate") as HTMLButtonElement).addEventListener("click", () => {
  closeNumberMenu();
  nsDialog.showModal();
});
(document.getElementById("num-clear-all") as HTMLButtonElement).addEventListener("click", () => {
  view.clearNumbers("all");
  closeNumberMenu();
});
numClearSel.addEventListener("click", () => {
  view.clearNumbers("selected");
  closeNumberMenu();
});

nsDialog.addEventListener("close", () => {
  if (nsDialog.returnValue !== "ok") return;
  view.autoNumber({
    mode: nsMode.value as "potential" | "unique",
    start: Number(nsStart.value) || 1,
    step: Number(nsStep.value) || 1,
    renumberLocked: nsRelock.checked,
  });
});

// ----- список устройств/контактов (вкладка «Схема», master/slave + несвязанные) -----
const devicesBtn = document.getElementById("devices") as HTMLButtonElement;
const dlDialog = document.getElementById("device-list") as HTMLDialogElement;
const dlBody = document.getElementById("dl-body")!;

function dlLine(cls: string, text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  return el;
}

function renderDeviceList(): void {
  const devices = computeDevices(project, library);
  const { coilsWithoutContacts, orphanContacts } = findUnlinked(project, library);
  dlBody.replaceChildren();

  if (devices.length === 0) {
    dlBody.append(dlLine("dl-empty", "На листах нет устройств."));
    return;
  }

  for (const d of devices) {
    const issue = coilsWithoutContacts.includes(d) || orphanContacts.includes(d);
    const row = document.createElement("div");
    row.className = issue ? "dl-device dl-issue" : "dl-device";

    const detail = document.createElement("div");
    detail.className = "dl-detail";
    if (d.master) {
      const kindRu = d.master.kind === "coil" ? "катушка" : "аппарат";
      detail.append(dlLine("dl-master", `${kindRu} · лист ${d.master.address}`));
    }
    if (d.catalogCode) {
      const part = catalog.get(d.catalogCode);
      const text = part ? `${d.catalogCode} · ${partLabel(part)}` : d.catalogCode;
      detail.append(dlLine("dl-part", `артикул: ${text}`));
    }
    for (const c of d.contacts) {
      const t = c.kind === "contact-nc" ? "НЗ" : "НО";
      detail.append(dlLine("dl-contact", `контакт ${t} ${c.pins.join("·")} → лист ${c.address}`));
    }
    if (coilsWithoutContacts.includes(d))
      detail.append(dlLine("dl-warn", "⚠ катушка без контактов"));
    if (orphanContacts.includes(d)) detail.append(dlLine("dl-warn", "⚠ контакт без катушки"));

    row.append(dlLine("dl-desig", d.designation), detail);
    dlBody.append(row);
  }
}

devicesBtn.addEventListener("click", () => {
  renderDeviceList();
  dlDialog.showModal();
});

// ----- отчёты (вкладка «Схема» → «Отчёты», ГОСТ 2.701) -----
function buildTable(headers: string[], rows: string[][]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "bom-table";
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    htr.append(th);
  }
  thead.append(htr);
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const v of r) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}

function showReport(
  dialog: HTMLDialogElement,
  body: HTMLElement,
  headers: string[],
  rows: string[][],
  empty: string,
): void {
  body.replaceChildren(rows.length ? buildTable(headers, rows) : dlLine("dl-empty", empty));
  dialog.showModal();
}

const projName = (): string => project.name || "project";

function downloadCsv(filename: string, csv: string): void {
  // BOM (U+FEFF) в начале — чтобы Excel открыл кириллицу как UTF-8
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printReport(title: string, headers: string[], rows: string[][]): void {
  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  const css =
    "@page{size:A4;margin:15mm}body{font-family:sans-serif;font-size:11pt;color:#000}" +
    "h1{font-size:13pt}table{border-collapse:collapse;width:100%}" +
    "th,td{border:1px solid #000;padding:3px 6px;text-align:left}";
  const printJs = "window.onload=function(){window.focus();window.print();};";
  const html =
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>${css}</style></head><body><h1>${esc(title)}</h1>` +
    `<table>${head}${body}</table><script>${printJs}</` +
    `script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const win = window.open(url, "_blank");
  if (!win) window.alert("Разрешите всплывающие окна для печати отчёта.");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// перечень элементов
const BOM_HEADERS = ["Поз. обозначение", "Наименование", "Кол.", "Примечание"];
const bomRows = (): string[][] =>
  computeBom(project, library, catalog).map((r) => [
    r.designation,
    r.name,
    String(r.quantity),
    r.note,
  ]);
const bomDialog = document.getElementById("bom-dialog") as HTMLDialogElement;
const bomBody = document.getElementById("bom-body")!;
(document.getElementById("report-bom") as HTMLButtonElement).addEventListener("click", () =>
  showReport(bomDialog, bomBody, BOM_HEADERS, bomRows(), "На листах нет устройств."),
);
(document.getElementById("bom-csv") as HTMLButtonElement).addEventListener("click", () =>
  downloadCsv(`${projName()}-перечень.csv`, bomToCsv(computeBom(project, library, catalog))),
);
(document.getElementById("bom-print") as HTMLButtonElement).addEventListener("click", () =>
  printReport(`Перечень элементов — ${projName()}`, BOM_HEADERS, bomRows()),
);

// таблица соединений
const CONN_HEADERS = ["Цепь", "Соединяемые выводы", "Провод", "Лист"];
const connRows = (): string[][] =>
  computeConnections(project, library).map((r) => [r.net, r.pins, r.wire, r.sheet]);
const connDialog = document.getElementById("conn-dialog") as HTMLDialogElement;
const connBody = document.getElementById("conn-body")!;
(document.getElementById("report-conn") as HTMLButtonElement).addEventListener("click", () =>
  showReport(connDialog, connBody, CONN_HEADERS, connRows(), "Нет соединений между устройствами."),
);
(document.getElementById("conn-csv") as HTMLButtonElement).addEventListener("click", () =>
  downloadCsv(
    `${projName()}-соединения.csv`,
    connectionsToCsv(computeConnections(project, library)),
  ),
);
(document.getElementById("conn-print") as HTMLButtonElement).addEventListener("click", () =>
  printReport(`Таблица соединений — ${projName()}`, CONN_HEADERS, connRows()),
);

// ----- меню сетки (показать/скрыть + шаг) -----
const gridBtn = document.getElementById("grid") as HTMLButtonElement;
const gridMenu = document.getElementById("grid-menu")!;
const gridShow = document.getElementById("grid-show") as HTMLInputElement;
const stepItems = gridMenu.querySelectorAll<HTMLButtonElement>(".dd-item");

const savedStep = Number(localStorage.getItem("see.gridStep"));
if (savedStep > 0) view.setGridStep(savedStep);
if (localStorage.getItem("see.gridShow") === "0") view.setGridVisible(false);

function syncGridUi(): void {
  gridBtn.classList.toggle("on", view.gridShown);
  gridShow.checked = view.gridShown;
  stepItems.forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.step) === view.gridStepMm),
  );
}
syncGridUi();

const closeGridMenu = (): void => {
  gridMenu.hidden = true;
};

gridBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeFileMenu();
  closeNumberMenu();
  if (gridMenu.hidden) {
    const r = gridBtn.getBoundingClientRect();
    gridMenu.style.left = `${r.left}px`;
    gridMenu.style.top = `${r.bottom + 2}px`;
    gridMenu.hidden = false;
  } else {
    closeGridMenu();
  }
});
gridMenu.addEventListener("click", (e) => e.stopPropagation());
gridShow.addEventListener("change", () => {
  view.setGridVisible(gridShow.checked);
  try {
    localStorage.setItem("see.gridShow", gridShow.checked ? "1" : "0");
  } catch {
    /* недоступно — игнор */
  }
  syncGridUi();
});
stepItems.forEach((b) =>
  b.addEventListener("click", () => {
    const step = Number(b.dataset.step);
    view.setGridStep(step);
    try {
      localStorage.setItem("see.gridStep", String(step));
    } catch {
      /* недоступно — игнор */
    }
    syncGridUi();
    closeGridMenu();
  }),
);
document.addEventListener("click", () => {
  closeGridMenu();
  closeFileMenu();
  closeNumberMenu();
});

// лента: вкладки-страницы + вкладка-меню «Файл»
const ribbonTabs = document.querySelectorAll<HTMLButtonElement>(".rtab");
const ribbonPages = document.querySelectorAll<HTMLElement>(".rpage");
ribbonTabs.forEach((tab) => {
  tab.addEventListener("click", (e) => {
    if (tab.dataset.menu === "file") {
      e.stopPropagation();
      closeGridMenu();
      closeNumberMenu();
      if (fileMenu.hidden) {
        const r = tab.getBoundingClientRect();
        fileMenu.style.left = `${r.left}px`;
        fileMenu.style.top = `${r.bottom}px`;
        fileMenu.hidden = false;
      } else {
        closeFileMenu();
      }
      return;
    }
    const name = tab.dataset.tab;
    closeFileMenu();
    closeNumberMenu();
    ribbonTabs.forEach((t) => t.classList.toggle("active", t === tab));
    ribbonPages.forEach((p) => {
      p.hidden = p.dataset.tab !== name;
    });
  });
});

const refresh = (): void => {
  undoBtn.disabled = !stack.canUndo();
  redoBtn.disabled = !stack.canRedo();
};
stack.subscribe(refresh);
refresh();

window.addEventListener("keydown", (e) => {
  // не перехватывать клавиши при вводе текста или в открытом диалоге
  const target = e.target as HTMLElement | null;
  const typing =
    !!target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  if (typing || document.querySelector("dialog[open]")) return;

  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && k === "z" && !e.shiftKey) {
    e.preventDefault();
    stack.undo();
  } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
    e.preventDefault();
    stack.redo();
  } else if (!mod && !e.altKey && k === "r") {
    e.preventDefault();
    view.rotateSelectedOrPending();
  } else if (!mod && !e.altKey && (k === " " || e.code === "Space") && view.hasRotatable) {
    // пробел вращает выбранный УГО на 90° (только когда есть что вращать)
    e.preventDefault();
    view.rotateSelectedOrPending();
  } else if (!mod && !e.altKey && k === "m") {
    e.preventDefault();
    view.mirrorSelectedOrPending();
  } else if (k === "delete" || k === "backspace") {
    e.preventDefault();
    view.deleteSelected();
  } else if (k === "escape") {
    view.cancelPlacement();
  }
});
