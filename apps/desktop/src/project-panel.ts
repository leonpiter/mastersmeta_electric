/**
 * Левый док — структура проекта (аналог «Workspace» в See Electrical):
 * заголовок, дерево-аккордеон Проект → документы → листы (иконки групп/листов),
 * вкладки снизу. Сейчас один лист (S2); прочие разделы — заглушки под будущие спринты.
 */
import type { Page } from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(
  tag: string,
  attrs: Record<string, string>,
): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Голубая иконка группы документов (стопка листов). */
function groupIcon(): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 16 13", width: "15", height: "13" }) as SVGSVGElement;
  svg.append(
    svgEl("rect", { x: "2", y: "1", width: "8", height: "10", fill: "#dfeaf8", stroke: "#3f78c0", "stroke-width": "0.8" }),
    svgEl("rect", { x: "5", y: "3", width: "8", height: "10", fill: "#eef4fb", stroke: "#3f78c0", "stroke-width": "0.8" }),
  );
  return svg;
}

/** Иконка листа (страница). */
function pageIcon(): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 12 14", width: "12", height: "14" }) as SVGSVGElement;
  svg.append(
    svgEl("path", { d: "M2 1H7.5L10 3.5V13H2Z", fill: "#fff", stroke: "#8893a4", "stroke-width": "0.8" }),
    svgEl("path", { d: "M7.5 1V3.5H10", fill: "none", stroke: "#8893a4", "stroke-width": "0.8" }),
    svgEl("line", { x1: "3.5", y1: "6.5", x2: "8", y2: "6.5", stroke: "#b4bcc8", "stroke-width": "0.7" }),
    svgEl("line", { x1: "3.5", y1: "8.5", x2: "8", y2: "8.5", stroke: "#b4bcc8", "stroke-width": "0.7" }),
    svgEl("line", { x1: "3.5", y1: "10.5", x2: "6.5", y2: "10.5", stroke: "#b4bcc8", "stroke-width": "0.7" }),
  );
  return svg;
}

export class ProjectPanel {
  constructor(container: HTMLElement, page: Page) {
    container.replaceChildren();

    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Структура";
    container.append(header);

    const tree = document.createElement("div");
    tree.className = "tree";
    container.append(tree);

    const root = this.folder(tree, "Проект «Без имени»", 0, true, groupIcon());
    const doc = this.folder(root, "Схема электрическая", 1, true, groupIcon());
    const sheet = this.leaf(doc, `Лист 1 · ${page.format.name}`, 2, pageIcon());
    sheet.classList.add("active");
    sheet.addEventListener("click", () => {
      tree
        .querySelectorAll(".tree-node.active")
        .forEach((n) => n.classList.remove("active"));
      sheet.classList.add("active");
    });

    // заглушки будущих разделов (S6/S7/S10)
    for (const t of ["Шкафы", "Распределительные схемы", "Отчёты", "Прочие документы"]) {
      this.folder(root, t, 1, false, groupIcon(), true);
    }

    // вкладки снизу (как в See Electrical: Workspace | Components | Commands)
    const tabs = document.createElement("div");
    tabs.className = "ws-tabs";
    ["Структура", "Компоненты", "Команды"].forEach((t, i) => {
      const tab = document.createElement("div");
      tab.className = "ws-tab" + (i === 0 ? " active" : " dim");
      tab.textContent = t;
      tabs.append(tab);
    });
    container.append(tabs);
  }

  /** Папка с твисти + иконкой; возвращает контейнер дочерних узлов. */
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

  /** Лист дерева (без твисти, с иконкой). */
  private leaf(
    parent: HTMLElement,
    title: string,
    depth: number,
    icon: SVGSVGElement,
  ): HTMLElement {
    const node = document.createElement("div");
    node.className = "tree-node sheet";
    node.style.paddingLeft = `${4 + depth * 12 + 12}px`;
    const ico = document.createElement("span");
    ico.className = "tree-ico";
    ico.append(icon);
    const label = document.createElement("span");
    label.textContent = title;
    node.append(ico, label);
    parent.append(node);
    return node;
  }
}
