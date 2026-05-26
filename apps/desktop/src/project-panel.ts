/**
 * Левый док — структура проекта (аналог «Workspace» в See Electrical):
 * дерево Проект → документ → листы. Листы можно добавлять (+), удалять (×, кроме
 * последнего) и переключать кликом. Разделы «Шкафы»/«Отчёты» — заглушки под будущие спринты.
 */
import type { Page, Project } from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ProjectPanelHandlers {
  /** Открыть/активировать лист (добавляет вкладку). */
  onSelect: (project: Project, page: Page) => void;
  onAdd: (project: Project) => void;
  onRemove: (project: Project, page: Page) => void;
  /** Задать наименование листа (показывается в штампе и дереве). */
  onRenameSheet: (project: Project, page: Page) => void;
  /** Открыть настройки проекта (focusName — сразу фокус на поле имени, для «Переименовать»). */
  onSettings: (project: Project, focusName: boolean) => void;
  /** Закрыть проект (убрать из рабочего пространства). */
  onCloseProject?: (project: Project) => void;
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
  private readonly rootCtxMenu: HTMLElement;
  private readonly rootClose: HTMLButtonElement;
  private ctxProject: Project | null = null;
  private ctxPage: Page | null = null;

  constructor(
    container: HTMLElement,
    private readonly projects: Project[],
    private readonly handlers: ProjectPanelHandlers,
    /** id активной (показываемой) страницы — для подсветки. */
    private readonly activePageId: () => string | null,
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
      if (this.ctxProject) this.handlers.onAdd(this.ctxProject);
      this.closeCtx();
    });
    const ctxRename = document.createElement("button");
    ctxRename.type = "button";
    ctxRename.className = "dd-item";
    ctxRename.textContent = "Наименование листа…";
    ctxRename.addEventListener("click", () => {
      if (this.ctxProject && this.ctxPage)
        this.handlers.onRenameSheet(this.ctxProject, this.ctxPage);
      this.closeCtx();
    });
    const sep = document.createElement("div");
    sep.className = "dd-sep";
    this.ctxDel = document.createElement("button");
    this.ctxDel.type = "button";
    this.ctxDel.className = "dd-item";
    this.ctxDel.textContent = "Удалить лист";
    this.ctxDel.addEventListener("click", () => {
      if (this.ctxProject && this.ctxPage) this.handlers.onRemove(this.ctxProject, this.ctxPage);
      this.closeCtx();
    });
    this.ctxMenu.append(ctxAdd, ctxRename, sep, this.ctxDel);
    this.ctxMenu.addEventListener("click", (e) => e.stopPropagation());
    document.body.append(this.ctxMenu);

    // контекстное меню корневого проекта (ПКМ)
    this.rootCtxMenu = document.createElement("div");
    this.rootCtxMenu.className = "dropdown";
    this.rootCtxMenu.hidden = true;
    const item = (text: string, onClick?: () => void): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dd-item";
      b.textContent = text;
      if (onClick) {
        b.addEventListener("click", () => {
          onClick();
          this.closeCtx();
        });
      } else {
        b.disabled = true;
        b.title = "Будет в следующих версиях";
      }
      return b;
    };
    const rootSep = document.createElement("div");
    rootSep.className = "dd-sep";
    this.rootClose = item("Закрыть проект", () => {
      if (this.ctxProject) this.handlers.onCloseProject?.(this.ctxProject);
    });
    this.rootCtxMenu.append(
      item("Копировать"),
      this.rootClose,
      item("Переименовать", () => {
        if (this.ctxProject) this.handlers.onSettings(this.ctxProject, true);
      }),
      rootSep,
      item("Настройки", () => {
        if (this.ctxProject) this.handlers.onSettings(this.ctxProject, false);
      }),
    );
    this.rootCtxMenu.addEventListener("click", (e) => e.stopPropagation());
    document.body.append(this.rootCtxMenu);

    document.addEventListener("click", () => this.closeCtx());

    this.render();
  }

  private showCtx(x: number, y: number, project: Project, page: Page): void {
    this.ctxProject = project;
    this.ctxPage = page;
    this.ctxDel.disabled = project.pages.length <= 1;
    this.ctxMenu.style.left = `${x}px`;
    this.ctxMenu.style.top = `${y}px`;
    this.ctxMenu.hidden = false;
  }

  private showRootCtx(x: number, y: number, project: Project): void {
    this.ctxProject = project;
    this.rootClose.disabled = this.projects.length <= 1; // последний проект не закрываем
    this.rootCtxMenu.style.left = `${x}px`;
    this.rootCtxMenu.style.top = `${y}px`;
    this.rootCtxMenu.hidden = false;
  }

  private closeCtx(): void {
    this.ctxMenu.hidden = true;
    this.rootCtxMenu.hidden = true;
    this.ctxProject = null;
    this.ctxPage = null;
  }

  /** Перерисовать дерево (после добавления/удаления/переключения листа/проекта). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    this.treeEl.replaceChildren();
    const activeId = this.activePageId();
    for (const project of this.projects) this.renderProject(project, activeId);
  }

  private renderProject(project: Project, activeId: string | null): void {
    const root = this.folder(
      this.treeEl,
      `Проект «${project.name}»`,
      0,
      true,
      groupIcon(),
      false,
      (e) => this.showRootCtx(e.clientX, e.clientY, project),
    );
    const doc = this.folder(root, "Схема электрическая", 1, true, groupIcon());

    project.pages.forEach((page, i) => {
      const name = page.titleBlock.title ? ` · ${page.titleBlock.title}` : "";
      const row = this.pageRow(doc, project, page, `Лист ${i + 1} · ${page.format.name}${name}`, 2);
      if (page.id === activeId) row.classList.add("active");
    });
    this.addRow(doc, project, "+ Лист", 2);

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
    onContext?: (e: MouseEvent) => void,
  ): HTMLElement {
    const node = document.createElement("div");
    node.className = "tree-node folder" + (dim ? " dim" : "");
    node.style.paddingLeft = `${4 + depth * 12}px`;
    if (onContext) {
      node.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onContext(e);
      });
    }

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
  private pageRow(
    parent: HTMLElement,
    project: Project,
    page: Page,
    title: string,
    depth: number,
  ): HTMLElement {
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
      this.handlers.onSelect(project, page);
      node.focus();
    });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation(); // не пускать Del в глобальный обработчик (удаление символа)
        this.handlers.onRemove(project, page);
      }
    });
    node.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.handlers.onSelect(project, page);
      node.focus();
      this.showCtx(e.clientX, e.clientY, project, page);
    });

    parent.append(node);
    return node;
  }

  /** Строка «+ Лист». */
  private addRow(parent: HTMLElement, project: Project, title: string, depth: number): void {
    const node = document.createElement("div");
    node.className = "tree-node add";
    node.style.paddingLeft = `${4 + depth * 12 + 12}px`;
    node.textContent = title;
    node.addEventListener("click", () => this.handlers.onAdd(project));
    parent.append(node);
  }
}
