import "./style.css";
import { createPage, CommandStack } from "@see/core";
import { CanvasView } from "./canvas";

const svg = document.getElementById("canvas") as unknown as SVGSVGElement;
const hud = document.getElementById("hud") as HTMLElement;

const page = createPage(); // A3, шаг сетки 5 мм
const stack = new CommandStack();
const view = new CanvasView(svg, page, stack, hud);

const undoBtn = document.getElementById("undo") as HTMLButtonElement;
const redoBtn = document.getElementById("redo") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const pdfBtn = document.getElementById("pdf") as HTMLButtonElement;

undoBtn.addEventListener("click", () => stack.undo());
redoBtn.addEventListener("click", () => stack.redo());
resetBtn.addEventListener("click", () => view.resetView());
pdfBtn.addEventListener("click", () => view.exportPdf());

const refresh = (): void => {
  undoBtn.disabled = !stack.canUndo();
  redoBtn.disabled = !stack.canRedo();
};
stack.subscribe(refresh);
refresh();

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) {
    e.preventDefault();
    stack.undo();
  } else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) {
    e.preventDefault();
    stack.redo();
  }
});
