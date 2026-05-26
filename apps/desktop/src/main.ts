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
  SetPageTitleCommand,
  serializeProject,
  deserializeProject,
  computeDevices,
  findUnlinked,
  computeBom,
  bomToCsv,
  computeConnections,
  connectionsToCsv,
  computeTerminals,
  terminalsToCsv,
  Catalog,
  BUILTIN_PARTS,
  partLabel,
  validateSymbol,
  CategoryRegistry,
  GOST_CATEGORIES,
  type SymbolDef,
  type SymbolInstance,
  type Wire,
  type Project,
  type Page,
} from "@see/core";
import { CanvasView } from "./canvas";
import { LibraryPanel } from "./library-panel";
import { ProjectPanel } from "./project-panel";
import { PageTabs, type OpenTab } from "./page-tabs";
import { SymbolEditor } from "./symbol-editor";
import { loadUserSymbols, upsertUserSymbol, removeUserSymbol, userSymbolIds } from "./user-symbols";
import { loadUserCategories, upsertUserCategory } from "./user-categories";

const svg = document.getElementById("canvas") as unknown as SVGSVGElement;
const hud = document.getElementById("hud-info")!;
const libraryEl = document.getElementById("library")!;
const projectEl = document.getElementById("project")!;

// рабочее пространство (S26): несколько открытых проектов, активный — `project`
const projects: Project[] = [createProject()]; // 1 проект, 1 лист A3
let project = projects[0]; // активный проект (определяется активной страницей)
const stack = new CommandStack();
const library = new SymbolLibrary(GOST_SYMBOLS);
const catalog = new Catalog(BUILTIN_PARTS);

// пользовательские УГО (S9): перекрывают системные по id
const GOST_IDS = new Set(GOST_SYMBOLS.map((s) => s.id));
for (const s of loadUserSymbols()) library.add(s);
let userIds = userSymbolIds();

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
  // переход по двойному клику на адрес в зеркале контактов (S27 Ф2)
  onNavigateToContact: (pageIndex, instanceId) => {
    const target = project.pages[pageIndex];
    if (!target) return;
    if (target !== activePageObj) activatePage(target);
    view.focusInstance(instanceId);
  },
});
// редактор УГО (S9): сохранение в пользовательскую библиотеку (override по id)
function applyUserSymbol(sym: SymbolDef): void {
  upsertUserSymbol(sym);
  library.add(sym);
  userIds = userSymbolIds();
  panel?.refresh();
  view.rerender();
}
// реестр категорий (S27): базовый комплект ГОСТ + пользовательские (localStorage)
let registry = new CategoryRegistry([...GOST_CATEGORIES, ...loadUserCategories()]);
const symbolEditor = new SymbolEditor(
  applyUserSymbol,
  () => registry,
  (cat) => {
    upsertUserCategory(cat);
    registry = new CategoryRegistry([...GOST_CATEGORIES, ...loadUserCategories()]);
  },
);

panel = new LibraryPanel(libraryEl, library, (sym) => view.arm(sym), {
  onCreate: () => symbolEditor.open(),
  onEdit: (sym) => symbolEditor.open(sym),
  onDuplicate: (sym) => symbolEditor.open(sym, { asCopy: true }),
  onRename: (sym) => openRename(sym),
  isUser: (id) => userIds.has(id) && !GOST_IDS.has(id),
  onReset: (id) => {
    removeUserSymbol(id);
    const orig = GOST_SYMBOLS.find((s) => s.id === id);
    if (orig) library.add(orig);
    else library.remove(id);
    userIds = userSymbolIds();
    panel?.refresh();
    view.rerender();
  },
  onDelete: (id) => {
    removeUserSymbol(id);
    library.remove(id);
    userIds = userSymbolIds();
    panel?.refresh();
    view.rerender();
  },
  canReset: (id) => GOST_IDS.has(id) && userIds.has(id),
  canDelete: (id) => userIds.has(id) && !GOST_IDS.has(id),
});

// быстрое переименование пользовательского УГО (S27) — без полного редактора
const renameDialog = document.getElementById("rename-dialog") as HTMLDialogElement;
const rnInput = document.getElementById("rn-input") as HTMLInputElement;
let renaming: SymbolDef | null = null;
function openRename(sym: SymbolDef): void {
  renaming = sym;
  rnInput.value = sym.name;
  renameDialog.showModal();
  rnInput.focus();
  rnInput.select();
}
renameDialog.addEventListener("close", () => {
  if (renameDialog.returnValue === "ok" && renaming) {
    const name = rnInput.value.trim();
    if (name && name !== renaming.name) applyUserSymbol({ ...renaming, name });
  }
  renaming = null;
});

// ----- рабочее пространство: вкладки открытых страниц (S26) -----
let openPages: Page[] = [activePage(project)]; // открытые листы (вкладки)
let activePageObj: Page = openPages[0]; // показываемый лист

const projectOf = (page: Page): Project => projects.find((p) => p.pages.includes(page)) ?? project;
const openTabs = (): OpenTab[] => openPages.map((page) => ({ project: projectOf(page), page }));

function renderWorkspace(): void {
  projectPanel.refresh();
  pageTabs.render(openTabs(), activePageObj);
  syncTitle();
}

/** Активировать (и при необходимости открыть) лист — определяет активный проект и канвас. */
function activatePage(page: Page): void {
  project = projectOf(page);
  project.activePageId = page.id;
  activePageObj = page;
  if (!openPages.includes(page)) openPages.push(page);
  view.setPage(page);
  view.setWireWidths(project.wireWidthPower, project.wireWidthControl);
  renderWorkspace();
}

/** Закрыть вкладку страницы (последнюю не закрываем). */
function closePageTab(page: Page): void {
  const i = openPages.indexOf(page);
  if (i < 0 || openPages.length <= 1) return;
  openPages.splice(i, 1);
  if (page === activePageObj) activatePage(openPages[Math.min(i, openPages.length - 1)]);
  else renderWorkspace();
}

/** Добавить проект в рабочее пространство и переключиться на него. */
function addProject(p: Project): void {
  projects.push(p);
  activatePage(activePage(p));
}

const pageTabs = new PageTabs(document.getElementById("pagetabs")!, {
  onActivate: (page) => activatePage(page),
  onClose: (page) => closePageTab(page),
});

const projectPanel = new ProjectPanel(
  projectEl,
  projects,
  {
    onSelect: (_p, page) => activatePage(page),
    onAdd: (p) => {
      const cmd = new AddPageCommand(p);
      stack.execute(cmd);
      activatePage(cmd.newPage);
    },
    onRemove: (p, page) => stack.execute(new RemovePageCommand(p, page.id)),
    onRenameSheet: (_p, page) => openSheetName(page),
    onSettings: (p, focusName) => openProjectSettings(p, focusName),
    onCloseProject: (p) => closeProject(p),
  },
  () => activePageObj.id,
);

/** Закрыть проект целиком (последний не закрываем). */
function closeProject(p: Project): void {
  if (projects.length <= 1) return;
  const i = projects.indexOf(p);
  if (i < 0) return;
  projects.splice(i, 1);
  openPages = openPages.filter((pg) => !p.pages.includes(pg));
  if (p.pages.includes(activePageObj) || openPages.length === 0) {
    const fallback = openPages[0] ?? activePage(projects[0]);
    activatePage(fallback);
  } else {
    renderWorkspace();
  }
}

// синхронизация после команд (add/remove листа, undo/redo): починить вкладки и вид
stack.subscribe(() => {
  openPages = openPages.filter((pg) => projects.some((p) => p.pages.includes(pg)));
  if (!projects.some((p) => p.pages.includes(activePageObj))) {
    activePageObj = openPages[0] ?? activePage(projects[0]);
  }
  if (!openPages.includes(activePageObj)) openPages.push(activePageObj);
  project = projectOf(activePageObj);
  if (view.currentPageId !== activePageObj.id) {
    view.setPage(activePageObj);
    view.setWireWidths(project.wireWidthPower, project.wireWidthControl);
  }
  renderWorkspace();
});

view.setWireWidths(project.wireWidthPower, project.wireWidthControl);

// ----- настройки проекта (ПКМ на корне → модальное окно) -----
const psDialog = document.getElementById("project-settings") as HTMLDialogElement;
const psName = document.getElementById("ps-name") as HTMLInputElement;
const psInfo = document.getElementById("ps-info")!;
const psWPower = document.getElementById("ps-wpower") as HTMLSelectElement;
const psWControl = document.getElementById("ps-wcontrol") as HTMLSelectElement;

let settingsProject = project; // проект, чьи настройки открыты (ПКМ на конкретном корне)

function openProjectSettings(target: Project, focusName: boolean): void {
  settingsProject = target;
  psName.value = target.name;
  psWPower.value = String(target.wireWidthPower);
  psWControl.value = String(target.wireWidthControl);
  psInfo.textContent = `Листов: ${target.pages.length}`;
  psDialog.showModal();
  if (focusName) {
    psName.focus();
    psName.select();
  }
}

psDialog.addEventListener("close", () => {
  if (psDialog.returnValue === "ok") {
    const name = psName.value.trim();
    if (name) settingsProject.name = name;
    settingsProject.wireWidthPower = Number(psWPower.value);
    settingsProject.wireWidthControl = Number(psWControl.value);
    if (settingsProject === project) {
      view.setWireWidths(project.wireWidthPower, project.wireWidthControl);
    }
    renderWorkspace();
  }
});

// ----- наименование листа (ПКМ листа → штамп + дерево, S26) -----
const snDialog = document.getElementById("sheet-name-dialog") as HTMLDialogElement;
const snInput = document.getElementById("sn-input") as HTMLInputElement;
let snTarget: Page | null = null;

function openSheetName(page: Page): void {
  snTarget = page;
  snInput.value = page.titleBlock.title;
  snDialog.showModal();
  snInput.focus();
  snInput.select();
}

snDialog.addEventListener("close", () => {
  const page = snTarget;
  snTarget = null;
  if (snDialog.returnValue === "ok" && page) {
    stack.execute(new SetPageTitleCommand(page, snInput.value.trim()));
    view.refreshSheet(); // обновить штамп активного листа
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
const attrsEl = document.getElementById("prop-attrs")!;
let editing: SymbolInstance | null = null;
let editingCode = ""; // ГОСТ-код редактируемого инстанса (для перефильтра по марке)
// контролы характеристик категории (S27): значение + флаг «показывать подписью»
let attrControls: {
  key: string;
  valueEl: HTMLInputElement | HTMLSelectElement;
  showEl: HTMLInputElement;
}[] = [];

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

/**
 * Построить строки характеристик категории (S27): значение + флаг «подписью на схеме».
 * Набор полей задаётся категорией символа; значения — из `inst.attributes`.
 */
function buildAttrRows(inst: SymbolInstance): void {
  attrControls = [];
  attrsEl.replaceChildren();
  const sym = library.get(inst.symbolId);
  const cat = sym ? registry.byName(sym.category) : undefined;
  const attrs = cat?.attributes ?? [];
  if (attrs.length === 0) return;

  const head = document.createElement("div");
  head.className = "prop-type";
  head.textContent = "Характеристики (галка — показывать подписью)";
  attrsEl.append(head);

  for (const a of attrs) {
    const row = document.createElement("div");
    row.className = "prop-row prop-attr-row";
    const label = document.createElement("label");
    label.textContent = a.label;
    const value = inst.attributes?.[a.key] ?? "";

    let valueEl: HTMLInputElement | HTMLSelectElement;
    if (a.type === "select" && a.options) {
      const sel = document.createElement("select");
      sel.append(opt("", "—"));
      for (const o of a.options) sel.append(opt(o, o));
      sel.value = value;
      valueEl = sel;
    } else {
      const inp = document.createElement("input");
      inp.type = a.type === "number" ? "number" : "text";
      inp.autocomplete = "off";
      inp.value = value;
      valueEl = inp;
    }

    const show = document.createElement("label");
    show.className = "prop-attr-show";
    const showEl = document.createElement("input");
    showEl.type = "checkbox";
    showEl.checked = inst.labelFields?.includes(a.key) ?? false;
    show.append(showEl);

    row.append(label, valueEl, show);
    attrsEl.append(row);
    attrControls.push({ key: a.key, valueEl, showEl });
  }
}

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
  buildAttrRows(inst);
  dialog.showModal();
  desigInput.focus();
  desigInput.select();
}

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "ok" && editing) {
    const designation = desigInput.value.trim() || editing.designation;
    const showLabels = showLabelsInput.checked;
    const catalogCode = partSelect.value || undefined;
    // характеристики и поля-подписи из секции «Характеристики»
    const attrs: Record<string, string> = {};
    const labelFields: string[] = [];
    for (const c of attrControls) {
      const v = c.valueEl.value.trim();
      if (v) attrs[c.key] = v;
      if (c.showEl.checked && v) labelFields.push(c.key);
    }
    const attributes = Object.keys(attrs).length > 0 ? attrs : undefined;
    const labels = labelFields.length > 0 ? labelFields : undefined;
    const dirty =
      designation !== editing.designation ||
      showLabels !== editing.showLabels ||
      catalogCode !== editing.catalogCode ||
      JSON.stringify(attributes ?? null) !== JSON.stringify(editing.attributes ?? null) ||
      JSON.stringify(labels ?? null) !== JSON.stringify(editing.labelFields ?? null);
    if (dirty) {
      stack.execute(
        new EditInstanceCommand(editing, {
          designation,
          showLabels,
          catalogCode,
          attributes,
          labelFields: labels,
        }),
      );
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
// «Создать»/«Открыть» добавляют проект в рабочее пространство (S26), а не заменяют.

/** Обновить название проекта в верхней полосе заголовка (S21). */
const tbName = document.getElementById("tb-name")!;
function syncTitle(): void {
  tbName.textContent = project.name || "Без имени";
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
      addProject(deserializeProject(text));
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
  addProject(createProject());
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

// ----- библиотека УГО: экспорт/импорт (S9; авто-папка из ОС — в десктоп-оболочке S11) -----
function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const libInput = document.createElement("input");
libInput.type = "file";
libInput.accept = ".json,application/json";
libInput.style.display = "none";
document.body.append(libInput);
libInput.addEventListener("change", () => {
  const f = libInput.files?.[0];
  libInput.value = "";
  if (!f) return;
  void f.text().then((text) => {
    try {
      const arr: unknown = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("ожидался массив символов");
      let n = 0;
      for (const item of arr) {
        const v = validateSymbol(item);
        if (v.ok) {
          upsertUserSymbol(v.symbol);
          library.add(v.symbol);
          n++;
        }
      }
      userIds = userSymbolIds();
      panel?.refresh();
      view.rerender();
      window.alert(`Импортировано символов: ${n}`);
    } catch (e) {
      window.alert("Не удалось импортировать: " + (e instanceof Error ? e.message : String(e)));
    }
  });
});

(document.getElementById("lib-export") as HTMLButtonElement).addEventListener("click", () => {
  downloadText("ugo-library.json", JSON.stringify(loadUserSymbols(), null, 2), "application/json");
  closeFileMenu();
});
(document.getElementById("lib-import") as HTMLButtonElement).addEventListener("click", () => {
  libInput.click();
  closeFileMenu();
});

// верхняя полоса заголовка (S21): быстрый доступ к файловым действиям
(document.getElementById("tb-new") as HTMLButtonElement).addEventListener("click", () =>
  addProject(createProject()),
);
(document.getElementById("tb-open") as HTMLButtonElement).addEventListener("click", () =>
  fileInput.click(),
);
(document.getElementById("tb-save") as HTMLButtonElement).addEventListener("click", () =>
  saveProject(),
);
renderWorkspace(); // первичная отрисовка дерева + ленты страниц + заголовка

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

// таблица клемм
const TERM_HEADERS = ["Клемма", "Вывод 1", "Вывод 2", "Лист"];
const termRows = (): string[][] =>
  computeTerminals(project, library).map((r) => [r.terminal, r.side1, r.side2, r.sheet]);
const termDialog = document.getElementById("term-dialog") as HTMLDialogElement;
const termBody = document.getElementById("term-body")!;
(document.getElementById("report-term") as HTMLButtonElement).addEventListener("click", () =>
  showReport(termDialog, termBody, TERM_HEADERS, termRows(), "На листах нет клемм (XT)."),
);
(document.getElementById("term-csv") as HTMLButtonElement).addEventListener("click", () =>
  downloadCsv(`${projName()}-клеммы.csv`, terminalsToCsv(computeTerminals(project, library))),
);
(document.getElementById("term-print") as HTMLButtonElement).addEventListener("click", () =>
  printReport(`Таблица клемм — ${projName()}`, TERM_HEADERS, termRows()),
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
