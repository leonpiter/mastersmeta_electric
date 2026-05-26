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

let panel: LibraryPanel | undefined;
const view = new CanvasView(svg, activePage(project), stack, hud, library, {
  onArmedChange: (id) => panel?.setActive(id),
  onRequestEdit: (inst) => openProps(inst),
  onRequestEditWire: (wire) => openWireSettings(wire),
  onWireModeChange: (active, poles) => {
    wireBtn.classList.toggle("on", active && poles === 1);
    wire3Btn.classList.toggle("on", active && poles === 3);
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
let editingWire: Wire | null = null;
let wireOrig: { type: Wire["type"]; section?: string; color?: string } | null = null;

function openWireSettings(wire: Wire): void {
  editingWire = wire;
  wireOrig = { type: wire.type, section: wire.section, color: wire.color };
  wsType.value = wire.type;
  wsSection.value = wire.section ?? "";
  wsColor.value = wire.color ?? "#1a1a1a";
  wsDialog.showModal();
}

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
  if (wsDialog.returnValue === "ok") {
    stack.execute(
      new EditWireCommand(wire, {
        type: wsType.value as Wire["type"],
        section: wsSection.value || undefined,
        color: wsColor.value,
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
let editing: SymbolInstance | null = null;

function openProps(inst: SymbolInstance): void {
  editing = inst;
  desigInput.value = inst.designation;
  showLabelsInput.checked = inst.showLabels;
  const sym = library.get(inst.symbolId);
  typeEl.textContent = sym ? `${sym.name} · ${sym.componentCode}` : inst.symbolId;
  dialog.showModal();
  desigInput.focus();
  desigInput.select();
}

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "ok" && editing) {
    const designation = desigInput.value.trim() || editing.designation;
    const showLabels = showLabelsInput.checked;
    if (designation !== editing.designation || showLabels !== editing.showLabels) {
      stack.execute(new EditInstanceCommand(editing, { designation, showLabels }));
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

// ----- сохранение/открытие проекта (.seeproj) -----
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
  a.download = `${project.name || "project"}.seeproj`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".seeproj,application/json";
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
});

// лента: вкладки-страницы + вкладка-меню «Файл»
const ribbonTabs = document.querySelectorAll<HTMLButtonElement>(".rtab");
const ribbonPages = document.querySelectorAll<HTMLElement>(".rpage");
ribbonTabs.forEach((tab) => {
  tab.addEventListener("click", (e) => {
    if (tab.dataset.menu === "file") {
      e.stopPropagation();
      closeGridMenu();
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
