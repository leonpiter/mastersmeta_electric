/**
 * SVG-канвас: pan/zoom, лист (ГОСТ 2.301/2.104), полупрозрачная клетка-привязка, постановка узлов.
 * Слои (снизу вверх): спокойный «стол» (CSS) → тень → белая бумага → клетка (в пределах листа) →
 * рамка/зоны/штамп/узлы. Вся логика модели — в `@see/core`; здесь только рендер и ввод.
 */
import {
  PX_PER_MM,
  snapPoint,
  AddNodeCommand,
  frameRect,
  zoneGrid,
  TITLE_BLOCK_SIZE,
  type Page,
  type Point,
  type Rect,
  type TitleBlock,
  type CommandStack,
} from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node as SVGElementTagNameMap[K];
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

interface PointerDown {
  x: number;
  y: number;
  button: number;
  moved: boolean;
}

export class CanvasView {
  private panX = 0;
  private panY = 0;
  private zoom = 1;

  /** Показывать ли клетку (в будущем — переключатель в UI). */
  private gridVisible = true;

  private readonly paperShadow: SVGRectElement;
  private readonly paper: SVGRectElement;
  private readonly grid: SVGRectElement;
  private readonly gridPattern: SVGPatternElement;
  private readonly gridPath: SVGPathElement;
  private readonly content: SVGGElement;
  private readonly sheetG: SVGGElement;
  private readonly nodesG: SVGGElement;
  private readonly cursorMarker: SVGCircleElement;

  private last: Point = { x: 0, y: 0 };
  private down: PointerDown | null = null;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly page: Page,
    private readonly stack: CommandStack,
    private readonly hud: HTMLElement,
  ) {
    const defs = el("defs");
    this.gridPattern = el("pattern", {
      id: "grid",
      patternUnits: "userSpaceOnUse",
      width: 1,
      height: 1,
    });
    this.gridPath = el("path", {
      d: "",
      stroke: "#dde3ec",
      "stroke-width": 1,
      fill: "none",
      "shape-rendering": "crispEdges",
    });
    this.gridPattern.append(this.gridPath);
    defs.append(this.gridPattern);

    // лист: тень → белая бумага → полупрозрачная клетка (всё в экранных координатах,
    // совпадает с прямоугольником листа → клетка не выходит за границы листа)
    this.paperShadow = el("rect", { fill: "#00000022" });
    this.paper = el("rect", { fill: "#ffffff" });
    this.grid = el("rect", { fill: "url(#grid)" });

    this.content = el("g");
    this.sheetG = el("g");
    this.nodesG = el("g");
    this.cursorMarker = el("circle", {
      r: 1.6,
      fill: "none",
      stroke: "#1b6fc4",
      "stroke-width": 0.4,
      visibility: "hidden",
    });
    this.content.append(this.sheetG, this.nodesG, this.cursorMarker);

    svg.append(defs, this.paperShadow, this.paper, this.grid, this.content);

    this.installEvents();
    this.renderSheet();
    this.resetView();
    this.renderNodes();
    this.stack.subscribe(() => {
      this.renderNodes();
      this.updateHud();
    });
  }

  private get scalePx(): number {
    return PX_PER_MM * this.zoom;
  }

  private screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.panX) / this.scalePx,
      y: (sy - this.panY) / this.scalePx,
    };
  }

  /** Вписать лист в окно. */
  resetView(): void {
    const r = this.svg.getBoundingClientRect();
    const f = this.page.format;
    const margin = 0.92;
    const zx = (r.width * margin) / (f.width * PX_PER_MM);
    const zy = (r.height * margin) / (f.height * PX_PER_MM);
    this.zoom = clamp(Math.min(zx, zy), 0.05, 64);
    this.panX = (r.width - f.width * this.scalePx) / 2;
    this.panY = (r.height - f.height * this.scalePx) / 2;
    this.updateView();
  }

  /** Экспорт листа в PDF через печать браузера (Save as PDF), масштаб 1:1 в мм. */
  exportPdf(): void {
    const f = this.page.format;
    const ser = new XMLSerializer();
    const body =
      ser.serializeToString(this.sheetG) + ser.serializeToString(this.nodesG);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.width} ${f.height}" ` +
      `width="${f.width}mm" height="${f.height}mm">${body}</svg>`;
    const tb = this.page.titleBlock;
    const title = tb.designation || tb.title || "Лист";
    const printJs = "window.onload=function(){window.focus();window.print();};";
    const html =
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title} · ${f.name}</title>` +
      `<style>@page{size:${f.width}mm ${f.height}mm;margin:0}html,body{margin:0}svg{display:block}</style>` +
      `</head><body>${svg}<script>${printJs}</` +
      `script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const win = window.open(url, "_blank");
    if (!win) {
      window.alert("Разрешите всплывающие окна, чтобы экспортировать лист в PDF.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  private updateView(): void {
    const s = this.scalePx;
    const f = this.page.format;
    this.content.setAttribute(
      "transform",
      `translate(${this.panX} ${this.panY}) scale(${s})`,
    );

    // лист (бумага/тень/клетка) — в экранных координатах = прямоугольник листа
    const w = f.width * s;
    const h = f.height * s;
    for (const [rect, dx, dy] of [
      [this.paperShadow, 3, 3],
      [this.paper, 0, 0],
      [this.grid, 0, 0],
    ] as const) {
      rect.setAttribute("x", String(this.panX + dx));
      rect.setAttribute("y", String(this.panY + dy));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
    }
    this.grid.setAttribute("visibility", this.gridVisible ? "visible" : "hidden");

    // адаптивный шаг: загрубляем клетку, пока ячейка не станет >= 8 px
    let step = this.page.gridStep;
    let tile = step * s;
    while (tile < 8) {
      step *= 2;
      tile = step * s;
    }
    const ox = ((this.panX % tile) + tile) % tile;
    const oy = ((this.panY % tile) + tile) % tile;
    this.gridPattern.setAttribute("width", String(tile));
    this.gridPattern.setAttribute("height", String(tile));
    this.gridPattern.setAttribute("patternTransform", `translate(${ox} ${oy})`);
    this.gridPath.setAttribute("d", `M 0 0 H ${tile} M 0 0 V ${tile}`);

    this.updateHud();
  }

  // ----- лист (ГОСТ) -----

  private text(
    s: string,
    x: number,
    y: number,
    size: number,
    anchor: "middle" | "start" | "end" = "middle",
    bold = false,
  ): SVGTextElement {
    const t = el("text", {
      x,
      y,
      "font-size": size,
      fill: "#222",
      "text-anchor": anchor,
      "dominant-baseline": "middle",
      "font-family": "sans-serif",
    });
    if (bold) t.setAttribute("font-weight", "bold");
    t.textContent = s;
    return t;
  }

  private renderSheet(): void {
    const f = this.page.format;
    const g = this.sheetG;
    g.replaceChildren();

    // тонкая граница бумаги
    g.append(el("rect", { x: 0, y: 0, width: f.width, height: f.height, fill: "none", stroke: "#b9c2cf", "stroke-width": 0.3 }));

    // внутренняя рамка (толстая, ГОСТ 2.301)
    const fr = frameRect(f);
    g.append(el("rect", { x: fr.x, y: fr.y, width: fr.w, height: fr.h, fill: "none", stroke: "#222", "stroke-width": 0.5 }));

    // зонная сетка (ГОСТ 2.104): тики + метки
    const zg = zoneGrid(f);
    const tick = 4;
    for (let i = 1; i < zg.cols; i++) {
      const x = zg.colX[i]!;
      g.append(el("line", { x1: x, y1: fr.y, x2: x, y2: fr.y + tick, stroke: "#888", "stroke-width": 0.25 }));
      g.append(el("line", { x1: x, y1: fr.y + fr.h - tick, x2: x, y2: fr.y + fr.h, stroke: "#888", "stroke-width": 0.25 }));
    }
    for (let i = 0; i < zg.cols; i++) {
      const cx = (zg.colX[i]! + zg.colX[i + 1]!) / 2;
      g.append(this.text(String(i + 1), cx, fr.y + tick / 2 + 0.5, 3));
      g.append(this.text(String(i + 1), cx, fr.y + fr.h - tick / 2 - 0.5, 3));
    }
    for (let i = 1; i < zg.rows; i++) {
      const y = zg.rowY[i]!;
      g.append(el("line", { x1: fr.x, y1: y, x2: fr.x + tick, y2: y, stroke: "#888", "stroke-width": 0.25 }));
      g.append(el("line", { x1: fr.x + fr.w - tick, y1: y, x2: fr.x + fr.w, y2: y, stroke: "#888", "stroke-width": 0.25 }));
    }
    for (let i = 0; i < zg.rows; i++) {
      const cy = (zg.rowY[i]! + zg.rowY[i + 1]!) / 2;
      const letter = String.fromCharCode(65 + i);
      g.append(this.text(letter, fr.x + tick / 2, cy, 3));
      g.append(this.text(letter, fr.x + fr.w - tick / 2, cy, 3));
    }

    this.renderTitleBlock(g, fr);
  }

  /** Основная надпись (ГОСТ 2.104, Форма 1) — разметка приближённая, заполняется из проекта. */
  private renderTitleBlock(g: SVGGElement, fr: Rect): void {
    const tb: TitleBlock = this.page.titleBlock;
    const W = TITLE_BLOCK_SIZE.width;
    const H = TITLE_BLOCK_SIZE.height;
    const tx = fr.x + fr.w - W;
    const ty = fr.y + fr.h - H;

    const box = (x: number, y: number, w: number, h: number, thick = false): void => {
      g.append(el("rect", {
        x: tx + x, y: ty + y, width: w, height: h,
        fill: "none", stroke: thick ? "#222" : "#555", "stroke-width": thick ? 0.5 : 0.3,
      }));
    };
    const lab = (x: number, y: number, s: string): void => {
      g.append(this.text(s, tx + x + 1, ty + y + 2.4, 2.2, "start"));
    };
    const val = (x: number, y: number, w: number, h: number, s: string, size = 3, bold = false): void => {
      if (s) g.append(this.text(s, tx + x + w / 2, ty + y + h / 2, size, "middle", bold));
    };

    box(0, 0, W, H, true);

    const roles = ["Разраб.", "Пров.", "Т.контр.", "Н.контр.", "Утв."];
    const names = [tb.developer, tb.checker, "", "", ""];
    for (let r = 0; r < 5; r++) {
      const y = r * 11;
      box(0, y, 25, 11);
      box(25, y, 20, 11);
      box(45, y, 10, 11);
      box(55, y, 10, 11);
      lab(0, y, roles[r]!);
      val(25, y, 20, 11, names[r]!, 2.6);
    }

    box(65, 0, 95, 16);
    val(65, 0, 95, 16, tb.designation, 3.6, true);
    box(65, 16, 95, 28);
    val(65, 16, 95, 28, tb.title, 4.2);
    box(65, 44, 95, 11);
    val(65, 44, 95, 11, tb.company, 3);

    box(160, 0, 25, 8); lab(160, 0, "Масштаб"); val(160, 2.5, 25, 5.5, tb.scale, 3);
    box(160, 8, 25, 8); lab(160, 8, "Масса"); val(160, 10.5, 25, 5.5, tb.mass, 3);
    box(160, 16, 25, 8); lab(160, 16, "Лит."); val(160, 18.5, 25, 5.5, tb.letter, 3);
    box(160, 24, 25, 15.5); lab(160, 24, "Лист"); val(160, 28, 25, 11, String(tb.sheet), 3.5);
    box(160, 39.5, 25, 15.5); lab(160, 39.5, "Листов"); val(160, 44, 25, 11, String(tb.sheetsTotal), 3.5);
  }

  private renderNodes(): void {
    this.nodesG.replaceChildren();
    for (const n of this.page.nodes) {
      this.nodesG.append(el("circle", { cx: n.x, cy: n.y, r: 1.5, fill: "#1b6fc4" }));
    }
  }

  private updateCursor(): void {
    const p = snapPoint(this.last, this.page.gridStep);
    this.cursorMarker.setAttribute("cx", String(p.x));
    this.cursorMarker.setAttribute("cy", String(p.y));
    this.cursorMarker.setAttribute("visibility", "visible");
    this.updateHud();
  }

  private updateHud(): void {
    const fmt = (v: number): string => v.toFixed(1);
    this.hud.textContent =
      `${this.page.format.name}  ·  Zoom ${Math.round(this.zoom * 100)}%  ·  ` +
      `Курсор ${fmt(this.last.x)}, ${fmt(this.last.y)} мм  ·  ` +
      `Узлов: ${this.page.nodes.length}`;
  }

  private installEvents(): void {
    const svg = this.svg;

    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
    });

    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      this.last = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      this.updateCursor();

      if (this.down) {
        if (
          !this.down.moved &&
          Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 3
        ) {
          this.down.moved = true;
        }
        if (this.down.moved && (this.down.button === 0 || this.down.button === 1)) {
          this.panX += e.movementX;
          this.panY += e.movementY;
          this.updateView();
        }
      }
    });

    svg.addEventListener("pointerup", () => {
      if (this.down && this.down.button === 0 && !this.down.moved) {
        const p = snapPoint(this.last, this.page.gridStep);
        this.stack.execute(new AddNodeCommand(this.page, p.x, p.y));
      }
      this.down = null;
    });

    svg.addEventListener("pointerleave", () => {
      this.cursorMarker.setAttribute("visibility", "hidden");
    });

    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const before = this.screenToWorld(sx, sy);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.zoom = clamp(this.zoom * factor, 0.05, 64);
        this.panX = sx - before.x * this.scalePx;
        this.panY = sy - before.y * this.scalePx;
        this.updateView();
        this.updateCursor();
      },
      { passive: false },
    );

    svg.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("resize", () => this.updateView());
  }
}
