/**
 * Панель библиотеки УГО: категории → кнопки с SVG-превью.
 * Клик по элементу — взвести вставку (`onPick`). Активный элемент подсвечивается.
 */
import type { SymbolDef, SymbolLibrary } from "@see/core";
import { symbolPreview } from "./symbol-render";

export class LibraryPanel {
  private active: string | null = null;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(
    container: HTMLElement,
    library: SymbolLibrary,
    onPick: (sym: SymbolDef) => void,
  ) {
    container.replaceChildren();

    const title = document.createElement("div");
    title.className = "lib-title";
    title.textContent = "Библиотека УГО";
    container.append(title);

    for (const [category, syms] of library.byCategory()) {
      const head = document.createElement("div");
      head.className = "lib-cat";
      head.textContent = category;
      container.append(head);

      const grid = document.createElement("div");
      grid.className = "lib-grid";
      for (const sym of syms) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lib-item";
        btn.title = `${sym.name} (${sym.componentCode})`;
        btn.append(symbolPreview(sym));

        const label = document.createElement("span");
        label.className = "lib-label";
        label.textContent = sym.componentCode;
        btn.append(label);

        btn.addEventListener("click", () => onPick(sym));
        this.buttons.set(sym.id, btn);
        grid.append(btn);
      }
      container.append(grid);
    }
  }

  /** Подсветить активный (взведённый) символ, либо снять подсветку. */
  setActive(id: string | null): void {
    if (this.active) this.buttons.get(this.active)?.classList.remove("active");
    this.active = id;
    if (id) this.buttons.get(id)?.classList.add("active");
  }
}
