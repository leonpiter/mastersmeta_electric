/**
 * Лента открытых страниц (S26): вкладки документов под лентой инструментов, над
 * канвасом. Вкладка = «проект / лист». Можно держать открытыми листы из разных
 * проектов. Клик — активировать, × — закрыть.
 */
import type { Page, Project } from "@see/core";

export interface OpenTab {
  project: Project;
  page: Page;
}

export interface PageTabsHandlers {
  onActivate: (page: Page) => void;
  onClose: (page: Page) => void;
}

export class PageTabs {
  constructor(
    private readonly el: HTMLElement,
    private readonly handlers: PageTabsHandlers,
  ) {}

  render(tabs: OpenTab[], active: Page | null): void {
    this.el.replaceChildren();
    for (const { project, page } of tabs) {
      const tab = document.createElement("div");
      tab.className = "ptab" + (page === active ? " active" : "");
      tab.title = `${project.name} · лист`;

      const label = document.createElement("span");
      label.className = "ptab-label";
      const idx = project.pages.indexOf(page) + 1;
      label.textContent = `${project.name} / Лист ${idx}`;
      label.addEventListener("click", () => this.handlers.onActivate(page));

      const close = document.createElement("button");
      close.type = "button";
      close.className = "ptab-close";
      close.textContent = "×";
      close.title = "Закрыть страницу";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlers.onClose(page);
      });

      tab.append(label, close);
      this.el.append(tab);
    }
  }
}
