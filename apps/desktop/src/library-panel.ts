/**
 * Правый док — база УГО (стиль See Electrical «Symbols»): заголовок, поле «Фильтр»,
 * дерево «папка-категория → строки [иконка + название]». Папки сворачиваются,
 * «★ Избранное» хранится в localStorage. Клик по строке — взвести вставку.
 */
import type { SymbolDef, SymbolLibrary } from "@see/core";
import { symbolIcon } from "./symbol-render";

const FAV_KEY = "see.favorites";
const SVG_NS = "http://www.w3.org/2000/svg";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* недоступно — игнор */
  }
  return new Set();
}

function saveFavorites(f: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...f]));
  } catch {
    /* недоступно — игнор */
  }
}

/** Жёлтая иконка папки (как в See Electrical). */
function folderIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 12");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "12");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", "M1 2.5H5.5L7 4H15V10.5H1Z");
  p.setAttribute("fill", "#f2cd6b");
  p.setAttribute("stroke", "#bf9a3d");
  p.setAttribute("stroke-width", "0.8");
  svg.append(p);
  return svg;
}

export class LibraryPanel {
  private active: string | null = null;
  private filter = "";
  private readonly favorites: Set<string>;
  private readonly listEl: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly library: SymbolLibrary,
    private readonly onPick: (sym: SymbolDef) => void,
  ) {
    this.favorites = loadFavorites();
    container.replaceChildren();

    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Символы";
    container.append(header);

    const filterRow = document.createElement("div");
    filterRow.className = "lib-filter";
    const label = document.createElement("span");
    label.className = "lib-filter-label";
    label.textContent = "Фильтр";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "имя или код…";
    input.addEventListener("input", () => {
      this.filter = input.value.trim().toLowerCase();
      this.renderList();
    });
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "lib-filter-clear";
    clear.textContent = "✕";
    clear.title = "Сбросить фильтр";
    clear.addEventListener("click", () => {
      input.value = "";
      this.filter = "";
      this.renderList();
      input.focus();
    });
    filterRow.append(label, input, clear);
    container.append(filterRow);

    this.listEl = document.createElement("div");
    this.listEl.className = "lib-scroll";
    container.append(this.listEl);

    this.renderList();
  }

  private matches(s: SymbolDef): boolean {
    if (!this.filter) return true;
    return (
      s.name.toLowerCase().includes(this.filter) ||
      s.componentCode.toLowerCase().includes(this.filter) ||
      s.category.toLowerCase().includes(this.filter)
    );
  }

  private renderList(): void {
    this.listEl.replaceChildren();

    const favs = this.library
      .all()
      .filter((s) => this.favorites.has(s.id) && this.matches(s));
    if (favs.length) this.renderFolder("Избранное", favs, true);

    for (const [category, syms] of this.library.byCategory()) {
      const visible = syms.filter((s) => this.matches(s));
      if (visible.length) this.renderFolder(category, visible, false);
    }

    if (this.listEl.childElementCount === 0) {
      const empty = document.createElement("div");
      empty.className = "lib-empty";
      empty.textContent = "Ничего не найдено";
      this.listEl.append(empty);
    }

    if (this.active) this.markActive(this.active);
  }

  private renderFolder(title: string, syms: SymbolDef[], isFav: boolean): void {
    const folder = document.createElement("div");
    folder.className = "lib-folder";

    const exp = document.createElement("span");
    exp.className = "lib-exp";
    exp.textContent = "−";

    let icon: HTMLElement | SVGSVGElement;
    if (isFav) {
      const star = document.createElement("span");
      star.className = "lib-fav-ico";
      star.textContent = "★";
      icon = star;
    } else {
      icon = folderIcon();
    }

    const name = document.createElement("span");
    name.className = "lib-fname";
    name.textContent = title;
    folder.append(exp, icon, name);

    const rows = document.createElement("div");
    rows.className = "lib-rows";
    for (const sym of syms) rows.append(this.row(sym));

    folder.addEventListener("click", () => {
      rows.hidden = !rows.hidden;
      exp.textContent = rows.hidden ? "+" : "−";
    });

    this.listEl.append(folder, rows);
  }

  private row(sym: SymbolDef): HTMLElement {
    const row = document.createElement("div");
    row.className = "lib-row";
    row.dataset["symId"] = sym.id;
    row.title = `${sym.name} (${sym.componentCode})`;

    const ico = document.createElement("span");
    ico.className = "ico";
    ico.append(symbolIcon(sym));

    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = sym.name;

    const star = document.createElement("span");
    star.className = "star" + (this.favorites.has(sym.id) ? " on" : "");
    star.textContent = "★";
    star.title = "В избранное";
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.favorites.has(sym.id)) this.favorites.delete(sym.id);
      else this.favorites.add(sym.id);
      saveFavorites(this.favorites);
      this.renderList();
    });

    row.append(ico, nm, star);
    row.addEventListener("click", () => this.onPick(sym));
    return row;
  }

  private markActive(id: string): void {
    this.listEl
      .querySelectorAll(`.lib-row[data-sym-id="${id}"]`)
      .forEach((el) => el.classList.add("active"));
  }

  /** Подсветить активный (взведённый) символ во всех его строках. */
  setActive(id: string | null): void {
    this.listEl
      .querySelectorAll(".lib-row.active")
      .forEach((el) => el.classList.remove("active"));
    this.active = id;
    if (id) this.markActive(id);
  }
}
