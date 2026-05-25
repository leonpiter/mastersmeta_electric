import "./style.css";
import {
  createPage,
  CommandStack,
  SymbolLibrary,
  GOST_SYMBOLS,
  EditInstanceCommand,
  type SymbolInstance,
} from "@see/core";
import { CanvasView } from "./canvas";
import { LibraryPanel } from "./library-panel";

const svg = document.getElementById("canvas") as unknown as SVGSVGElement;
const hud = document.getElementById("hud") as HTMLElement;
const libraryEl = document.getElementById("library") as HTMLElement;

const page = createPage(); // A3, шаг сетки 5 мм
const stack = new CommandStack();
const library = new SymbolLibrary(GOST_SYMBOLS);

let panel: LibraryPanel | undefined;
const view = new CanvasView(svg, page, stack, hud, library, {
  onArmedChange: (id) => panel?.setActive(id),
  onRequestEdit: (inst) => openProps(inst),
});
panel = new LibraryPanel(libraryEl, library, (sym) => view.arm(sym));

// ----- диалог свойств элемента (двойной клик) -----
const dialog = document.getElementById("props") as HTMLDialogElement;
const desigInput = document.getElementById("prop-desig") as HTMLInputElement;
const typeEl = document.getElementById("prop-type") as HTMLElement;
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

undoBtn.addEventListener("click", () => stack.undo());
redoBtn.addEventListener("click", () => stack.redo());
resetBtn.addEventListener("click", () => view.resetView());
pdfBtn.addEventListener("click", () => view.exportPdf());
rotateBtn.addEventListener("click", () => view.rotateSelectedOrPending());
mirrorBtn.addEventListener("click", () => view.mirrorSelectedOrPending());
deleteBtn.addEventListener("click", () => view.deleteSelected());

const refresh = (): void => {
  undoBtn.disabled = !stack.canUndo();
  redoBtn.disabled = !stack.canRedo();
};
stack.subscribe(refresh);
refresh();

window.addEventListener("keydown", (e) => {
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
