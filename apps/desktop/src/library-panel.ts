/**
 * Правый док — база УГО (стиль See Electrical «Symbols»): заголовок, поле «Фильтр»,
 * дерево «папка-категория → строки [иконка + название]». Папки сворачиваются,
 * «★ Избранное» хранится в localStorage. Клик по строке — взвести вставку.
 */
import type { BlockDef, SymbolDef, SymbolLibrary } from "@see/core";
import { symbolIcon } from "./symbol-render";

const FAV_KEY = "see.favorites";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Колбэки панели библиотеки для редактора УГО (S9). */
export interface LibraryHandlers {
  onCreate?: () => void;
  onEdit?: (sym: SymbolDef) => void;
  onDuplicate?: (sym: SymbolDef) => void;
  onRename?: (sym: SymbolDef) => void;
  onReset?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** системный УГО с override → доступен «сброс к системному». */
  canReset?: (id: string) => boolean;
  /** пользовательский УГО → доступно удаление/переименование. */
  canDelete?: (id: string) => boolean;
  /** пользовательский УГО (не системный) → группируется в подпапку «Мои символы». */
  isUser?: (id: string) => boolean;
  /** Поставщик сохранённых блоков (макрос-групп, S27 Ф4). */
  blocks?: () => BlockDef[];
  /** Клик по блоку — взвести его для вставки. */
  onPickBlock?: (block: BlockDef) => void;
  /** Удалить блок. */
  onDeleteBlock?: (id: string) => void;
}

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

/** Иконка блока (макрос-группа): 2×2 сетка модулей. */
function blockIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  for (const [x, y] of [
    [1, 1],
    [9, 1],
    [1, 9],
    [9, 9],
  ]) {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", "6");
    r.setAttribute("height", "6");
    r.setAttribute("fill", "#cfe0f3");
    r.setAttribute("stroke", "#1b6fc4");
    r.setAttribute("stroke-width", "0.8");
    svg.append(r);
  }
  return svg;
}

export class LibraryPanel {
  private active: string | null = null;
  private filter = "";
  private readonly favorites: Set<string>;
  private readonly listEl: HTMLElement;

  private readonly ctxMenu: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly library: SymbolLibrary,
    private readonly onPick: (sym: SymbolDef) => void,
    private readonly handlers: LibraryHandlers = {},
  ) {
    this.favorites = loadFavorites();
    container.replaceChildren();

    const header = document.createElement("div");
    header.className = "panel-header";
    const title = document.createElement("span");
    title.textContent = "Символы";
    header.append(title);
    if (handlers.onCreate) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "panel-header-btn";
      add.textContent = "＋";
      add.title = "Создать символ (УГО)";
      add.addEventListener("click", () => handlers.onCreate?.());
      header.append(add);
    }
    container.append(header);

    // контекстное меню символа (правка/дубль/сброс/удаление)
    this.ctxMenu = document.createElement("div");
    this.ctxMenu.className = "dropdown";
    this.ctxMenu.hidden = true;
    this.ctxMenu.addEventListener("click", (e) => e.stopPropagation());
    document.body.append(this.ctxMenu);
    document.addEventListener("click", () => (this.ctxMenu.hidden = true));

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
    const isUser = this.handlers.isUser ?? (() => false);

    // блоки (макрос-группы, S27 Ф4) — отдельная папка наверху
    const blocks = (this.handlers.blocks?.() ?? []).filter(
      (b) => !this.filter || b.name.toLowerCase().includes(this.filter),
    );
    if (blocks.length) this.renderBlockFolder(blocks);

    const favs = this.library.all().filter((s) => this.favorites.has(s.id) && this.matches(s));
    if (favs.length) this.renderFolder("Избранное", favs, { fav: true });

    // строгие категории (S27): системные УГО прямо в категории, свои — в подпапке «Мои символы»
    for (const [category, syms] of this.library.byCategory()) {
      const visible = syms.filter((s) => this.matches(s));
      if (!visible.length) continue;
      const system = visible.filter((s) => !isUser(s.id));
      const mine = visible.filter((s) => isUser(s.id));
      this.renderFolder(category, system, { mine });
    }

    if (this.listEl.childElementCount === 0) {
      const empty = document.createElement("div");
      empty.className = "lib-empty";
      empty.textContent = "Ничего не найдено";
      this.listEl.append(empty);
    }

    if (this.active) this.markActive(this.active);
  }

  private renderFolder(
    title: string,
    syms: SymbolDef[],
    opts: { fav?: boolean; mine?: SymbolDef[] } = {},
  ): void {
    const folder = document.createElement("div");
    folder.className = "lib-folder";

    const exp = document.createElement("span");
    exp.className = "lib-exp";
    exp.textContent = "−";

    let icon: HTMLElement | SVGSVGElement;
    if (opts.fav) {
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
    if (opts.mine?.length) rows.append(this.subFolder("Мои символы", opts.mine));

    folder.addEventListener("click", () => {
      rows.hidden = !rows.hidden;
      exp.textContent = rows.hidden ? "+" : "−";
    });

    this.listEl.append(folder, rows);
  }

  /** Подпапка «Мои символы» внутри категории (свои УГО этого класса). */
  private subFolder(title: string, syms: SymbolDef[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "lib-subfolder";

    const head = document.createElement("div");
    head.className = "lib-folder lib-subhead";
    const exp = document.createElement("span");
    exp.className = "lib-exp";
    exp.textContent = "−";
    const name = document.createElement("span");
    name.className = "lib-fname";
    name.textContent = title;
    head.append(exp, folderIcon(), name);

    const subrows = document.createElement("div");
    subrows.className = "lib-rows lib-subrows";
    for (const sym of syms) subrows.append(this.row(sym));

    head.addEventListener("click", (e) => {
      e.stopPropagation();
      subrows.hidden = !subrows.hidden;
      exp.textContent = subrows.hidden ? "+" : "−";
    });

    wrap.append(head, subrows);
    return wrap;
  }

  /** Папка «Блоки» (макрос-группы): клик по строке — взвести вставку; ПКМ — удалить. */
  private renderBlockFolder(blocks: BlockDef[]): void {
    const folder = document.createElement("div");
    folder.className = "lib-folder";
    const exp = document.createElement("span");
    exp.className = "lib-exp";
    exp.textContent = "−";
    const name = document.createElement("span");
    name.className = "lib-fname";
    name.textContent = "Блоки";
    folder.append(exp, blockIcon(), name);

    const rows = document.createElement("div");
    rows.className = "lib-rows";
    for (const block of blocks) {
      const row = document.createElement("div");
      row.className = "lib-row";
      row.dataset.blockId = block.id;
      row.title = `Блок: ${block.name} (${block.members.length} эл.)`;
      const ico = document.createElement("span");
      ico.className = "ico";
      ico.append(blockIcon());
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = block.name;
      row.append(ico, nm);
      row.addEventListener("click", () => this.handlers.onPickBlock?.(block));
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.openBlockCtx(block, e.clientX, e.clientY);
      });
      rows.append(row);
    }

    folder.addEventListener("click", () => {
      rows.hidden = !rows.hidden;
      exp.textContent = rows.hidden ? "+" : "−";
    });
    this.listEl.append(folder, rows);
  }

  private openBlockCtx(block: BlockDef, x: number, y: number): void {
    if (!this.handlers.onDeleteBlock) return;
    this.ctxMenu.replaceChildren();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dd-item";
    b.textContent = "Удалить блок";
    b.addEventListener("click", () => {
      this.ctxMenu.hidden = true;
      this.handlers.onDeleteBlock?.(block.id);
    });
    this.ctxMenu.append(b);
    this.ctxMenu.style.left = `${x}px`;
    this.ctxMenu.style.top = `${y}px`;
    this.ctxMenu.hidden = false;
  }

  private row(sym: SymbolDef): HTMLElement {
    const row = document.createElement("div");
    row.className = "lib-row";
    row.dataset.symId = sym.id;
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
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openCtx(sym, e.clientX, e.clientY);
    });
    return row;
  }

  /** Контекстное меню символа: правка / дубль / сброс / удаление (S9). */
  private openCtx(sym: SymbolDef, x: number, y: number): void {
    const h = this.handlers;
    if (!h.onEdit && !h.onDuplicate && !h.onReset && !h.onDelete) return;
    this.ctxMenu.replaceChildren();
    const item = (label: string, fn: () => void): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dd-item";
      b.textContent = label;
      b.addEventListener("click", () => {
        this.ctxMenu.hidden = true;
        fn();
      });
      this.ctxMenu.append(b);
    };
    if (h.onEdit) item("Редактировать…", () => h.onEdit?.(sym));
    if (h.onDuplicate) item("Копировать…", () => h.onDuplicate?.(sym));
    if (h.canDelete?.(sym.id) && h.onRename) item("Переименовать…", () => h.onRename?.(sym));
    if (h.canReset?.(sym.id) && h.onReset) item("Сбросить к системному", () => h.onReset?.(sym.id));
    if (h.canDelete?.(sym.id) && h.onDelete) item("Удалить", () => h.onDelete?.(sym.id));
    this.ctxMenu.style.left = `${x}px`;
    this.ctxMenu.style.top = `${y}px`;
    this.ctxMenu.hidden = false;
  }

  /** Перерисовать список (после изменения библиотеки). */
  refresh(): void {
    this.renderList();
  }

  private markActive(id: string): void {
    this.listEl
      .querySelectorAll(`.lib-row[data-sym-id="${id}"]`)
      .forEach((el) => el.classList.add("active"));
  }

  /** Подсветить активный (взведённый) символ во всех его строках. */
  setActive(id: string | null): void {
    this.listEl.querySelectorAll(".lib-row.active").forEach((el) => el.classList.remove("active"));
    this.active = id;
    if (id) this.markActive(id);
  }
}
