/**
 * SVG-канвас Фазы 0: pan/zoom, сетка, привязка к сетке, постановка узла (через command-стек).
 * Вся логика модели — в `@see/core`; здесь только рендер и ввод. Оболочка (Tauri/Electron)
 * не используется — это обычный web, готовый к обёртке на Фазе 0.5.
 */
import {
  PX_PER_MM,
  snapPoint,
  AddNodeCommand,
  type Page,
  type Point,
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

  private readonly content: SVGGElement;
  private readonly nodesG: SVGGElement;
  private readonly cursorMarker: SVGCircleElement;
  private readonly bg: SVGRectElement;
  private readonly gridPattern: SVGPatternElement;
  private readonly gridPath: SVGPathElement;

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

    this.bg = el("rect", { x: 0, y: 0, width: 0, height: 0, fill: "url(#grid)" });

    this.content = el("g");
    const origin = el("circle", { cx: 0, cy: 0, r: 0.9, fill: "#e0534f" });
    this.nodesG = el("g");
    this.cursorMarker = el("circle", {
      r: 1.6,
      fill: "none",
      stroke: "#1b6fc4",
      "stroke-width": 0.4,
      visibility: "hidden",
    });
    this.content.append(origin, this.nodesG, this.cursorMarker);

    svg.append(defs, this.bg, this.content);

    this.installEvents();
    this.resize();
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

  resetView(): void {
    const r = this.svg.getBoundingClientRect();
    this.zoom = 1;
    this.panX = r.width / 2;
    this.panY = r.height / 2;
    this.updateView();
  }

  private resize(): void {
    const r = this.svg.getBoundingClientRect();
    this.bg.setAttribute("width", String(r.width));
    this.bg.setAttribute("height", String(r.height));
  }

  private updateView(): void {
    const s = this.scalePx;
    this.content.setAttribute(
      "transform",
      `translate(${this.panX} ${this.panY}) scale(${s})`,
    );

    // адаптивный шаг: загрубляем сетку, пока ячейка не станет >= 8 px
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
      `Zoom ${Math.round(this.zoom * 100)}%  ·  ` +
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
        // удержать мировую точку под курсором
        this.panX = sx - before.x * this.scalePx;
        this.panY = sy - before.y * this.scalePx;
        this.updateView();
        this.updateCursor();
      },
      { passive: false },
    );

    svg.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("resize", () => {
      this.resize();
      this.updateView();
    });
  }
}
