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
  TITLE_BLOCK_FORM1,
  titleRoles,
  symbolBounds,
  transformLocalPoint,
  AddSymbolInstanceCommand,
  EditInstanceCommand,
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
  AutoNumberProjectCommand,
  ClearNumbersCommand,
  AddAnnotationCommand,
  RemoveAnnotationCommand,
  MoveAnnotationCommand,
  RestyleAnnotationCommand,
  translateAnnotation,
  computeJunctions,
  computeNets,
  connectorPartners,
  partnersText,
  circuitNumberAt,
  nextDesignation,
  instancePins,
  instanceLabels,
  coilContactRows,
  InsertBlockCommand,
  pointOnSegment,
  newId,
  DEFAULT_ANNOTATION_STYLE,
  type AutoNumberOptions,
  type ContactColumn,
  type DeviceInfo,
  type DeviceMember,
  type Annotation,
  type AnnotationStyle,
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
  type BlockDef,
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
  /** Поставщик устройств проекта (master/slave) для кросс-референсов (S5). */
  getDevices?: () => DeviceInfo[];
  /** Поставщик всех листов проекта (для адресации соединителей страниц, S29). */
  getPages?: () => Page[];
  /** Сменился активный инструмент рисования (или снят — `null`). */
  onDrawToolChange?: (tool: DrawTool | null) => void;
  /** Выбрана аннотация — синхронизировать стиль в ленте (или снято — `null`). */
  onAnnotationStyle?: (style: AnnotationStyle | null) => void;
  /** Запрос ввода текста аннотации: показать модалку и вернуть текст через `commit`. */
  onRequestText?: (commit: (text: string) => void) => void;
  /** Двойной клик по адресу в зеркале контактов — перейти на лист контакта (S27 Ф2). */
  onNavigateToContact?: (pageIndex: number, instanceId: string) => void;
  /** Изменилось число выбранных инстансов (для кнопки «В блок», S27 Ф4). */
  onSelectionCountChange?: (count: number) => void;
  /**
   * Подтвердить сиглу при вставке символа (модалка). `commit(designation)` ставит символ
   * с этой сиглой (пустая → авто); `commit(null)` — отмена. Совпадение сигл связывает
   * катушку и контакты в одно устройство (master/slave).
   */
  onConfirmDesignation?: (suggested: string, commit: (designation: string | null) => void) => void;
}

/** Инструмент рисования аннотаций. */
export type DrawTool = "line" | "rect" | "ellipse" | "arrow" | "text";

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
  private readonly annotationsG: SVGGElement;
  private readonly overlayG: SVGGElement;
  private readonly nodesG: SVGGElement;
  private readonly ghostG: SVGGElement;
  private readonly cursorMarker: SVGCircleElement;

  private last: Point = { x: 0, y: 0 };
  private down: PointerDown | null = null;

  // --- расстановка символов (S2) ---
  /** Взведённый для вставки символ (режим вставки). */
  private armed: SymbolDef | null = null;
  /** Взведённый для вставки блок (макрос-группа, S27 Ф4). */
  private armedBlock: BlockDef | null = null;
  /** Множественное выделение инстансов (Shift+клик) — для сборки блока (S27 Ф4). */
  private readonly multi = new Set<string>();
  /** Выбранный инстанс на листе (для поворота/зеркала/удаления). */
  private selected: SymbolInstance | null = null;
  /** Выбранный провод (для удаления/свойств). */
  private selectedWire: Wire | null = null;
  /** Выбранная аннотация (оформление). */
  private selectedAnno: Annotation | null = null;
  /** Буфер обмена (копирование/вставка инстансов, Ctrl+C/V). */
  private clip: SymbolInstance[] = [];
  /** Рамка-выделение (marquee): ЛКМ-протяжка по пустому листу. */
  private marquee: { x0: number; y0: number } | null = null;
  /** Активный инструмент рисования аннотаций (или null). */
  private drawTool: DrawTool | null = null;
  /** Текущий стиль аннотаций (для новых; применяется и к выбранной). */
  private annoStyle: AnnotationStyle = { ...DEFAULT_ANNOTATION_STYLE };
  /** Стартовая точка рисуемой фигуры (drag). */
  private annoStart: Point | null = null;
  /** Перетаскивание аннотации. */
  private annoDrag: {
    anno: Annotation;
    lastX: number;
    lastY: number;
    totalDX: number;
    totalDY: number;
  } | null = null;
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
  /** Вращение инстанса ручкой (снап к 90°). */
  private rotating: { inst: SymbolInstance; originRot: Rotation } | null = null;

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
    this.instancesG = el("g", { "data-layer": "instances" });
    this.annotationsG = el("g", { "data-layer": "annotations" });
    this.overlayG = el("g", { "data-layer": "overlay" });
    this.nodesG = el("g");
    this.ghostG = el("g");
    this.cursorMarker = el("circle", {
      r: 1.6,
      fill: "none",
      stroke: "#1b6fc4",
      "stroke-width": 0.4,
      visibility: "hidden",
    });
    // снизу вверх: лист → провода → символы → аннотации → выделение/подписи → узлы → курсор → «призрак»
    this.content.append(
      this.sheetG,
      this.wiresG,
      this.instancesG,
      this.annotationsG,
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
    this.renderAnnotations();
    this.renderNodes();
    this.stack.subscribe(() => {
      this.renderWires();
      this.renderInstances();
      this.renderAnnotations();
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

  /** Полная перерисовка слоёв (напр. после правки символа в библиотеке, S9). */
  rerender(): void {
    this.renderWires();
    this.renderInstances();
    this.renderAnnotations();
    this.renderNodes();
  }

  /** Перерисовать лист/штамп (напр. после смены наименования листа, S26). */
  refreshSheet(): void {
    this.renderSheet();
  }

  /**
   * Автонумерация цепей (ГОСТ 2.709): по потенциалам или по проводам. Обратима.
   * Сквозная по всему проекту (S29) — один номер на цепь через листы (соединители
   * страниц). Если листы недоступны (нет `getPages`) — нумеруется текущий лист.
   */
  autoNumber(opts: AutoNumberOptions = {}): void {
    const pages = this.hooks.getPages?.();
    this.stack.execute(
      pages && pages.length > 1
        ? new AutoNumberProjectCommand(pages, this.library, opts)
        : new AutoNumberCommand(this.page, this.library, opts),
    );
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

  /** Можно ли повернуть (выбран инстанс или взведена вставка) — для пробела. */
  get hasRotatable(): boolean {
    return this.selected !== null || this.armed !== null;
  }

  // ----- инструменты рисования (оформление, S25) -----

  /** Включить инструмент рисования аннотаций (линия/фигура/стрелка/текст). */
  armDraw(tool: DrawTool): void {
    this.exitWireMode();
    this.armed = null;
    this.selected = null;
    this.selectedWire = null;
    this.selectedAnno = null;
    this.drawTool = tool;
    this.annoStart = null;
    this.svg.style.cursor = tool === "text" ? "text" : "crosshair";
    this.hooks.onArmedChange?.(null);
    this.hooks.onDrawToolChange?.(tool);
    this.hooks.onAnnotationStyle?.(null);
    this.renderWires();
    this.renderInstances();
    this.renderAnnotations();
    this.ghostG.replaceChildren();
    this.updateHud();
  }

  /** Выйти из режима рисования. */
  exitDrawTool(): void {
    if (!this.drawTool) return;
    this.drawTool = null;
    this.annoStart = null;
    this.svg.style.cursor = "";
    this.ghostG.replaceChildren();
    this.hooks.onDrawToolChange?.(null);
    this.updateHud();
  }

  /** Текущий стиль аннотаций (для синхронизации контролов ленты). */
  get currentAnnoStyle(): AnnotationStyle {
    return { ...this.annoStyle };
  }

  /** Задать стиль аннотаций: для новых фигур и (если выбрана) для текущей. */
  setAnnoStyle(patch: Partial<AnnotationStyle>): void {
    this.annoStyle = { ...this.annoStyle, ...patch };
    if (this.selectedAnno) {
      this.stack.execute(new RestyleAnnotationCommand(this.selectedAnno, patch));
    }
  }

  /** id текущего показываемого листа. */
  get currentPageId(): string {
    return this.page.id;
  }

  /** Переключить показываемый лист: перерисовать и вписать в окно. */
  setPage(page: Page): void {
    this.exitWireMode();
    this.exitDrawTool();
    this.page = page;
    this.selected = null;
    this.selectedWire = null;
    this.selectedAnno = null;
    this.armed = null;
    this.armedBlock = null;
    this.multi.clear();
    this.hooks.onArmedChange?.(null);
    this.renderSheet();
    this.renderWires();
    this.renderInstances();
    this.renderAnnotations();
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

  /** Сериализовать содержимое текущего листа (все слои в мм: рамка, провода, символы, подписи). */
  private serializeContent(): string {
    const ser = new XMLSerializer();
    return [
      this.sheetG,
      this.wiresG,
      this.instancesG,
      this.annotationsG,
      this.overlayG,
      this.nodesG,
    ]
      .map((g) => ser.serializeToString(g))
      .join("");
  }

  /** SVG-страница листа (мм, 1:1) для печати. */
  private sheetSvg(): string {
    const f = this.page.format;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" class="sheet" viewBox="0 0 ${f.width} ${f.height}" ` +
      `width="${f.width}mm" height="${f.height}mm">${this.serializeContent()}</svg>`
    );
  }

  private openPrint(title: string, sizeMm: string, bodyHtml: string): void {
    const printJs = "window.onload=function(){window.focus();window.print();};";
    const html =
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>@page{size:${sizeMm};margin:0}html,body{margin:0}svg.sheet{display:block;page-break-after:always}</style>` +
      `</head><body>${bodyHtml}<script>${printJs}</` +
      `script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const win = window.open(url, "_blank");
    if (!win) window.alert("Разрешите всплывающие окна, чтобы экспортировать в PDF.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** Экспорт текущего листа в PDF через печать браузера (Save as PDF), масштаб 1:1 в мм. */
  exportPdf(): void {
    const f = this.page.format;
    const tb = this.page.titleBlock;
    const title = `${tb.designation || tb.title || "Лист"} · ${f.name}`;
    this.openPrint(title, `${f.width}mm ${f.height}mm`, this.sheetSvg());
  }

  /** Экспорт всех листов проекта одним многостраничным PDF (по образцу формата 1-го листа). */
  exportProjectPdf(pages: Page[], projectName: string): void {
    if (pages.length === 0) return;
    const original = this.page;
    const sheets: string[] = [];
    for (const page of pages) {
      this.setPage(page);
      sheets.push(this.sheetSvg());
    }
    this.setPage(original); // вернуть исходный лист
    const f = pages[0].format;
    this.openPrint(
      `${projectName} · ${pages.length} л.`,
      `${f.width}mm ${f.height}mm`,
      sheets.join(""),
    );
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
    // зонные метки только сверху (колонки) и слева (строки) — снизу/справа мешали бы штампу
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
    }
    for (let i = 0; i < zg.cols; i++) {
      const cx = (zg.colX[i] + zg.colX[i + 1]) / 2;
      g.append(this.text(String(i + 1), cx, fr.y + tick / 2 + 0.5, 3));
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
    }
    for (let i = 0; i < zg.rows; i++) {
      const cy = (zg.rowY[i] + zg.rowY[i + 1]) / 2;
      const letter = String.fromCharCode(65 + i);
      g.append(this.text(letter, fr.x + tick / 2, cy, 3));
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

    const F = TITLE_BLOCK_FORM1;
    const roles = titleRoles(tb);
    for (let r = 0; r < F.roleRows; r++) {
      const y = r * F.rowH;
      box(0, y, F.leftLabelW, F.rowH);
      box(F.leftLabelW, y, F.leftNameW, F.rowH);
      box(F.leftLabelW + F.leftNameW, y, F.leftSignW, F.rowH);
      box(F.leftLabelW + F.leftNameW + F.leftSignW, y, F.leftDateW, F.rowH);
      lab(0, y, roles[r]?.role ?? "");
      val(F.leftLabelW, y, F.leftNameW, F.rowH, roles[r]?.name ?? "", 2.6);
    }

    const cx = F.centerX;
    const cw = F.centerW;
    box(cx, 0, cw, F.designH);
    val(cx, 0, cw, F.designH, tb.designation, 3.6, true);
    box(cx, F.designH, cw, F.titleH);
    val(cx, F.designH, cw, F.titleH, tb.title, 4.2);
    box(cx, F.designH + F.titleH, cw, F.companyH);
    val(cx, F.designH + F.titleH, cw, F.companyH, tb.company, 3);

    const rx = F.rightX;
    const rw = F.rightW;
    const ch = F.rightCellH;
    box(rx, 0, rw, ch);
    lab(rx, 0, "Масштаб");
    val(rx, 2.5, rw, 5.5, tb.scale, 3);
    box(rx, ch, rw, ch);
    lab(rx, ch, "Масса");
    val(rx, ch + 2.5, rw, 5.5, tb.mass, 3);
    box(rx, ch * 2, rw, ch);
    lab(rx, ch * 2, "Лит.");
    val(rx, ch * 2 + 2.5, rw, 5.5, tb.letter, 3);
    box(rx, ch * 3, rw, F.rightSheetH);
    lab(rx, ch * 3, "Лист");
    val(rx, ch * 3 + 4, rw, 11, String(tb.sheet), 3.5);
    box(rx, ch * 3 + F.rightSheetH, rw, F.rightSheetH);
    lab(rx, ch * 3 + F.rightSheetH, "Листов");
    val(rx, ch * 3 + F.rightSheetH + 4, rw, 11, String(tb.sheetsTotal), 3.5);
  }

  private renderNodes(): void {
    this.nodesG.replaceChildren();
    for (const n of this.page.nodes) {
      this.nodesG.append(el("circle", { cx: n.x, cy: n.y, r: 1.5, fill: "#1b6fc4" }));
    }
  }

  // ----- аннотации (оформление, S25) -----

  /** Штриховка по типу линии (в мм, относительно толщины). */
  private dashArray(dash: AnnotationStyle["dash"], w: number): string | null {
    if (dash === "dashed") return `${w * 4} ${w * 3}`;
    if (dash === "dotted") return `${Math.max(w, 0.2)} ${w * 2.5}`;
    return null;
  }

  /** Габаритный прямоугольник аннотации (мм). */
  private annoBounds(a: Annotation): Rect {
    switch (a.kind) {
      case "line":
        return {
          x: Math.min(a.x1, a.x2),
          y: Math.min(a.y1, a.y2),
          w: Math.abs(a.x2 - a.x1),
          h: Math.abs(a.y2 - a.y1),
        };
      case "rect":
        return { x: a.x, y: a.y, w: a.w, h: a.h };
      case "ellipse":
        return { x: a.cx - a.rx, y: a.cy - a.ry, w: a.rx * 2, h: a.ry * 2 };
      case "text":
        return { x: a.x, y: a.y - a.size, w: Math.max(a.text.length * a.size * 0.6, 2), h: a.size };
      case "image":
        return { x: a.x, y: a.y, w: a.w, h: a.h };
    }
  }

  /** Наконечник стрелки в конце линии (треугольник). */
  private arrowHead(a: Extract<Annotation, { kind: "line" }>): SVGElement {
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const size = Math.max(2, a.style.width * 6);
    const bx = a.x2 - ux * size;
    const by = a.y2 - uy * size;
    const wide = size * 0.45;
    const pts = `${a.x2},${a.y2} ${bx - uy * wide},${by + ux * wide} ${bx + uy * wide},${by - ux * wide}`;
    return el("polygon", { points: pts, fill: a.style.color });
  }

  private renderAnnotations(): void {
    this.annotationsG.replaceChildren();
    for (const a of this.page.annotations) {
      const s = a.style;
      if (a.kind === "line") {
        const ln = el("line", {
          x1: a.x1,
          y1: a.y1,
          x2: a.x2,
          y2: a.y2,
          stroke: s.color,
          "stroke-width": s.width,
          "stroke-linecap": "round",
        });
        const dash = this.dashArray(s.dash, s.width);
        if (dash) ln.setAttribute("stroke-dasharray", dash);
        this.annotationsG.append(ln);
        if (a.arrowEnd) this.annotationsG.append(this.arrowHead(a));
      } else if (a.kind === "rect") {
        const r = el("rect", {
          x: a.x,
          y: a.y,
          width: Math.max(a.w, 0.01),
          height: Math.max(a.h, 0.01),
          fill: "none",
          stroke: s.color,
          "stroke-width": s.width,
        });
        const dash = this.dashArray(s.dash, s.width);
        if (dash) r.setAttribute("stroke-dasharray", dash);
        this.annotationsG.append(r);
      } else if (a.kind === "ellipse") {
        const e = el("ellipse", {
          cx: a.cx,
          cy: a.cy,
          rx: Math.max(a.rx, 0.01),
          ry: Math.max(a.ry, 0.01),
          fill: "none",
          stroke: s.color,
          "stroke-width": s.width,
        });
        const dash = this.dashArray(s.dash, s.width);
        if (dash) e.setAttribute("stroke-dasharray", dash);
        this.annotationsG.append(e);
      } else if (a.kind === "image") {
        this.annotationsG.append(
          el("image", {
            href: a.href,
            x: a.x,
            y: a.y,
            width: Math.max(a.w, 0.01),
            height: Math.max(a.h, 0.01),
            preserveAspectRatio: "none",
          }),
        );
      } else {
        const t = this.text(a.text, a.x, a.y, a.size, "start");
        t.setAttribute("fill", s.color);
        t.setAttribute("dominant-baseline", "alphabetic");
        this.annotationsG.append(t);
      }
      if (this.selectedAnno?.id === a.id) {
        const b = this.annoBounds(a);
        this.annotationsG.append(
          el("rect", {
            x: b.x - 1,
            y: b.y - 1,
            width: b.w + 2,
            height: b.h + 2,
            fill: "none",
            stroke: "#1b6fc4",
            "stroke-width": 0.3,
            "stroke-dasharray": "1.5 1",
          }),
        );
      }
    }
  }

  /** Собрать аннотацию-фигуру по инструменту и двум точкам (текст — отдельно). */
  private makeShape(tool: DrawTool, a: Point, b: Point): Annotation | null {
    const style = { ...this.annoStyle };
    const id = newId();
    if (tool === "line" || tool === "arrow") {
      return {
        id,
        kind: "line",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        arrowEnd: tool === "arrow",
        style,
      };
    }
    if (tool === "rect") {
      return {
        id,
        kind: "rect",
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
        style,
      };
    }
    if (tool === "ellipse") {
      return {
        id,
        kind: "ellipse",
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        rx: Math.abs(b.x - a.x) / 2,
        ry: Math.abs(b.y - a.y) / 2,
        style,
      };
    }
    return null;
  }

  private nearRectBorder(p: Point, b: Rect, tol: number): boolean {
    const inX = p.x >= b.x - tol && p.x <= b.x + b.w + tol;
    const inY = p.y >= b.y - tol && p.y <= b.y + b.h + tol;
    const nearV = Math.abs(p.x - b.x) <= tol || Math.abs(p.x - (b.x + b.w)) <= tol;
    const nearH = Math.abs(p.y - b.y) <= tol || Math.abs(p.y - (b.y + b.h)) <= tol;
    return (inY && nearV) || (inX && nearH);
  }

  /** Найти аннотацию под точкой (мм). */
  private hitTestAnnotation(p: Point): Annotation | null {
    const tol = 1.5;
    for (let i = this.page.annotations.length - 1; i >= 0; i--) {
      const a = this.page.annotations[i];
      if (a.kind === "line") {
        if (distToSegment(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= tol) return a;
      } else if (a.kind === "text" || a.kind === "image") {
        const b = this.annoBounds(a);
        if (
          p.x >= b.x - tol &&
          p.x <= b.x + b.w + tol &&
          p.y >= b.y - tol &&
          p.y <= b.y + b.h + tol
        )
          return a;
      } else if (this.nearRectBorder(p, this.annoBounds(a), tol)) {
        return a;
      }
    }
    return null;
  }

  private selectAnno(a: Annotation | null): void {
    this.selectedAnno = a;
    this.selected = null;
    this.selectedWire = null;
    this.hooks.onAnnotationStyle?.(a ? { ...a.style } : null);
    this.renderWires();
    this.renderInstances();
    this.renderAnnotations();
    this.updateHud();
  }

  /**
   * Вставить растровую картинку (PNG/JPEG) как аннотацию-изображение (S31).
   * Габарит вписывается в ~60 мм по большей стороне (сохраняя пропорции),
   * картинка кладётся по центру видимой области и сразу выделяется.
   */
  insertImage(href: string, naturalW: number, naturalH: number): void {
    const r = this.svg.getBoundingClientRect();
    const center = snapPoint(this.screenToWorld(r.width / 2, r.height / 2), this.page.gridStep);
    const maxMm = 60;
    const ratio = naturalW > 0 && naturalH > 0 ? naturalW / naturalH : 1;
    const w = ratio >= 1 ? maxMm : maxMm * ratio;
    const h = ratio >= 1 ? maxMm / ratio : maxMm;
    const anno: Annotation = {
      id: newId(),
      kind: "image",
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      href,
      style: { ...DEFAULT_ANNOTATION_STYLE },
    };
    this.stack.execute(new AddAnnotationCommand(this.page, anno));
    this.selectAnno(anno);
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

  /** Центр ручки вращения (над верхней серединой габарита выделенного инстанса). */
  private rotateHandle(inst: SymbolInstance, sym: SymbolDef): Point {
    const wb = this.worldBounds(inst, sym);
    return { x: wb.x + wb.w / 2, y: wb.y - 5 };
  }

  private renderInstances(): void {
    this.instancesG.replaceChildren();
    this.overlayG.replaceChildren();

    // карта инстанс → {устройство, представление} для кросс-референсов master/slave (S5)
    const devices = this.hooks.getDevices?.() ?? [];
    const memberOf = new Map<string, { device: DeviceInfo; member: DeviceMember }>();
    for (const d of devices)
      for (const m of d.members) memberOf.set(m.instance.id, { device: d, member: m });

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
        // ручка вращения: стебель + кружок над габаритом (тянуть — снап к 90°)
        const hcx = wb.x + wb.w / 2;
        this.overlayG.append(
          el("line", {
            x1: hcx,
            y1: wb.y - 1.5,
            x2: hcx,
            y2: wb.y - 5,
            stroke: "#1b6fc4",
            "stroke-width": 0.3,
          }),
        );
        this.overlayG.append(
          el("circle", {
            cx: hcx,
            cy: wb.y - 5,
            r: 1.4,
            fill: "#fff",
            stroke: "#1b6fc4",
            "stroke-width": 0.35,
          }),
        );
      }
      // подсветка мультивыделения для сборки блока (S27 Ф4)
      if (this.multi.has(inst.id)) {
        this.overlayG.append(
          el("rect", {
            x: wb.x - 1.5,
            y: wb.y - 1.5,
            width: wb.w + 3,
            height: wb.h + 3,
            fill: "#e8731c1f",
            stroke: "#e8731c",
            "stroke-width": 0.35,
            "stroke-dasharray": "1 1",
          }),
        );
      }
      // соединитель страниц (S29): метка сигнала + кликабельный адрес партнёра
      if (sym.kind === "page-connector") {
        this.renderPageConnector(inst, wb);
        continue;
      }
      if (inst.showLabels && inst.designation) {
        // стопка подписей: сигла (4 мм, жирн.) + строки характеристик (3 мм) — ГОСТ 2.304
        let ly = wb.y + 2.2;
        for (const lab of instanceLabels(inst)) {
          const size = lab.primary ? 4 : 3;
          this.overlayG.append(
            this.text(lab.text, wb.x + wb.w + 1.5, ly, size, "start", lab.primary),
          );
          ly += lab.primary ? 4.2 : 3.4;
        }
        this.renderDeviceCrossRef(wb, memberOf.get(inst.id));
      }
    }
  }

  /**
   * Подписи соединителя страниц (S29): метка сигнала над стрелкой + адрес партнёра(ов)
   * под ней. Адрес кликабелен — одиночный клик переносит на лист партнёра.
   */
  private renderPageConnector(inst: SymbolInstance, wb: Rect): void {
    const signal = (inst.signal ?? "").trim();
    if (signal) {
      this.overlayG.append(this.text(signal, wb.x, wb.y - 1.2, 2.8, "start", true));
    }
    const pages = this.hooks.getPages?.() ?? [this.page];
    const partners = signal ? connectorPartners(pages, this.library, signal, inst.id) : [];
    const addr = partners.length > 0 ? `→ ${partnersText(partners)}` : signal ? "→ нет пары" : "?";

    const g = el("g");
    g.append(
      el("rect", {
        x: wb.x,
        y: wb.y + wb.h + 0.4,
        width: Math.max(wb.w, 12),
        height: 4,
        fill: "transparent",
      }),
    );
    const t = this.text(addr, wb.x, wb.y + wb.h + 3.2, 2.6, "start");
    t.setAttribute("fill", partners.length > 0 ? "#1b6fc4" : "#9aa7b4");
    g.append(t);
    if (partners.length > 0) {
      const first = partners[0];
      g.style.cursor = "pointer";
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hooks.onNavigateToContact?.(first.pageIndex, first.instanceId);
      });
    }
    this.overlayG.append(g);
  }

  /**
   * Поставить соединитель страниц в точку (конец провода, S29): авто-метка по номеру
   * цепи, затем открыть свойства — задать/проверить метку сигнала.
   */
  private placePageConnector(at: Point): void {
    const sym = this.library.get("gost.page-connector");
    if (!sym) return;
    const auto = circuitNumberAt(this.page, this.library, at.x, at.y) ?? "";
    const cmd = new AddSymbolInstanceCommand(this.page, sym, at.x, at.y);
    this.stack.execute(cmd);
    cmd.instance.signal = auto;
    cmd.instance.showLabels = false; // адресуется меткой, не сиглой
    this.wireStart = null;
    this.renderGhost();
    this.renderInstances();
    this.select(cmd.instance);
    this.hooks.onRequestEdit?.(cmd.instance);
  }

  /** Кросс-референсы устройства (S5): зеркало контактов у катушки, адрес катушки у контакта. */
  private renderDeviceCrossRef(
    wb: Rect,
    entry: { device: DeviceInfo; member: DeviceMember } | undefined,
  ): void {
    if (!entry) return;
    const { device, member } = entry;
    const muted = (t: SVGTextElement): SVGTextElement => {
      t.setAttribute("fill", "#5a7088");
      return t;
    };

    // у катушки — боксовое «зеркало контактов»: таблица M | НО | НЗ с адресами (S27 Ф2)
    if (member.kind === "coil" && device.contacts.length > 0) {
      this.renderContactMirror(wb, device, member.instance);
    }

    // у контакта — адрес катушки (откуда управляется)
    if ((member.kind === "contact-no" || member.kind === "contact-nc") && device.master) {
      this.overlayG.append(
        muted(
          this.text(`кат. ${device.master.address}`, wb.x + wb.w + 1.5, wb.y + 5.2, 2.4, "start"),
        ),
      );
    }
  }

  /**
   * Боксовое зеркало контактов под катушкой (S27 Ф2): таблица «выводы | M | НО | НЗ»;
   * адрес контакта в своей колонке кликабелен — двойной клик ведёт на лист контакта.
   * Таблицу можно перетаскивать мышью (смещение хранится в `coil.mirrorDx/Dy`, S: DnD).
   */
  private renderContactMirror(wb: Rect, device: DeviceInfo, coil: SymbolInstance): void {
    const rows = coilContactRows(device);
    if (rows.length === 0) return;

    const gutterW = 8;
    const colW = 7;
    const headerH = 3;
    const rowH = 3.4;
    const colLabel: Record<ContactColumn, string> = { M: "Гл.", NO: "НО", NC: "НЗ", CO: "⇄" };
    // показываем только непустые колонки: реле — НО/НЗ; «Гл.» — у контактора; «⇄» — перекидной
    const cols: ContactColumn[] = (["M", "NO", "NC", "CO"] as ContactColumn[]).filter((c) =>
      rows.some((r) => r.column === c),
    );
    const x0 = wb.x + (coil.mirrorDx ?? 0);
    const y0 = wb.y + wb.h + 1.8 + (coil.mirrorDy ?? 0);
    const totalW = gutterW + cols.length * colW;
    const totalH = headerH + rows.length * rowH;
    const colX = (i: number): number => x0 + gutterW + i * colW;
    const div = (x1: number, y1: number, x2: number, y2: number): SVGElement =>
      el("line", { x1, y1, x2, y2, stroke: "#9fb0c3", "stroke-width": 0.15 });

    const g = el("g");
    g.style.cursor = "move";
    g.append(
      el("rect", {
        x: x0,
        y: y0,
        width: totalW,
        height: totalH,
        fill: "#ffffffcc",
        stroke: "#9fb0c3",
        "stroke-width": 0.2,
      }),
    );
    g.append(div(colX(0), y0, colX(0), y0 + totalH));
    for (let i = 1; i < cols.length; i++) g.append(div(colX(i), y0, colX(i), y0 + totalH));
    g.append(div(x0, y0 + headerH, x0 + totalW, y0 + headerH));

    cols.forEach((c, i) => {
      const t = this.text(colLabel[c], colX(i) + colW / 2, y0 + headerH / 2, 2, "middle");
      t.setAttribute("fill", "#5a7088");
      g.append(t);
    });

    rows.forEach((row, r) => {
      const ry = y0 + headerH + r * rowH;
      if (r > 0) g.append(div(x0, ry, x0 + totalW, ry));
      const pinT = this.text(row.pins.join("·"), x0 + 1, ry + rowH / 2, 2, "start");
      pinT.setAttribute("fill", "#5a7088");
      g.append(pinT);
      const ci = Math.max(0, cols.indexOf(row.column));
      g.append(this.contactAddressCell(row, colX(ci), ry, colW, rowH));
    });

    this.attachMirrorDrag(g, coil);
    this.overlayG.append(g);
  }

  /** DnD таблицы зеркала: тянем мышью, на отпускании пишем смещение (привязка к сетке, обратимо). */
  private attachMirrorDrag(g: SVGGElement, coil: SymbolInstance): void {
    const base = { dx: coil.mirrorDx ?? 0, dy: coil.mirrorDy ?? 0 };
    let drag: { sx: number; sy: number; moved: boolean } | null = null;
    g.addEventListener("pointerdown", (e) => {
      if (this.wireMode || this.drawTool || this.armed || this.armedBlock || e.button !== 0) return;
      e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      drag = { sx: e.clientX, sy: e.clientY, moved: false };
    });
    g.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3)
        drag.moved = true;
      if (drag.moved) {
        const ddx = (e.clientX - drag.sx) / this.scalePx;
        const ddy = (e.clientY - drag.sy) / this.scalePx;
        g.setAttribute("transform", `translate(${ddx} ${ddy})`);
      }
    });
    g.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const moved = drag.moved;
      const ddx = (e.clientX - drag.sx) / this.scalePx;
      const ddy = (e.clientY - drag.sy) / this.scalePx;
      drag = null;
      if (!moved) return; // клик без сдвига — не трогаем (двойной клик навигирует по адресу)
      const step = this.page.gridStep;
      const nx = Math.round((base.dx + ddx) / step) * step;
      const ny = Math.round((base.dy + ddy) / step) * step;
      this.stack.execute(new EditInstanceCommand(coil, { mirrorDx: nx, mirrorDy: ny }));
    });
  }

  /** Кликабельная ячейка адреса контакта (двойной клик → переход на его лист). */
  private contactAddressCell(
    row: { address: string; pageIndex: number; instanceId: string },
    cellX: number,
    cellY: number,
    w: number,
    h: number,
  ): SVGGElement {
    const g = el("g");
    g.style.cursor = "pointer";
    g.append(el("rect", { x: cellX, y: cellY, width: w, height: h, fill: "transparent" }));
    const t = this.text(row.address, cellX + w / 2, cellY + h / 2, 2.2, "middle");
    t.setAttribute("fill", "#1b6fc4");
    g.append(t);
    g.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.hooks.onNavigateToContact?.(row.pageIndex, row.instanceId);
    });
    return g;
  }

  /** Перейти к инстансу на текущем листе: центрировать вид и выделить (S27 Ф2). */
  focusInstance(id: string): void {
    const inst = this.page.instances.find((i) => i.id === id);
    if (!inst) return;
    const r = this.svg.getBoundingClientRect();
    this.panX = r.width / 2 - inst.x * this.scalePx;
    this.panY = r.height / 2 - inst.y * this.scalePx;
    this.updateView();
    this.select(inst);
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
    if (this.drawTool) {
      if (this.drawTool === "text" || !this.annoStart) return;
      const p = snapPoint(this.last, this.page.gridStep);
      const ghostAttrs = {
        fill: "none",
        stroke: "#1b6fc4",
        "stroke-width": 0.5,
        "stroke-dasharray": "1.5 1",
      } as const;
      const a = this.annoStart;
      if (this.drawTool === "rect") {
        this.ghostG.append(
          el("rect", {
            x: Math.min(a.x, p.x),
            y: Math.min(a.y, p.y),
            width: Math.abs(p.x - a.x),
            height: Math.abs(p.y - a.y),
            ...ghostAttrs,
          }),
        );
      } else if (this.drawTool === "ellipse") {
        this.ghostG.append(
          el("ellipse", {
            cx: (a.x + p.x) / 2,
            cy: (a.y + p.y) / 2,
            rx: Math.abs(p.x - a.x) / 2,
            ry: Math.abs(p.y - a.y) / 2,
            ...ghostAttrs,
          }),
        );
      } else {
        this.ghostG.append(el("line", { x1: a.x, y1: a.y, x2: p.x, y2: p.y, ...ghostAttrs }));
      }
      return;
    }
    // призрак блока — члены со сдвигом от точки вставки (S27 Ф4)
    if (this.armedBlock) {
      const p = snapPoint(this.last, this.page.gridStep);
      for (const m of this.armedBlock.members) {
        const sym = this.library.get(m.symbolId);
        if (!sym) continue;
        const g = symbolToSvg(sym, { stroke: "#1b6fc4", pins: true, opacity: 0.5 });
        g.setAttribute(
          "transform",
          `translate(${p.x + m.dx} ${p.y + m.dy}) rotate(${m.rotation}) scale(${m.mirror ? -1 : 1} 1)`,
        );
        this.ghostG.append(g);
      }
      return;
    }
    if (!this.armed) return;
    const p = snapPoint(this.last, this.page.gridStep);
    this.appendPlacementGuides(p, this.armed);
    const g = symbolToSvg(this.armed, { stroke: "#1b6fc4", pins: true, opacity: 0.5 });
    g.setAttribute(
      "transform",
      `translate(${p.x} ${p.y}) rotate(${this.pendingRotation}) scale(${this.pendingMirror ? -1 : 1} 1)`,
    );
    this.ghostG.append(g);
  }

  /**
   * Направляющие при установке УГО (S31): сплошная ось симметрии/отражения по точке
   * вставки + пунктирные линии габарита символа (левая/правая и верхняя/нижняя границы
   * с учётом поворота·зеркала). Тянутся на всю видимую область — для выравнивания с
   * другими УГО и по вертикали, и по горизонтали.
   */
  /** Нарисовать прямоугольник рамки-выделения (в ghostG, мировые координаты). */
  private renderMarquee(): void {
    const m = this.marquee;
    if (!m) return;
    this.ghostG.replaceChildren();
    this.ghostG.append(
      el("rect", {
        x: Math.min(m.x0, this.last.x),
        y: Math.min(m.y0, this.last.y),
        width: Math.abs(this.last.x - m.x0),
        height: Math.abs(this.last.y - m.y0),
        fill: "#1b6fc4",
        "fill-opacity": 0.08,
        stroke: "#1b6fc4",
        "stroke-width": 0.3,
        "stroke-dasharray": "1.5 1",
      }),
    );
  }

  private appendPlacementGuides(p: Point, sym: SymbolDef): void {
    const b = symbolBounds(sym);
    const corners: Point[] = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x, y: b.y + b.h },
      { x: b.x + b.w, y: b.y + b.h },
    ];
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bot = -Infinity;
    for (const c of corners) {
      const t = transformLocalPoint(c, this.pendingRotation, this.pendingMirror);
      const wx = p.x + t.x;
      const wy = p.y + t.y;
      if (wx < left) left = wx;
      if (wx > right) right = wx;
      if (wy < top) top = wy;
      if (wy > bot) bot = wy;
    }
    const r = this.svg.getBoundingClientRect();
    const yTop = this.screenToWorld(0, 0).y;
    const yBot = this.screenToWorld(0, r.height).y;
    const xLeft = this.screenToWorld(0, 0).x;
    const xRight = this.screenToWorld(r.width, 0).x;
    const vline = (x: number, attrs: Record<string, string | number>): void => {
      this.ghostG.append(el("line", { x1: x, y1: yTop, x2: x, y2: yBot, ...attrs }));
    };
    const hline = (y: number, attrs: Record<string, string | number>): void => {
      this.ghostG.append(el("line", { x1: xLeft, y1: y, x2: xRight, y2: y, ...attrs }));
    };
    // габарит — пунктир по границам (лево/право и верх/низ)
    const edge = {
      stroke: "#e03131",
      "stroke-width": 0.25,
      "stroke-dasharray": "1 0.9",
      opacity: 0.55,
    } as const;
    if (Number.isFinite(left) && right - left > 0.01) {
      vline(left, edge);
      vline(right, edge);
    }
    if (Number.isFinite(top) && bot - top > 0.01) {
      hline(top, edge);
      hline(bot, edge);
    }
    // ось симметрии/отражения по точке вставки (сплошная)
    vline(p.x, { stroke: "#e03131", "stroke-width": 0.3, opacity: 0.9 });
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
    this.clearAnnoSelection();
    this.renderInstances();
    this.renderWires();
    this.renderAnnotations();
    this.updateHud();
  }

  private select(inst: SymbolInstance | null): void {
    this.selected = inst;
    this.selectedWire = null;
    this.clearAnnoSelection();
    this.renderWires();
    this.renderInstances();
    this.renderAnnotations();
    this.updateHud();
  }

  /** Снять выделение аннотации (без перерисовки — вызывается перед общей перерисовкой). */
  private clearAnnoSelection(): void {
    if (this.selectedAnno) {
      this.selectedAnno = null;
      this.hooks.onAnnotationStyle?.(null);
    }
  }

  /** Взвести символ для вставки (режим вставки). */
  arm(sym: SymbolDef): void {
    this.exitWireMode();
    this.exitDrawTool();
    this.armed = sym;
    this.armedBlock = null;
    this.multi.clear();
    this.selected = null;
    this.selectedWire = null;
    this.clearAnnoSelection();
    this.pendingRotation = 0;
    this.pendingMirror = false;
    this.svg.style.cursor = "copy";
    this.hooks.onArmedChange?.(sym.id);
    this.renderInstances();
    this.renderGhost();
    this.updateHud();
  }

  /** Взвести блок (макрос-группу) для вставки (S27 Ф4). */
  armBlock(block: BlockDef): void {
    this.exitWireMode();
    this.exitDrawTool();
    this.armed = null;
    this.armedBlock = block;
    this.multi.clear();
    this.selected = null;
    this.selectedWire = null;
    this.clearAnnoSelection();
    this.pendingRotation = 0;
    this.pendingMirror = false;
    this.svg.style.cursor = "copy";
    this.hooks.onArmedChange?.(null);
    this.renderInstances();
    this.renderGhost();
    this.updateHud();
  }

  /** id инстансов под выделением (мульти — приоритетно; иначе одиночный). */
  get selectedIds(): string[] {
    if (this.multi.size > 0) return [...this.multi];
    return this.selected ? [this.selected.id] : [];
  }

  /** Снять мультивыделение (напр. после сохранения блока). */
  clearMulti(): void {
    if (this.multi.size === 0) return;
    this.multi.clear();
    this.renderInstances();
    this.updateHud();
  }

  /** Выйти из режима вставки (символа или блока). */
  private disarm(): void {
    this.armed = null;
    this.armedBlock = null;
    this.svg.style.cursor = "";
    this.ghostG.replaceChildren();
    this.hooks.onArmedChange?.(null);
    this.updateHud();
  }

  /** Включить инструмент «Провод»: 1-полюсный (цепочка) или 3-полюсный (шаг 5 мм). */
  armWire(poles: 1 | 3 = 1): void {
    this.exitDrawTool();
    this.armed = null;
    this.selected = null;
    this.selectedWire = null;
    this.clearAnnoSelection();
    this.renderAnnotations();
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

  /** Delete — удалить выбранный провод, инстанс или аннотацию. */
  deleteSelected(): void {
    if (this.selectedAnno) {
      const a = this.selectedAnno;
      this.selectedAnno = null;
      this.hooks.onAnnotationStyle?.(null);
      this.stack.execute(new RemoveAnnotationCommand(this.page, a));
    } else if (this.selectedWire) {
      const w = this.selectedWire;
      this.selectedWire = null;
      this.stack.execute(new RemoveWireCommand(this.page, w));
    } else if (this.selected) {
      const inst = this.selected;
      this.selected = null;
      this.stack.execute(new RemoveInstanceCommand(this.page, inst));
    }
  }

  /** Ctrl+C — скопировать выделенные инстансы (один или мультивыбор) в буфер. */
  copySelection(): void {
    const ids = this.selectedIds;
    const copied = this.page.instances.filter((i) => ids.includes(i.id)).map((i) => ({ ...i }));
    if (copied.length > 0) this.clip = copied;
  }

  /** Ctrl+V — вставить из буфера со сдвигом, новыми id и сиглами; выделить вставленное. */
  pasteClipboard(): void {
    if (this.clip.length === 0) return;
    const off = this.page.gridStep * 2;
    const adds: AddSymbolInstanceCommand[] = [];
    for (const o of this.clip) {
      const sym = this.library.get(o.symbolId);
      if (!sym) continue;
      adds.push(
        new AddSymbolInstanceCommand(this.page, sym, o.x + off, o.y + off, {
          rotation: o.rotation,
          mirror: o.mirror,
          showLabels: o.showLabels,
          attributes: o.attributes,
          labelFields: o.labelFields,
          catalogCode: o.catalogCode,
          signal: o.signal,
        }),
      );
    }
    if (adds.length === 0) return;
    this.stack.execute(adds.length > 1 ? new MacroCommand(adds) : adds[0]);
    const created = adds.map((a) => a.instance);
    this.multi.clear();
    if (created.length === 1) {
      this.select(created[0]);
    } else {
      for (const i of created) this.multi.add(i.id);
      this.selected = null;
      this.selectedWire = null;
      this.clearAnnoSelection();
      this.renderInstances();
    }
    this.hooks.onSelectionCountChange?.(this.multi.size);
  }

  /** Поставить взведённый символ в точку (с разрезом провода под выводами). */
  private placeArmed(sym: SymbolDef, p: Point, designation?: string): void {
    const addCmd = new AddSymbolInstanceCommand(this.page, sym, p.x, p.y, {
      rotation: this.pendingRotation,
      mirror: this.pendingMirror,
      designation,
    });
    // разрез провода при вставке символа на него (принцип 2)
    const pins = instancePins(sym, {
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
    this.stack.execute(splits.length ? new MacroCommand([addCmd, ...splits]) : addCmd);
    this.select(addCmd.instance);
  }

  /** Esc — завершить/прервать провод, выйти из вставки/рисования, иначе снять выделение. */
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
    if (this.drawTool) {
      if (this.annoStart) {
        this.annoStart = null; // прервать текущую фигуру, остаться в инструменте
        this.ghostG.replaceChildren();
        this.updateHud();
      } else {
        this.exitDrawTool();
      }
      return;
    }
    if (this.armed || this.armedBlock) this.disarm();
    else if (this.multi.size > 0) this.clearMulti();
    else if (this.selectedAnno) this.selectAnno(null);
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
    const drawNames: Record<DrawTool, string> = {
      line: "Линия",
      rect: "Прямоугольник",
      ellipse: "Окружность",
      arrow: "Стрелка",
      text: "Текст",
    };
    const mode = this.wireMode
      ? this.wireStart
        ? "Провод: укажите конец (Esc — завершить)"
        : "Провод: укажите начало"
      : this.drawTool
        ? `Рисование: ${drawNames[this.drawTool]}${this.drawTool === "text" ? " — клик" : " — растяните"}`
        : this.armedBlock
          ? `Вставка блока «${this.armedBlock.name}» (Esc — отмена)`
          : this.armed
            ? `Вставка: ${this.armed.componentCode}${this.pendingMirror ? " ↔" : ""}${this.pendingRotation ? ` ${this.pendingRotation}°` : ""}`
            : this.multi.size > 0
              ? `Выбрано: ${this.multi.size} (Shift+клик; «В блок»)`
              : this.selectedAnno
                ? "Выбрана аннотация (Del — удалить)"
                : this.selectedWire
                  ? "Выбран провод (Del — удалить, 2× — свойства)"
                  : this.selected
                    ? `Выбран: ${this.selected.designation}`
                    : "Выбор";
    this.hud.textContent =
      `${this.page.format.name}  ·  Zoom ${Math.round(this.zoom * 100)}%  ·  ` +
      `Курсор ${fmt(this.last.x)}, ${fmt(this.last.y)} мм  ·  ` +
      `Элементов: ${this.page.instances.length}  ·  ${mode}`;
    this.hooks.onSelectionCountChange?.(this.selectedIds.length);
  }

  private installEvents(): void {
    const svg = this.svg;

    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
      const r = svg.getBoundingClientRect();
      this.last = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);

      // рисование фигуры: запомнить старт (текст ставится по клику на pointerup)
      if (this.drawTool && this.drawTool !== "text" && e.button === 0) {
        this.annoStart = snapPoint(this.last, this.page.gridStep);
        return;
      }

      // ЛКМ по символу/аннотации (вне вставки/провода/рисования) — выбрать и готовить перетаскивание
      if (!this.armed && !this.armedBlock && !this.wireMode && !this.drawTool && e.button === 0) {
        // ручка вращения выделенного инстанса — приоритетнее тела
        if (this.selected) {
          const ssym = this.library.get(this.selected.symbolId);
          if (ssym) {
            const h = this.rotateHandle(this.selected, ssym);
            if (Math.hypot(this.last.x - h.x, this.last.y - h.y) <= 2.2) {
              this.rotating = { inst: this.selected, originRot: this.selected.rotation };
              return;
            }
          }
        }
        const hit = this.hitTest(this.last);
        // Shift+клик — мультивыделение для сборки блока (S27 Ф4), без перетаскивания
        if (hit && e.shiftKey) {
          if (this.multi.has(hit.id)) this.multi.delete(hit.id);
          else this.multi.add(hit.id);
          this.selected = null;
          this.renderInstances();
          this.updateHud();
          return;
        }
        if (hit) {
          if (!this.multi.has(hit.id)) this.multi.clear();
          this.select(hit);
          this.dragging = {
            inst: hit,
            originX: hit.x,
            originY: hit.y,
            grabDX: this.last.x - hit.x,
            grabDY: this.last.y - hit.y,
          };
          return;
        }
        if (this.multi.size > 0) {
          this.multi.clear();
          this.renderInstances();
          this.updateHud();
        }
        const anno = this.hitTestAnnotation(this.last);
        if (anno) {
          this.selectAnno(anno);
          const start = snapPoint(this.last, this.page.gridStep);
          this.annoDrag = { anno, lastX: start.x, lastY: start.y, totalDX: 0, totalDY: 0 };
        } else {
          // пустое место — начать рамку-выделение
          this.marquee = { x0: this.last.x, y0: this.last.y };
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
        if (this.down.moved && this.rotating) {
          // вращение ручкой: угол от «вверх» по часовой, снап к 90°
          const inst = this.rotating.inst;
          const deg = (Math.atan2(this.last.x - inst.x, -(this.last.y - inst.y)) * 180) / Math.PI;
          let snapped = (Math.round(deg / 90) * 90) % 360;
          if (snapped < 0) snapped += 360;
          inst.rotation = snapped as Rotation;
          this.renderInstances();
        } else if (this.down.moved && this.dragging) {
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
        } else if (this.down.moved && this.annoDrag) {
          // перетаскивание аннотации (живой сдвиг; на pointerup — одна команда)
          const target = snapPoint(this.last, this.page.gridStep);
          const dx = target.x - this.annoDrag.lastX;
          const dy = target.y - this.annoDrag.lastY;
          if (dx !== 0 || dy !== 0) {
            translateAnnotation(this.annoDrag.anno, dx, dy);
            this.annoDrag.lastX = target.x;
            this.annoDrag.lastY = target.y;
            this.annoDrag.totalDX += dx;
            this.annoDrag.totalDY += dy;
            this.renderAnnotations();
          }
        } else if (this.down.moved && this.marquee) {
          this.renderMarquee();
        } else if (
          this.down.moved &&
          (this.down.button === 1 || (this.down.button === 0 && !this.drawTool && !this.marquee))
        ) {
          this.panX += e.movementX;
          this.panY += e.movementY;
          this.updateView();
        }
      }
    });

    svg.addEventListener("pointerup", () => {
      // завершить вращение ручкой → команды поворота (на каждый шаг 90°)
      if (this.rotating) {
        const rt = this.rotating;
        this.rotating = null;
        const target = rt.inst.rotation;
        if (this.down?.moved && target !== rt.originRot) {
          rt.inst.rotation = rt.originRot; // откат: do() команд — источник истины
          const steps = ((((target - rt.originRot) / 90) % 4) + 4) % 4;
          const cmds: Command[] = [];
          for (let i = 0; i < steps; i++) cmds.push(new RotateInstanceCommand(rt.inst));
          if (cmds.length) this.stack.execute(cmds.length > 1 ? new MacroCommand(cmds) : cmds[0]);
        }
        this.down = null;
        return;
      }

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

      // завершить перетаскивание аннотации → одна команда Move
      if (this.annoDrag) {
        const ad = this.annoDrag;
        this.annoDrag = null;
        if (this.down?.moved && (ad.totalDX !== 0 || ad.totalDY !== 0)) {
          translateAnnotation(ad.anno, -ad.totalDX, -ad.totalDY); // откат живого сдвига
          this.stack.execute(new MoveAnnotationCommand(ad.anno, ad.totalDX, ad.totalDY));
        }
        this.down = null;
        return;
      }

      // завершить рамку-выделение → собрать инстансы внутри в мультивыделение
      if (this.marquee) {
        const m = this.marquee;
        this.marquee = null;
        this.ghostG.replaceChildren();
        if (this.down?.moved) {
          const x1 = Math.min(m.x0, this.last.x);
          const x2 = Math.max(m.x0, this.last.x);
          const y1 = Math.min(m.y0, this.last.y);
          const y2 = Math.max(m.y0, this.last.y);
          this.multi.clear();
          for (const inst of this.page.instances) {
            if (inst.x >= x1 && inst.x <= x2 && inst.y >= y1 && inst.y <= y2)
              this.multi.add(inst.id);
          }
          this.selected = null;
          this.selectedWire = null;
          this.clearAnnoSelection();
          this.renderInstances();
          this.updateHud();
          this.hooks.onSelectionCountChange?.(this.multi.size);
        }
        this.down = null;
        return;
      }

      // рисование аннотации (фигуры — по drag; текст — по клику)
      if (this.drawTool) {
        const p = snapPoint(this.last, this.page.gridStep);
        if (this.drawTool === "text") {
          if (this.down?.button === 0 && !this.down.moved) {
            const style = { ...this.annoStyle };
            this.hooks.onRequestText?.((text) => {
              const t = text.trim();
              if (!t) return;
              this.stack.execute(
                new AddAnnotationCommand(this.page, {
                  id: newId(),
                  kind: "text",
                  x: p.x,
                  y: p.y,
                  text: t,
                  size: 5,
                  style,
                }),
              );
            });
          }
        } else if (this.annoStart && (p.x !== this.annoStart.x || p.y !== this.annoStart.y)) {
          const shape = this.makeShape(this.drawTool, this.annoStart, p);
          if (shape) this.stack.execute(new AddAnnotationCommand(this.page, shape));
        }
        this.annoStart = null;
        this.ghostG.replaceChildren();
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
          const sym = this.armed;
          const p = snapPoint(this.last, this.page.gridStep);
          // подтверждение сиглы при вставке (master/slave по совпадающей сигле);
          // для соединителей страниц (адресуются меткой) — без модалки
          if (sym.kind !== "page-connector" && this.hooks.onConfirmDesignation) {
            const suggested = nextDesignation(
              this.page.instances.map((i) => i.designation),
              sym.componentCode,
            );
            this.hooks.onConfirmDesignation(suggested, (d) => {
              if (d !== null) this.placeArmed(sym, p, d);
            });
          } else {
            this.placeArmed(sym, p);
          }
        } else if (this.armedBlock) {
          const p = snapPoint(this.last, this.page.gridStep);
          const cmd = new InsertBlockCommand(this.page, this.armedBlock, this.library, p.x, p.y);
          this.stack.execute(cmd); // раскрытие блока в инстансы (режим вставки сохраняется)
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
      // в режиме провода двойной клик завершает цепь соединителем страниц (S29)
      if (this.wireMode) {
        if (this.wireStart) this.placePageConnector(this.wireStart);
        return;
      }
      if (this.armed || this.drawTool) return;
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
