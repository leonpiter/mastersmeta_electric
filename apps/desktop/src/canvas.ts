/**
 * SVG-канвас: pan/zoom, лист (ГОСТ 2.301/2.104), полупрозрачная клетка-привязка, постановка узлов.
 * Слои (снизу вверх): спокойный «стол» (CSS) → тень → белая бумага → клетка (в пределах листа) →
 * рамка/зоны/штамп/узлы. Вся логика модели — в `@see/core`; здесь только рендер и ввод.
 */
import {
  PX_PER_MM,
  snapPoint,
  frameRect,
  zoneGrid,
  TITLE_BLOCK_SIZE,
  symbolBounds,
  transformLocalPoint,
  AddSymbolInstanceCommand,
  RotateInstanceCommand,
  MirrorInstanceCommand,
  RemoveInstanceCommand,
  MoveInstanceCommand,
  AddWireCommand,
  AddWiresCommand,
  RemoveWireCommand,
  SplitWireCommand,
  MacroCommand,
  MoveWireEndpointCommand,
  AutoNumberCommand,
  ClearNumbersCommand,
  computeJunctions,
  computeNets,
  instancePins,
  pointOnSegment,
  type AutoNumberOptions,
  DEFAULT_WIRE_WIDTH_POWER,
  DEFAULT_WIRE_WIDTH_CONTROL,
  type Command,
  type Page,
  type Wire,
  type Point,
  type Rect,
  type TitleBlock,
  type CommandStack,
  type SymbolDef,
  type SymbolInstance,
  type SymbolLibrary,
  type Rotation,
} from "@see/core";
import { symbolToSvg } from "./symbol-render";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Колбэки канваса наружу (для синхронизации панели библиотеки и диалога свойств). */
export interface CanvasHooks {
  /** Сменился взведённый для вставки символ (или снят — `null`). */
  onArmedChange?: (symbolId: string | null) => void;
  /** Запрос на редактирование свойств инстанса (двойной клик). */
  onRequestEdit?: (inst: SymbolInstance) => void;
  /** Включён/выключен инструмент «Провод» (poles — число полюсов: 1 или 3). */
  onWireModeChange?: (active: boolean, poles: 1 | 3) => void;
  /** Запрос на редактирование свойств провода (двойной клик). */
  onRequestEditWire?: (wire: Wire) => void;
}

/** Шаг между полюсами 3-полюсного провода (мм). */
const WIRE_PHASE_STEP = 5;

/** Параллельные отрезки со смещением перпендикулярно на `step·k` (k = 0..count-1). */
function parallelSegments(a: Point, b: Point, count: number, step: number): Point[][] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const polys: Point[][] = [];
  for (let k = 0; k < count; k++) {
    const ox = nx * step * k;
    const oy = ny * step * k;
    polys.push([
      { x: a.x + ox, y: a.y + oy },
      { x: b.x + ox, y: b.y + oy },
    ]);
  }
  return polys;
}

/** Расстояние от точки до отрезка (мм). */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

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
  private readonly wiresG: SVGGElement;
  private readonly instancesG: SVGGElement;
  private readonly overlayG: SVGGElement;
  private readonly nodesG: SVGGElement;
  private readonly ghostG: SVGGElement;
  private readonly cursorMarker: SVGCircleElement;

  private last: Point = { x: 0, y: 0 };
  private down: PointerDown | null = null;

  // --- расстановка символов (S2) ---
  /** Взведённый для вставки символ (режим вставки). */
  private armed: SymbolDef | null = null;
  /** Выбранный инстанс на листе (для поворота/зеркала/удаления). */
  private selected: SymbolInstance | null = null;
  /** Выбранный провод (для удаления/свойств). */
  private selectedWire: Wire | null = null;
  /** Ориентация для следующей вставки. */
  private pendingRotation: Rotation = 0;
  private pendingMirror = false;
  /** Режим рисования провода и его текущая стартовая точка (цепочка). */
  private wireMode = false;
  private wireStart: Point | null = null;
  /** Число полюсов провода: 1 (1-Wire) или 3 (3-Wire, шаг 5 мм). */
  private wirePoles: 1 | 3 = 1;
  /** Визуальная толщина проводов, мм (на весь проект): раздельно силовые/управление. */
  private wireWidthPower = DEFAULT_WIRE_WIDTH_POWER;
  private wireWidthControl = DEFAULT_WIRE_WIDTH_CONTROL;
  /** Текущее перетаскивание инстанса. */
  private dragging: {
    inst: SymbolInstance;
    originX: number;
    originY: number;
    grabDX: number;
    grabDY: number;
  } | null = null;

  constructor(
    private readonly svg: SVGSVGElement,
    private page: Page,
    private readonly stack: CommandStack,
    private readonly hud: HTMLElement,
    private readonly library: SymbolLibrary,
    private readonly hooks: CanvasHooks = {},
  ) {
    const defs = el("defs");
    this.gridPattern = el("pattern", {
      id: "see-grid-pattern",
      patternUnits: "userSpaceOnUse",
      width: 1,
      height: 1,
    });
    this.gridPath = el("path", {
      d: "",
      stroke: "#c4ccd8",
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
    this.grid = el("rect", { fill: "url(#see-grid-pattern)" });

    this.content = el("g");
    this.sheetG = el("g");
    this.wiresG = el("g");
    this.instancesG = el("g");
    this.overlayG = el("g");
    this.nodesG = el("g");
    this.ghostG = el("g");
    this.cursorMarker = el("circle", {
      r: 1.6,
      fill: "none",
      stroke: "#1b6fc4",
      "stroke-width": 0.4,
      visibility: "hidden",
    });
    // снизу вверх: лист → провода → символы → выделение/подписи → узлы → курсор → «призрак»
    this.content.append(
      this.sheetG,
      this.wiresG,
      this.instancesG,
      this.overlayG,
      this.nodesG,
      this.cursorMarker,
      this.ghostG,
    );

    svg.append(defs, this.paperShadow, this.paper, this.grid, this.content);

    this.installEvents();
    this.renderSheet();
    this.resetView();
    this.renderWires();
    this.renderInstances();
    this.renderNodes();
    this.stack.subscribe(() => {
      this.renderWires();
      this.renderInstances();
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

  /** Показать/скрыть клетку. */
  setGridVisible(v: boolean): void {
    this.gridVisible = v;
    this.updateView();
  }

  /** Задать шаг сетки (мм) — он же шаг привязки. */
  setGridStep(step: number): void {
    if (step > 0) {
      this.page.gridStep = step;
      this.updateView();
    }
  }

  get gridShown(): boolean {
    return this.gridVisible;
  }

  get gridStepMm(): number {
    return this.page.gridStep;
  }

  /** Толщина проводов (мм): раздельно силовые/управление. */
  setWireWidths(power: number, control: number): void {
    this.wireWidthPower = power;
    this.wireWidthControl = control;
    this.renderWires();
  }

  /** Перерисовать слой проводов (живое превью свойств провода). */
  rerenderWires(): void {
    this.renderWires();
  }

  /** Автонумерация цепей (ГОСТ 2.709): по потенциалам или по проводам. Обратима. */
  autoNumber(opts: AutoNumberOptions = {}): void {
    this.stack.execute(new AutoNumberCommand(this.page, this.library, opts));
  }

  /** Очистить номера: «all» — все провода листа; «selected» — цепь выбранного провода. */
  clearNumbers(scope: "all" | "selected"): void {
    if (scope === "selected") {
      const sel = this.selectedWire;
      if (!sel) return;
      const net = computeNets(this.page, this.library).find((n) => n.wireIds.includes(sel.id));
      const wires = net ? this.page.wires.filter((w) => net.wireIds.includes(w.id)) : [sel];
      this.stack.execute(new ClearNumbersCommand(this.page, wires));
    } else {
      this.stack.execute(new ClearNumbersCommand(this.page));
    }
  }

  /** Есть ли выбранный провод (для доступности «Очистить выбранное»). */
  get hasSelectedWire(): boolean {
    return this.selectedWire !== null;
  }

  /** id текущего показываемого листа. */
  get currentPageId(): string {
    return this.page.id;
  }

  /** Переключить показываемый лист: перерисовать и вписать в окно. */
  setPage(page: Page): void {
    this.exitWireMode();
    this.page = page;
    this.selected = null;
    this.selectedWire = null;
    this.armed = null;
    this.hooks.onArmedChange?.(null);
    this.renderSheet();
    this.renderWires();
    this.renderInstances();
    this.renderNodes();
    this.resetView();
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
    const body = ser.serializeToString(this.sheetG) + ser.serializeToString(this.nodesG);
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
    this.content.setAttribute("transform", `translate(${this.panX} ${this.panY}) scale(${s})`);

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
    g.append(
      el("rect", {
        x: 0,
        y: 0,
        width: f.width,
        height: f.height,
        fill: "none",
        stroke: "#b9c2cf",
        "stroke-width": 0.3,
      }),
    );

    // внутренняя рамка (толстая, ГОСТ 2.301)
    const fr = frameRect(f);
    g.append(
      el("rect", {
        x: fr.x,
        y: fr.y,
        width: fr.w,
        height: fr.h,
        fill: "none",
        stroke: "#222",
        "stroke-width": 0.5,
      }),
    );

    // зонная сетка (ГОСТ 2.104): тики + метки
    const zg = zoneGrid(f);
    const tick = 4;
    for (let i = 1; i < zg.cols; i++) {
      const x = zg.colX[i];
      g.append(
        el("line", {
          x1: x,
          y1: fr.y,
          x2: x,
          y2: fr.y + tick,
          stroke: "#888",
          "stroke-width": 0.25,
        }),
      );
      g.append(
        el("line", {
          x1: x,
          y1: fr.y + fr.h - tick,
          x2: x,
          y2: fr.y + fr.h,
          stroke: "#888",
          "stroke-width": 0.25,
        }),
      );
    }
    for (let i = 0; i < zg.cols; i++) {
      const cx = (zg.colX[i] + zg.colX[i + 1]) / 2;
      g.append(this.text(String(i + 1), cx, fr.y + tick / 2 + 0.5, 3));
      g.append(this.text(String(i + 1), cx, fr.y + fr.h - tick / 2 - 0.5, 3));
    }
    for (let i = 1; i < zg.rows; i++) {
      const y = zg.rowY[i];
      g.append(
        el("line", {
          x1: fr.x,
          y1: y,
          x2: fr.x + tick,
          y2: y,
          stroke: "#888",
          "stroke-width": 0.25,
        }),
      );
      g.append(
        el("line", {
          x1: fr.x + fr.w - tick,
          y1: y,
          x2: fr.x + fr.w,
          y2: y,
          stroke: "#888",
          "stroke-width": 0.25,
        }),
      );
    }
    for (let i = 0; i < zg.rows; i++) {
      const cy = (zg.rowY[i] + zg.rowY[i + 1]) / 2;
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
      g.append(
        el("rect", {
          x: tx + x,
          y: ty + y,
          width: w,
          height: h,
          fill: "none",
          stroke: thick ? "#222" : "#555",
          "stroke-width": thick ? 0.5 : 0.3,
        }),
      );
    };
    const lab = (x: number, y: number, s: string): void => {
      g.append(this.text(s, tx + x + 1, ty + y + 2.4, 2.2, "start"));
    };
    const val = (
      x: number,
      y: number,
      w: number,
      h: number,
      s: string,
      size = 3,
      bold = false,
    ): void => {
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
      lab(0, y, roles[r]);
      val(25, y, 20, 11, names[r], 2.6);
    }

    box(65, 0, 95, 16);
    val(65, 0, 95, 16, tb.designation, 3.6, true);
    box(65, 16, 95, 28);
    val(65, 16, 95, 28, tb.title, 4.2);
    box(65, 44, 95, 11);
    val(65, 44, 95, 11, tb.company, 3);

    box(160, 0, 25, 8);
    lab(160, 0, "Масштаб");
    val(160, 2.5, 25, 5.5, tb.scale, 3);
    box(160, 8, 25, 8);
    lab(160, 8, "Масса");
    val(160, 10.5, 25, 5.5, tb.mass, 3);
    box(160, 16, 25, 8);
    lab(160, 16, "Лит.");
    val(160, 18.5, 25, 5.5, tb.letter, 3);
    box(160, 24, 25, 15.5);
    lab(160, 24, "Лист");
    val(160, 28, 25, 11, String(tb.sheet), 3.5);
    box(160, 39.5, 25, 15.5);
    lab(160, 39.5, "Листов");
    val(160, 44, 25, 11, String(tb.sheetsTotal), 3.5);
  }

  private renderNodes(): void {
    this.nodesG.replaceChildren();
    for (const n of this.page.nodes) {
      this.nodesG.append(el("circle", { cx: n.x, cy: n.y, r: 1.5, fill: "#1b6fc4" }));
    }
  }

  private renderWires(): void {
    this.wiresG.replaceChildren();

    // подсветка цепи выбранного провода (вся электрически связанная группа)
    const sel = this.selectedWire;
    const nets = computeNets(this.page, this.library);
    const hiliteNet = sel ? nets.find((n) => n.wireIds.includes(sel.id)) : undefined;
    const hiliteWireIds = new Set(hiliteNet?.wireIds ?? []);

    for (const w of this.page.wires) {
      if (w.points.length < 2) continue;
      const d = w.points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
      const width = w.type === "power" ? this.wireWidthPower : this.wireWidthControl;
      // ореол под всей цепью выбранного провода
      if (hiliteWireIds.has(w.id)) {
        this.wiresG.append(
          el("path", {
            d,
            fill: "none",
            stroke: "#1b6fc4",
            "stroke-width": width + 1.2,
            opacity: 0.35,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          }),
        );
      }
      this.wiresG.append(
        el("path", {
          d,
          fill: "none",
          stroke: w.color ?? "#1a1a1a",
          "stroke-width": width,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
      // номер цепи у середины первого сегмента, со смещением перпендикулярно проводу:
      // над горизонтальным участком, слева от вертикального — чтобы не попадал «под провод»
      if (w.number) {
        const a = w.points[0];
        const b = w.points[1];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const off = 1.6;
        const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x);
        const t = vertical
          ? this.text(w.number, mx - off, my, 2.6, "end")
          : this.text(w.number, mx, my - off, 2.6, "middle");
        t.setAttribute("fill", "#1257a0");
        this.wiresG.append(t);
      }
    }

    // узлы соединения (жирные точки на Т-ответвлениях) — заметнее толщины провода
    const dotR = Math.max(1.2, this.wireWidthPower * 4);
    for (const j of computeJunctions(this.page)) {
      this.wiresG.append(el("circle", { cx: j.x, cy: j.y, r: dotR, fill: "#1a1a1a" }));
    }

    // выводы символов на подсвеченной цепи — кольца акцента
    if (hiliteNet) {
      for (const p of hiliteNet.pins) {
        this.wiresG.append(
          el("circle", {
            cx: p.x,
            cy: p.y,
            r: dotR + 0.4,
            fill: "none",
            stroke: "#1b6fc4",
            "stroke-width": 0.3,
          }),
        );
      }
    }
  }

  // ----- расстановка символов (S2) -----

  /** SVG-трансформ инстанса: совпадает с `transformLocalPoint` (зеркало→поворот→сдвиг). */
  private instanceTransform(inst: SymbolInstance): string {
    return `translate(${inst.x} ${inst.y}) rotate(${inst.rotation}) scale(${inst.mirror ? -1 : 1} 1)`;
  }

  /** Габариты инстанса в координатах листа (AABB после поворота/зеркала). */
  private worldBounds(inst: SymbolInstance, sym: SymbolDef): Rect {
    const b = symbolBounds(sym);
    const corners: Point[] = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x, y: b.y + b.h },
      { x: b.x + b.w, y: b.y + b.h },
    ];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const c of corners) {
      const t = transformLocalPoint(c, inst.rotation, inst.mirror);
      const wx = inst.x + t.x;
      const wy = inst.y + t.y;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private renderInstances(): void {
    this.instancesG.replaceChildren();
    this.overlayG.replaceChildren();
    for (const inst of this.page.instances) {
      const sym = this.library.get(inst.symbolId);
      if (!sym) continue;

      const g = symbolToSvg(sym, { pins: true });
      g.setAttribute("transform", this.instanceTransform(inst));
      this.instancesG.append(g);

      const wb = this.worldBounds(inst, sym);
      if (this.selected?.id === inst.id) {
        this.overlayG.append(
          el("rect", {
            x: wb.x - 1.5,
            y: wb.y - 1.5,
            width: wb.w + 3,
            height: wb.h + 3,
            fill: "#1b6fc418",
            stroke: "#1b6fc4",
            "stroke-width": 0.3,
            "stroke-dasharray": "1.5 1",
          }),
        );
      }
      if (inst.showLabels && inst.designation) {
        // подпись позобозначения — шрифт 4 мм (читаемо на А3; ГОСТ 2.304)
        this.overlayG.append(
          this.text(inst.designation, wb.x + wb.w + 1.5, wb.y + 2.2, 4, "start", true),
        );
      }
    }
  }

  private renderGhost(): void {
    this.ghostG.replaceChildren();
    if (this.wireMode) {
      if (!this.wireStart) return;
      const p = snapPoint(this.last, this.page.gridStep);
      const polys =
        this.wirePoles === 3
          ? parallelSegments(this.wireStart, p, 3, WIRE_PHASE_STEP)
          : [[this.wireStart, p]];
      for (const seg of polys) {
        this.ghostG.append(
          el("line", {
            x1: seg[0].x,
            y1: seg[0].y,
            x2: seg[1].x,
            y2: seg[1].y,
            stroke: "#1b6fc4",
            "stroke-width": 0.5,
            "stroke-dasharray": "1.5 1",
          }),
        );
      }
      return;
    }
    if (!this.armed) return;
    const p = snapPoint(this.last, this.page.gridStep);
    const g = symbolToSvg(this.armed, { stroke: "#1b6fc4", pins: true, opacity: 0.5 });
    g.setAttribute(
      "transform",
      `translate(${p.x} ${p.y}) rotate(${this.pendingRotation}) scale(${this.pendingMirror ? -1 : 1} 1)`,
    );
    this.ghostG.append(g);
  }

  /** Найти верхний инстанс под точкой (мм). */
  private hitTest(p: Point): SymbolInstance | null {
    for (let i = this.page.instances.length - 1; i >= 0; i--) {
      const inst = this.page.instances[i];
      const sym = this.library.get(inst.symbolId);
      if (!sym) continue;
      const b = this.worldBounds(inst, sym);
      if (p.x >= b.x - 1 && p.x <= b.x + b.w + 1 && p.y >= b.y - 1 && p.y <= b.y + b.h + 1)
        return inst;
    }
    return null;
  }

  /** Найти провод под точкой (мм). */
  private hitTestWire(p: Point): Wire | null {
    const tol = 1.5;
    for (let i = this.page.wires.length - 1; i >= 0; i--) {
      const w = this.page.wires[i];
      for (let s = 1; s < w.points.length; s++) {
        if (distToSegment(p, w.points[s - 1], w.points[s]) <= tol) return w;
      }
    }
    return null;
  }

  private selectWire(wire: Wire | null): void {
    this.selectedWire = wire;
    this.selected = null;
    this.renderInstances();
    this.renderWires();
    this.updateHud();
  }

  private select(inst: SymbolInstance | null): void {
    this.selected = inst;
    this.selectedWire = null;
    this.renderWires();
    this.renderInstances();
    this.updateHud();
  }

  /** Взвести символ для вставки (режим вставки). */
  arm(sym: SymbolDef): void {
    this.exitWireMode();
    this.armed = sym;
    this.selected = null;
    this.selectedWire = null;
    this.pendingRotation = 0;
    this.pendingMirror = false;
    this.svg.style.cursor = "copy";
    this.hooks.onArmedChange?.(sym.id);
    this.renderInstances();
    this.renderGhost();
    this.updateHud();
  }

  /** Выйти из режима вставки. */
  private disarm(): void {
    this.armed = null;
    this.svg.style.cursor = "";
    this.ghostG.replaceChildren();
    this.hooks.onArmedChange?.(null);
    this.updateHud();
  }

  /** Включить инструмент «Провод»: 1-полюсный (цепочка) или 3-полюсный (шаг 5 мм). */
  armWire(poles: 1 | 3 = 1): void {
    this.armed = null;
    this.selected = null;
    this.selectedWire = null;
    this.wireMode = true;
    this.wirePoles = poles;
    this.wireStart = null;
    this.svg.style.cursor = "crosshair";
    this.hooks.onArmedChange?.(null);
    this.hooks.onWireModeChange?.(true, poles);
    this.renderInstances();
    this.ghostG.replaceChildren();
    this.updateHud();
  }

  private exitWireMode(): void {
    if (!this.wireMode) return;
    this.wireMode = false;
    this.wireStart = null;
    this.svg.style.cursor = "";
    this.ghostG.replaceChildren();
    this.hooks.onWireModeChange?.(false, this.wirePoles);
    this.updateHud();
  }

  /** R — повернуть выбранный (или ориентацию вставки) на +90°. */
  rotateSelectedOrPending(): void {
    if (this.selected) {
      this.stack.execute(new RotateInstanceCommand(this.selected));
    } else if (this.armed) {
      this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
      this.renderGhost();
      this.updateHud();
    }
  }

  /** M — отразить выбранный (или ориентацию вставки) по горизонтали. */
  mirrorSelectedOrPending(): void {
    if (this.selected) {
      this.stack.execute(new MirrorInstanceCommand(this.selected));
    } else if (this.armed) {
      this.pendingMirror = !this.pendingMirror;
      this.renderGhost();
      this.updateHud();
    }
  }

  /** Delete — удалить выбранный провод или инстанс. */
  deleteSelected(): void {
    if (this.selectedWire) {
      const w = this.selectedWire;
      this.selectedWire = null;
      this.stack.execute(new RemoveWireCommand(this.page, w));
    } else if (this.selected) {
      const inst = this.selected;
      this.selected = null;
      this.stack.execute(new RemoveInstanceCommand(this.page, inst));
    }
  }

  /** Esc — завершить/прервать провод, выйти из вставки, иначе снять выделение. */
  cancelPlacement(): void {
    if (this.wireMode) {
      if (this.wireStart) {
        this.wireStart = null; // завершить текущую цепочку, остаться в режиме
        this.renderGhost();
        this.updateHud();
      } else {
        this.exitWireMode();
      }
      return;
    }
    if (this.armed) this.disarm();
    else this.select(null);
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
    const mode = this.wireMode
      ? this.wireStart
        ? "Провод: укажите конец (Esc — завершить)"
        : "Провод: укажите начало"
      : this.armed
        ? `Вставка: ${this.armed.componentCode}${this.pendingMirror ? " ↔" : ""}${this.pendingRotation ? ` ${this.pendingRotation}°` : ""}`
        : this.selectedWire
          ? "Выбран провод (Del — удалить, 2× — свойства)"
          : this.selected
            ? `Выбран: ${this.selected.designation}`
            : "Выбор";
    this.hud.textContent =
      `${this.page.format.name}  ·  Zoom ${Math.round(this.zoom * 100)}%  ·  ` +
      `Курсор ${fmt(this.last.x)}, ${fmt(this.last.y)} мм  ·  ` +
      `Элементов: ${this.page.instances.length}  ·  ${mode}`;
  }

  private installEvents(): void {
    const svg = this.svg;

    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };

      // ЛКМ по существующему символу (вне вставки/провода) — выбрать и готовить перетаскивание
      if (!this.armed && !this.wireMode && e.button === 0) {
        const r = svg.getBoundingClientRect();
        this.last = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
        const hit = this.hitTest(this.last);
        if (hit) {
          this.select(hit);
          this.dragging = {
            inst: hit,
            originX: hit.x,
            originY: hit.y,
            grabDX: this.last.x - hit.x,
            grabDY: this.last.y - hit.y,
          };
        }
      }
    });

    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      this.last = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      this.updateCursor();
      this.renderGhost();

      if (this.down) {
        if (!this.down.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 3) {
          this.down.moved = true;
        }
        if (this.down.moved && this.dragging) {
          // перетаскивание выбранного символа (с привязкой к сетке)
          const target = snapPoint(
            {
              x: this.last.x - this.dragging.grabDX,
              y: this.last.y - this.dragging.grabDY,
            },
            this.page.gridStep,
          );
          this.dragging.inst.x = target.x;
          this.dragging.inst.y = target.y;
          this.renderInstances();
        } else if (this.down.moved && (this.down.button === 0 || this.down.button === 1)) {
          this.panX += e.movementX;
          this.panY += e.movementY;
          this.updateView();
        }
      }
    });

    svg.addEventListener("pointerup", () => {
      // завершить перетаскивание → одна обратимая команда (от исходной точки к текущей)
      if (this.dragging) {
        const d = this.dragging;
        this.dragging = null;
        if (this.down?.moved && (d.inst.x !== d.originX || d.inst.y !== d.originY)) {
          const toX = d.inst.x;
          const toY = d.inst.y;
          d.inst.x = d.originX; // откат: do() команды — единственный источник истины
          d.inst.y = d.originY;
          const dx = toX - d.originX;
          const dy = toY - d.originY;
          const cmds: Command[] = [new MoveInstanceCommand(d.inst, d.originX, d.originY, toX, toY)];
          // авто-реконнект: концы проводов на выводах символа едут вместе с ним
          const sym = this.library.get(d.inst.symbolId);
          if (sym) {
            const oldPins = instancePins(sym, {
              x: d.originX,
              y: d.originY,
              rotation: d.inst.rotation,
              mirror: d.inst.mirror,
            });
            for (const w of this.page.wires) {
              for (const idx of [0, w.points.length - 1]) {
                const pt = w.points[idx];
                if (pt && oldPins.some((pp) => pp.x === pt.x && pp.y === pt.y)) {
                  cmds.push(new MoveWireEndpointCommand(w, idx, pt.x, pt.y, pt.x + dx, pt.y + dy));
                }
              }
            }
          }
          this.stack.execute(cmds.length > 1 ? new MacroCommand(cmds) : cmds[0]);
        }
        this.down = null;
        return;
      }

      if (this.down?.button === 0 && !this.down.moved) {
        if (this.wireMode) {
          const p = snapPoint(this.last, this.page.gridStep);
          if (!this.wireStart) {
            this.wireStart = p;
          } else if (p.x !== this.wireStart.x || p.y !== this.wireStart.y) {
            if (this.wirePoles === 3) {
              const polys = parallelSegments(this.wireStart, p, 3, WIRE_PHASE_STEP);
              this.stack.execute(new AddWiresCommand(this.page, polys, "power"));
              this.wireStart = null; // 3-полюсный — без цепочки
            } else {
              this.stack.execute(new AddWireCommand(this.page, [this.wireStart, p], "power"));
              this.wireStart = p; // 1-полюсный — продолжаем цепочку
            }
          }
          this.renderGhost();
        } else if (this.armed) {
          const p = snapPoint(this.last, this.page.gridStep);
          const addCmd = new AddSymbolInstanceCommand(this.page, this.armed, p.x, p.y, {
            rotation: this.pendingRotation,
            mirror: this.pendingMirror,
          });
          // разрез провода при вставке символа на него (принцип 2)
          const pins = instancePins(this.armed, {
            x: p.x,
            y: p.y,
            rotation: this.pendingRotation,
            mirror: this.pendingMirror,
          });
          const splits: Command[] = [];
          for (const w of this.page.wires) {
            const cut = pins.find((pin) =>
              w.points.some((_, i) => i > 0 && pointOnSegment(pin, w.points[i - 1], w.points[i])),
            );
            if (cut) splits.push(new SplitWireCommand(this.page, w, { x: cut.x, y: cut.y }));
          }
          const cmd = splits.length ? new MacroCommand([addCmd, ...splits]) : addCmd;
          this.stack.execute(cmd); // подписка перерисует слой символов/проводов
          this.select(addCmd.instance); // выбрать новый, режим вставки сохраняется
        } else {
          const inst = this.hitTest(this.last);
          if (inst) this.select(inst);
          else this.selectWire(this.hitTestWire(this.last));
        }
      }
      this.down = null;
    });

    svg.addEventListener("pointerleave", () => {
      this.cursorMarker.setAttribute("visibility", "hidden");
      this.ghostG.replaceChildren();
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

    svg.addEventListener("dblclick", (e) => {
      if (this.armed || this.wireMode) return;
      const r = svg.getBoundingClientRect();
      const p = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      const hit = this.hitTest(p);
      if (hit) {
        this.select(hit);
        this.hooks.onRequestEdit?.(hit);
        return;
      }
      const wire = this.hitTestWire(p);
      if (wire) {
        this.selectWire(wire);
        this.hooks.onRequestEditWire?.(wire);
      }
    });

    window.addEventListener("resize", () => this.updateView());
  }
}
