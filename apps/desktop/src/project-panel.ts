/**
 * Левый док — структура проекта (аналог «Workspace» в See Electrical):
 * дерево Проект → документ → листы. Листы можно добавлять (+), удалять (×, кроме
 * последнего) и переключать кликом. Разделы «Шкафы»/«Отчёты» — заглушки под будущие спринты.
 */
import type { Project } from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ProjectPanelHandlers {
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onRemove: (pageId: string) => void;
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function groupIcon(): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 16 13", width: "15", height: "13" }) as SVGSVGElement;
  svg.append(
    svgEl("rect", {
      x: "2",
      y: "1",
      width: "8",
      height: "10",
      fill: "#dfeaf8",
      stroke: "#3f78c0",
      "stroke-width": "0.8",
    }),
    svgEl("rect", {
      x: "5",
      y: "3",
      width: "8",
      height: "10",
      fill: "#eef4fb",
      stroke: "#3f78c0",
      "stroke-width": "0.8",
    }),
  );
  return svg;
}

function pageIcon(): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 12 14", width: "12", height: "14" }) as SVGSVGElement;
  svg.append(
    svgEl("path", {
      d: "M2 1H7.5L10 3.5V13H2Z",
      fill: "#fff",
      stroke: "#8893a4",
      "stroke-width": "0.8",
    }),
    svgEl("path", { d: "M7.5 1V3.5H10", fill: "none", stroke: "#8893a4", "stroke-width": "0.8" }),
    svgEl("line", {
      x1: "3.5",
      y1: "6.5",
      x2: "8",
      y2: "6.5",
      stroke: "#b4bcc8",
      "stroke-width": "0.7",
    }),
    svgEl("line", {
      x1: "3.5",
      y1: "8.5",
      x2: "8",
      y2: "8.5",
      stroke: "#b4bcc8",
      "stroke-width": "0.7",
    }),
    svgEl("line", {
      x1: "3.5",
      y1: "10.5",
      x2: "6.5",
      y2: "10.5",
      stroke: "#b4bcc8",
      "stroke-width": "0.7",
    }),
  );
  return svg;
}

export class ProjectPanel {
  private readonly treeEl: HTMLElement;
  private readonly ctxMenu: HTMLElement;
  private readonly ctxDel: HTMLButtonElement;
  private ctxTarget: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly project: Project,
    private readonly handlers: ProjectPanelHandlers,
  ) {
    container.replaceChildren();

    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Структура";
    container.append(header);

    this.treeEl = document.createElement("div");
    this.treeEl.className = "tree";
    container.append(this.treeEl);

    // контекстное меню листа (ПКМ)
    this.ctxMenu = document.createElement("div");
    this.ctxMenu.className = "dropdown";
    this.ctxMenu.hidden = true;
    const ctxAdd = document.createElement("button");
    ctxAdd.type = "button";
    ctxAdd.className = "dd-item";
    ctxAdd.textContent = "Добавить лист";
    ctxAdd.addEventListener("click", () => {
      this.handlers.onAdd();
      this.closeCtx();
    });
    const sep = document.createElement("div");
    sep.className = "dd-sep";
    this.ctxDel = document.createElement("button");
    this.ctxDel.type = "button";
    this.ctxDel.className = "dd-item";
    this.ctxDel.textContent = "Удалить лист";
    this.ctxDel.addEventListener("click", () => {
      if (this.ctxTarget) this.handlers.onRemove(this.ctxTarget);
      this.closeCtx();
    });
    this.ctxMenu.append(ctxAdd, sep, this.ctxDel);
    this.ctxMenu.addEventListener("click", (e) => e.stopPropagation());
    document.body.append(this.ctxMenu);
    document.addEventListener("click", () => this.closeCtx());

    this.render();
  }

  private showCtx(x: number, y: number, pageId: string): void {
    this.ctxTarget = pageId;
    this.ctxDel.disabled = this.project.pages.length <= 1;
    this.ctxMenu.style.left = `${x}px`;
    this.ctxMenu.style.top = `${y}px`;
    this.ctxMenu.hidden = false;
  }

  private closeCtx(): void {
    this.ctxMenu.hidden = true;
    this.ctxTarget = null;
  }

  /** Перерисовать дерево (после добавления/удаления/переключения листа). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    this.treeEl.replaceChildren();

    const root = this.folder(this.treeEl, `Проект «${this.project.name}»`, 0, true, groupIcon());
    const doc = this.folder(root, "Схема электрическая", 1, true, groupIcon());

    this.project.pages.forEach((page, i) => {
      const row = this.pageRow(doc, page.id, `Лист ${i + 1} · ${page.format.name}`, 2);
      if (page.id === this.project.activePageId) row.classList.add("active");
    });
    this.addRow(doc, "+ Лист", 2);

    for (const t of ["Шкафы", "Распределительные схемы", "Отчёты", "Прочие документы"]) {
      this.folder(root, t, 1, false, groupIcon(), true);
    }
  }

  private folder(
    parent: HTMLElement,
    title: string,
    depth: number,
    expanded: boolean,
    icon: SVGSVGElement,
    dim = false,
  ): HTMLElement {
    const node = document.createElement("div");
    node.className = "tree-node folder" + (dim ? " dim" : "");
    node.style.paddingLeft = `${4 + depth * 12}px`;

    const tw = document.createElement("span");
    tw.className = "tree-exp";
    tw.textContent = expanded ? "−" : "+";
    const ico = document.createElement("span");
    ico.className = "tree-ico";
    ico.append(icon);
    const label = document.createElement("span");
    label.textContent = title;
    node.append(tw, ico, label);

    const children = document.createElement("div");
    children.className = "tree-children";
    children.hidden = !expanded;

    node.addEventListener("click", () => {
      children.hidden = !children.hidden;
      tw.textContent = children.hidden ? "+" : "−";
    });

    parent.append(node, children);
    return children;
  }

  /**
   * Строка листа: иконка + название. Клик — выбрать (и сфокусировать).
   * Удаление: ПКМ → контекстное меню, либо Del на выбранном (сфокусированном) листе.
   */
  private pageRow(parent: HTMLElement, pageId: string, title: string, depth: number): HTMLElement {
    const node = document.createElement("div");
    node.className = "tree-node sheet";
    node.tabIndex = 0;
    node.title = "ПКМ или Del — удалить лист";
    node.style.paddingLeft = `${4 + depth * 12 + 12}px`;

    const ico = document.createElement("span");
    ico.className = "tree-ico";
    ico.append(pageIcon());
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = title;
    node.append(ico, label);

    node.addEventListener("click", () => {
      this.handlers.onSelect(pageId);
      node.focus();
    });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation(); // не пускать Del в глобальный обработчик (удаление символа)
        this.handlers.onRemove(pageId);
      }
    });
    node.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.handlers.onSelect(pageId);
      node.focus();
      this.showCtx(e.clientX, e.clientY, pageId);
    });

    parent.append(node);
    return node;
  }

  /** Строка «+ Лист». */
  private addRow(parent: HTMLElement, title: string, depth: number): void {
    const node = document.createElement("div");
    node.className = "tree-node add";
    node.style.paddingLeft = `${4 + depth * 12 + 12}px`;
    node.textContent = title;
    node.addEventListener("click", () => this.handlers.onAdd());
    parent.append(node);
  }
}
