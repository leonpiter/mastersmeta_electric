/**
 * Редактор УГО (S9/S27): полноценный редактор с масштабированием (pan/zoom) — от мелких
 * контактов до крупных приборов/контроллеров. Рисование примитивов (линия/прямоугольник/
 * окружность/текст) + выводы, атрибуты (название/код/категория/поведение).
 * Координаты — локальные мм символа; графика/текст к сетке 1 мм, выводы — к 5 мм.
 */
import {
  validateSymbol,
  symbolBounds,
  PX_PER_MM,
  SYMBOL_KINDS,
  CategoryRegistry,
  GOST_CATEGORIES,
  type GraphicPrimitive,
  type Pin,
  type SymbolDef,
  type SymbolKind,
  type EquipmentCategory,
} from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Подписи поведений (kind) для UI. */
const KIND_LABELS: Record<SymbolKind, string> = {
  coil: "Катушка (master)",
  component: "Компонент (уникальная сигла)",
  "component-aux": "Компонент + контакты",
  "contact-no": "Контакт НО",
  "contact-nc": "Контакт НЗ",
  terminal: "Клемма",
  connector: "Разъём",
  "black-box": "Прочее",
};

/** Спец-значение пункта «создать категорию» в выпадающем списке. */
const NEW_CAT = "__new__";

/** slug для id из названия (кириллица/латиница/цифры → дефисы). */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "x";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const snap = (v: number, step: number): number => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface Pt {
  x: number;
  y: number;
}

/** Расстояние от точки до отрезка (мм). */
function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Близко ли к границе прямоугольника. */
function nearRectBorder(p: Pt, x: number, y: number, w: number, h: number, tol: number): boolean {
  const inX = p.x >= x - tol && p.x <= x + w + tol;
  const inY = p.y >= y - tol && p.y <= y + h + tol;
  const nearV = Math.abs(p.x - x) <= tol || Math.abs(p.x - (x + w)) <= tol;
  const nearH = Math.abs(p.y - y) <= tol || Math.abs(p.y - (y + h)) <= tol;
  return (inY && nearV) || (inX && nearH);
}

/** Сдвинуть копию графического примитива на (dx, dy). */
function movedGraphic(g: GraphicPrimitive, dx: number, dy: number): GraphicPrimitive {
  if (g.type === "line")
    return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
  if (g.type === "circle") return { ...g, cx: g.cx + dx, cy: g.cy + dy };
  return { ...g, x: g.x + dx, y: g.y + dy }; // rect | text
}

/**
 * Изменить прямоугольник ручкой (sx,sy — привязанный курсор; minW — мин. размер):
 * угол (nw/ne/se/sw) → пропорционально (фикс. соотношение, противоположный угол закреплён);
 * сторона (n/s/e/w) → одна ось (противоположная сторона закреплена).
 */
function resizeRect(
  g: Extract<GraphicPrimitive, { type: "rect" }>,
  handle: string,
  sx: number,
  sy: number,
  minW: number,
): GraphicPrimitive {
  let { x, y, w, h } = g;
  if (handle.length === 2) {
    // угол — пропорционально; противоположный угол = якорь
    const ratio = h > 0 ? w / h : 1;
    const ax = handle.includes("w") ? x + w : x;
    const ay = handle.includes("n") ? y + h : y;
    const nh = Math.max(minW, Math.abs(sx - ax) / ratio);
    const nw = nh * ratio;
    return {
      type: "rect",
      x: handle.includes("w") ? ax - nw : ax,
      y: handle.includes("n") ? ay - nh : ay,
      w: nw,
      h: nh,
    };
  }
  if (handle === "e") w = Math.max(minW, sx - x);
  else if (handle === "w") {
    const right = x + w;
    w = Math.max(minW, right - sx);
    x = right - w;
  } else if (handle === "s") h = Math.max(minW, sy - y);
  else if (handle === "n") {
    const bottom = y + h;
    h = Math.max(minW, bottom - sy);
    y = bottom - h;
  }
  return { type: "rect", x, y, w, h };
}

/** Авто-инкремент имени вывода: «13»→«14», «A1»→«A2», иначе без изменения (без regex). */
function nextPinName(name: string): string {
  let i = name.length;
  while (i > 0 && name[i - 1] >= "0" && name[i - 1] <= "9") i--;
  if (i === name.length) return name; // нет хвостовых цифр
  return `${name.slice(0, i)}${Number.parseInt(name.slice(i), 10) + 1}`;
}

type Tool = "select" | "resize" | "line" | "rect" | "circle" | "pin" | "text";
/** Выбранный элемент редактора: графика или вывод по индексу. */
type Sel = { kind: "g" | "p"; index: number } | null;
/** Ручка трансформации: id (угол/сторона/конец) + позиция в мм. */
interface Handle {
  id: string;
  x: number;
  y: number;
}

export class SymbolEditor {
  // S28: редактор — режим на всю область канваса (был модальный <dialog>);
  // видимость через класс body.editing-symbol, лента — через onModeChange.
  private readonly svg = document.getElementById("se-canvas") as unknown as SVGSVGElement;
  private readonly nameEl = document.getElementById("se-name") as HTMLInputElement;
  private readonly codeEl = document.getElementById("se-code") as HTMLInputElement;
  private readonly catEl = document.getElementById("se-cat") as HTMLSelectElement;
  private readonly kindEl = document.getElementById("se-kind") as HTMLSelectElement;
  private readonly pinNameEl = document.getElementById("se-pinname") as HTMLInputElement;
  private readonly textEl = document.getElementById("se-text") as HTMLInputElement | null;
  private readonly textSizeEl = document.getElementById("se-textsize") as HTMLInputElement | null;
  private readonly gridEl = document.getElementById("se-grid") as HTMLInputElement;
  // линейки (мм) сверху/слева — S28 Ф3
  private readonly rulerTop = document.getElementById("se-ruler-top") as unknown as SVGSVGElement;
  private readonly rulerLeft = document.getElementById("se-ruler-left") as unknown as SVGSVGElement;
  private readonly zoomEl = document.getElementById("se-zoom");
  private readonly hintEl = document.getElementById("se-hint")!;
  // инструменты рисования теперь в ленте (вкладка «Редактор УГО»)
  private readonly toolBtns =
    document.querySelectorAll<HTMLButtonElement>("#se-ribbon [data-tool]");

  // диалог «Новая категория»
  private readonly catDialog = document.getElementById("category-dialog") as HTMLDialogElement;
  private readonly catNameEl = document.getElementById("cat-name") as HTMLInputElement;
  private readonly catCodeEl = document.getElementById("cat-code") as HTMLInputElement;
  private readonly catKindsEl = document.getElementById("cat-kinds")!;
  private readonly catHintEl = document.getElementById("cat-hint")!;
  /** Предыдущее значение списка категорий (для отката при «+ Новая категория…»). */
  private prevCat = "";

  // слои (как в canvas.ts): сетка-pattern (экранные px) → оси → контент (local mm, трансформ)
  private readonly gridPattern: SVGPatternElement;
  private readonly gridPath: SVGPathElement;
  private readonly gridRect: SVGRectElement;
  private readonly axes: SVGGElement;
  private readonly content: SVGGElement;
  /** Слой направляющих (экранные px, S28 Ф3). */
  private readonly guidesG: SVGGElement;
  /** Слой ручек трансформации (экранные px, поверх контента). */
  private readonly handlesG: SVGGElement;

  private panX = 0;
  private panY = 0;
  private zoom = 1;
  /** Шаг сетки/привязки, мм (S28: меняется в ленте). */
  private gridStep = 5;
  /** Открыт ли редактор (для гейта клавиш). */
  private isOpen = false;
  private get scalePx(): number {
    return PX_PER_MM * this.zoom;
  }

  private graphics: GraphicPrimitive[] = [];
  private pins: Pin[] = [];
  private tool: Tool = "select";
  private start: { x: number; y: number } | null = null;
  private last = { x: 0, y: 0 };
  private down: { x: number; y: number; button: number; moved: boolean } | null = null;
  private space = false;
  private lastWasPin = false;
  private editId: string | null = null;
  // выделение и перетаскивание элемента (инструмент «Выбрать»)
  private selected: Sel = null;
  private dragOrig: { sx: number; sy: number; g?: GraphicPrimitive; p?: Pin } | null = null;
  // трансформация ручкой (инструмент «Размер»): id ручки + исходная графика
  private resizing: { handle: string; orig: GraphicPrimitive } | null = null;
  // направляющие (Visio): вертикальные (по X, мм) и горизонтальные (по Y, мм), только в редакторе
  private guidesX: number[] = [];
  private guidesY: number[] = [];
  private guideDrag: { axis: "x" | "y"; index: number } | null = null;

  constructor(
    private readonly onSave: (sym: SymbolDef) => void,
    /** Реестр категорий (классов оборудования) — задаёт код + допустимые поведения. */
    private readonly getRegistry: () => CategoryRegistry = () =>
      new CategoryRegistry(GOST_CATEGORIES),
    /** Сохранить новую пользовательскую категорию (мёрж в реестр). */
    private readonly onCreateCategory: (cat: EquipmentCategory) => void = () => {
      /* по умолчанию не сохраняем */
    },
    /** Вход/выход режима редактора УГО (для переключения ленты в main.ts). */
    private readonly onModeChange: (active: boolean) => void = () => {
      /* по умолчанию — ничего */
    },
  ) {
    this.svg.removeAttribute("viewBox"); // координаты = экранные px, контент трансформируется

    const defs = el("defs");
    this.gridPattern = el("pattern", {
      id: "se-grid-pattern",
      patternUnits: "userSpaceOnUse",
      width: 1,
      height: 1,
    });
    this.gridPath = el("path", {
      d: "",
      stroke: "#e4e8ef",
      "stroke-width": 1,
      fill: "none",
      "shape-rendering": "crispEdges",
    });
    this.gridPattern.append(this.gridPath);
    defs.append(this.gridPattern);
    this.gridRect = el("rect", { x: 0, y: 0, width: 1, height: 1, fill: "url(#se-grid-pattern)" });
    this.axes = el("g");
    this.content = el("g");
    this.guidesG = el("g", { "data-layer": "guides" });
    this.handlesG = el("g", { "data-layer": "handles" });
    this.svg.append(defs, this.gridRect, this.axes, this.content, this.guidesG, this.handlesG);
    this.installRulers();

    this.toolBtns.forEach((b) =>
      b.addEventListener("click", () => {
        this.tool = b.dataset.tool as Tool;
        this.toolBtns.forEach((x) => x.classList.toggle("on", x === b));
        // выделение сохраняем между «Выбрать» и «Размер», сбрасываем для рисующих инструментов
        if (this.tool !== "select" && this.tool !== "resize") this.selected = null;
        this.resizing = null;
        this.render();
      }),
    );
    (document.getElementById("se-undo") as HTMLButtonElement).addEventListener("click", () => {
      if (this.lastWasPin) this.pins.pop();
      else this.graphics.pop();
      this.render();
    });
    (document.getElementById("se-clear") as HTMLButtonElement).addEventListener("click", () => {
      this.graphics = [];
      this.pins = [];
      this.render();
    });
    document.getElementById("se-fit")?.addEventListener("click", () => this.fit());
    (document.getElementById("se-save") as HTMLButtonElement).addEventListener("click", () =>
      this.save(),
    );
    (document.getElementById("se-cancel") as HTMLButtonElement).addEventListener("click", () =>
      this.exit(),
    );
    this.gridEl.addEventListener("change", () => {
      // любой шаг кратно 0,1 мм (мин. 0,1) — пресеты 1/2.5/5/10 в datalist
      let step = Math.round(Number(this.gridEl.value) * 10) / 10;
      if (!(step >= 0.1)) step = 0.1;
      this.gridStep = step;
      this.gridEl.value = String(step);
      try {
        localStorage.setItem("see.ugoGridStep", String(step));
      } catch {
        /* недоступно — игнор */
      }
      this.updateView();
    });

    // строгие категории: выбор задаёт код + ограничивает поведение; «+ Новая категория…»
    this.catEl.addEventListener("change", () => {
      if (this.catEl.value === NEW_CAT) {
        this.catEl.value = this.prevCat; // вернуть прежнюю, пока новая не создана
        this.openNewCategory();
        return;
      }
      this.prevCat = this.catEl.value;
      this.applyCategory();
    });
    (document.getElementById("cat-create") as HTMLButtonElement).addEventListener("click", () =>
      this.createCategory(),
    );

    this.installCanvas();
  }

  /** Открыть редактор: новый символ (seed=undefined) или правка существующего. */
  open(seed?: SymbolDef, opts: { asCopy?: boolean } = {}): void {
    this.graphics = seed ? seed.graphics.map((g) => ({ ...g })) : [];
    this.pins = seed ? seed.pins.map((p) => ({ ...p })) : [];
    this.selected = null;
    this.dragOrig = null;
    this.resizing = null;
    this.guidesX = [];
    this.guidesY = [];
    this.guideDrag = null;
    this.editId = seed && !opts.asCopy ? seed.id : null;
    this.nameEl.value = seed ? (opts.asCopy ? `${seed.name} (копия)` : seed.name) : "";
    this.codeEl.value = seed?.componentCode ?? "";
    this.populateCategories(seed?.category ?? "");
    this.applyCategory(seed?.kind ?? "component");
    this.pinNameEl.value = "1";
    this.hintEl.textContent = this.editId
      ? "Правка системного УГО — сохранится как override. Направляющие — тяните из линеек (на линейку или 2× — убрать)."
      : "Колесо — масштаб; Space — панорама; Esc — отмена. Направляющие — тяните из линеек (назад на линейку или 2× — убрать).";
    const mode = seed ? (opts.asCopy ? "Копия" : "Правка") : "Новый символ";
    const titleName = seed ? `${mode}: ${this.nameEl.value}` : mode;
    document.getElementById("se-title")!.textContent = `Редактор УГО — ${titleName}`;

    // шаг сетки (из localStorage)
    const savedStep = Number(localStorage.getItem("see.ugoGridStep"));
    this.gridStep = savedStep > 0 ? savedStep : 5;
    this.gridEl.value = String(this.gridStep);

    // вход в режим редактора: подсветка + переключение ленты на вкладку «Редактор УГО»
    this.isOpen = true;
    document.body.classList.add("editing-symbol");
    this.onModeChange(true);
    this.nameEl.focus();
    // у svg нет размера до показа — вписать после раскладки
    requestAnimationFrame(() => this.fit());
  }

  /** Выйти из режима редактора (Отмена или после Сохранить). */
  private exit(): void {
    this.isOpen = false;
    this.selected = null;
    this.start = null;
    this.down = null;
    document.body.classList.remove("editing-symbol");
    this.onModeChange(false);
  }

  // ----- категории (строгая типизация) -----

  /** Заполнить выпадающий список категориями реестра (+ пункт «Новая…»). */
  private populateCategories(selected: string): void {
    const names = this.getRegistry()
      .all()
      .map((c) => c.name);
    // легаси-категория сохранённого символа (нет в реестре) — показать, чтобы не терять
    if (selected && !names.includes(selected)) names.unshift(selected);
    const options = names.map((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      return o;
    });
    const add = document.createElement("option");
    add.value = NEW_CAT;
    add.textContent = "➕ Новая категория…";
    this.catEl.replaceChildren(...options, add);
    this.catEl.value = selected !== "" ? selected : (names[0] ?? "");
    this.prevCat = this.catEl.value;
  }

  /** Применить выбранную категорию: код (read-only, если задан) + допустимые поведения. */
  private applyCategory(preferredKind?: string): void {
    const cat = this.getRegistry().byName(this.catEl.value);
    if (cat) {
      this.populateKinds(cat.kinds, preferredKind);
      if (cat.componentCode) {
        this.codeEl.value = cat.componentCode;
        this.codeEl.readOnly = true;
      } else {
        this.codeEl.readOnly = false; // «Прочее» — код вводится вручную
      }
    } else {
      this.populateKinds(SYMBOL_KINDS, preferredKind); // легаси/неизвестная — без ограничений
      this.codeEl.readOnly = false;
    }
  }

  /** Перестроить список поведений допустимыми для категории; сохранить выбор, если возможен. */
  private populateKinds(kinds: readonly SymbolKind[], preferred?: string): void {
    const want = preferred ?? this.kindEl.value;
    this.kindEl.replaceChildren(
      ...kinds.map((k) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = KIND_LABELS[k];
        return o;
      }),
    );
    this.kindEl.value = kinds.includes(want as SymbolKind) ? want : (kinds[0] ?? "");
  }

  /** Открыть диалог создания пользовательской категории. */
  private openNewCategory(): void {
    this.catNameEl.value = "";
    this.catCodeEl.value = "";
    this.catHintEl.textContent = "";
    this.catKindsEl.replaceChildren(
      ...SYMBOL_KINDS.map((k) => {
        const label = document.createElement("label");
        label.className = "cat-kind";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = k;
        if (k === "component") cb.checked = true;
        const span = document.createElement("span");
        span.textContent = KIND_LABELS[k];
        label.append(cb, span);
        return label;
      }),
    );
    this.catDialog.showModal();
    this.catNameEl.focus();
  }

  /** Создать пользовательскую категорию из диалога и выбрать её. */
  private createCategory(): void {
    const name = this.catNameEl.value.trim();
    const code = this.catCodeEl.value.trim();
    const kinds = [...this.catKindsEl.querySelectorAll<HTMLInputElement>("input:checked")].map(
      (cb) => cb.value as SymbolKind,
    );
    if (!name) {
      this.catHintEl.textContent = "Укажите название категории.";
      return;
    }
    if (this.getRegistry().byName(name)) {
      this.catHintEl.textContent = "Категория с таким именем уже есть.";
      return;
    }
    if (kinds.length === 0) {
      this.catHintEl.textContent = "Выберите хотя бы одно поведение.";
      return;
    }
    const cat: EquipmentCategory = {
      id: `user.cat.${slugify(name)}.${Date.now().toString(36)}`,
      name,
      componentCode: code,
      kinds,
      attributes: [],
      user: true,
    };
    this.onCreateCategory(cat);
    this.catDialog.close();
    this.populateCategories(name);
    this.applyCategory();
  }

  // ----- вид (pan/zoom) -----

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.panX) / this.scalePx, y: (sy - this.panY) / this.scalePx };
  }

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    return this.screenToWorld(clientX - r.left, clientY - r.top);
  }

  private size(): { w: number; h: number } {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width || 520, h: r.height || 460 };
  }

  /** Габариты содержимого (мм) с полями, либо окно по умолчанию при пустом символе. */
  private bounds(): { x: number; y: number; w: number; h: number } {
    const b = symbolBounds({ graphics: this.graphics, pins: this.pins } as SymbolDef);
    if (b.w === 0 && b.h === 0) return { x: -30, y: -30, w: 60, h: 60 };
    const pad = 6;
    return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }

  private fit(): void {
    const { w, h } = this.size();
    const b = this.bounds();
    const margin = 0.85;
    this.zoom = clamp(
      Math.min((w * margin) / (b.w * PX_PER_MM), (h * margin) / (b.h * PX_PER_MM)),
      0.2,
      64,
    );
    const s = this.scalePx;
    this.panX = w / 2 - (b.x + b.w / 2) * s;
    this.panY = h / 2 - (b.y + b.h / 2) * s;
    this.updateView();
    this.render();
  }

  private updateView(): void {
    const s = this.scalePx;
    const { w, h } = this.size();
    this.content.setAttribute("transform", `translate(${this.panX} ${this.panY}) scale(${s})`);
    this.gridRect.setAttribute("width", String(w));
    this.gridRect.setAttribute("height", String(h));

    // сетка совпадает с линейкой: шаг = мелкий штрих линейки, привязка к мировому 0
    const tile = this.pickStep().minor * s;
    const ox = ((this.panX % tile) + tile) % tile;
    const oy = ((this.panY % tile) + tile) % tile;
    this.gridPattern.setAttribute("width", String(tile));
    this.gridPattern.setAttribute("height", String(tile));
    this.gridPattern.setAttribute("patternTransform", `translate(${ox} ${oy})`);
    this.gridPath.setAttribute("d", `M 0 0 H ${tile} M 0 0 V ${tile}`);

    // оси (0,0) — в экранных координатах, постоянная толщина
    this.axes.replaceChildren();
    if (this.panX >= 0 && this.panX <= w)
      this.axes.append(
        el("line", {
          x1: this.panX,
          y1: 0,
          x2: this.panX,
          y2: h,
          stroke: "#b9c2cf",
          "stroke-width": 0.8,
        }),
      );
    if (this.panY >= 0 && this.panY <= h)
      this.axes.append(
        el("line", {
          x1: 0,
          y1: this.panY,
          x2: w,
          y2: this.panY,
          stroke: "#b9c2cf",
          "stroke-width": 0.8,
        }),
      );

    if (this.zoomEl) this.zoomEl.textContent = `${Math.round(this.zoom * 100)}%`;
    this.renderHandles();
    this.renderRulers();
    this.renderGuides();
  }

  /**
   * «Красивый» шаг линейки/сетки: крупный (с подписью) ~>= 55 px, мелкий = major/5.
   * Один источник для линейки И сетки канваса — чтобы они совпадали.
   */
  private pickStep(): { major: number; minor: number } {
    const s = this.scalePx;
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let major = steps[steps.length - 1];
    for (const st of steps) {
      if (st * s >= 55) {
        major = st;
        break;
      }
    }
    return { major, minor: major / 5 };
  }

  /** Линейки (мм) сверху/слева — следуют за pan/zoom (S28 Ф3). */
  private renderRulers(): void {
    const s = this.scalePx;
    const { w, h } = this.size();
    const RW = 20;
    this.rulerTop.setAttribute("width", String(w));
    this.rulerTop.setAttribute("height", String(RW));
    this.rulerLeft.setAttribute("width", String(RW));
    this.rulerLeft.setAttribute("height", String(h));
    this.rulerTop.replaceChildren();
    this.rulerLeft.replaceChildren();

    const { minor } = this.pickStep();
    const tick = (x1: number, y1: number, x2: number, y2: number): SVGElement =>
      el("line", { x1, y1, x2, y2, stroke: "#7f8c9b", "stroke-width": 0.6 });

    // верхняя линейка (вертикальные штрихи по X)
    const mx0 = Math.ceil(this.screenToWorld(0, 0).x / minor) * minor;
    for (let m = mx0; ; m += minor) {
      const sx = this.panX + m * s;
      if (sx > w) break;
      const isMajor = ((Math.round(m / minor) % 5) + 5) % 5 === 0;
      this.rulerTop.append(tick(sx, isMajor ? 3 : 12, sx, RW));
      if (isMajor) {
        const t = el("text", { x: sx + 1.5, y: 9, "font-size": 8, fill: "#5a6b7d" });
        t.textContent = String(Math.round(m));
        this.rulerTop.append(t);
      }
    }
    // левая линейка (горизонтальные штрихи по Y)
    const my0 = Math.ceil(this.screenToWorld(0, 0).y / minor) * minor;
    for (let m = my0; ; m += minor) {
      const sy = this.panY + m * s;
      if (sy > h) break;
      const isMajor = ((Math.round(m / minor) % 5) + 5) % 5 === 0;
      this.rulerLeft.append(tick(isMajor ? 3 : 12, sy, RW, sy));
      if (isMajor) {
        const t = el("text", { x: 2, y: sy - 1.5, "font-size": 8, fill: "#5a6b7d" });
        t.textContent = String(Math.round(m));
        this.rulerLeft.append(t);
      }
    }
  }

  // ----- направляющие (Visio): вытаскиваются из линеек, только в редакторе -----

  private installRulers(): void {
    const rt = this.rulerTop;
    const rl = this.rulerLeft;
    rt.addEventListener("pointerdown", (e) => {
      rt.setPointerCapture(e.pointerId);
      this.guidesX.push(snap(this.clientToWorld(e.clientX, e.clientY).x, this.gridStep));
      this.guideDrag = { axis: "x", index: this.guidesX.length - 1 };
      this.renderGuides();
    });
    rt.addEventListener("pointermove", (e) => {
      if (this.guideDrag?.axis !== "x") return;
      this.guidesX[this.guideDrag.index] = snap(
        this.clientToWorld(e.clientX, e.clientY).x,
        this.gridStep,
      );
      this.renderGuides();
    });
    rt.addEventListener("pointerup", (e) => {
      if (this.guideDrag?.axis !== "x") return;
      // отпустили над линейкой (не над канвасом) — убрать направляющую
      if (e.clientY < this.svg.getBoundingClientRect().top)
        this.guidesX.splice(this.guideDrag.index, 1);
      this.guideDrag = null;
      this.renderGuides();
    });
    rl.addEventListener("pointerdown", (e) => {
      rl.setPointerCapture(e.pointerId);
      this.guidesY.push(snap(this.clientToWorld(e.clientX, e.clientY).y, this.gridStep));
      this.guideDrag = { axis: "y", index: this.guidesY.length - 1 };
      this.renderGuides();
    });
    rl.addEventListener("pointermove", (e) => {
      if (this.guideDrag?.axis !== "y") return;
      this.guidesY[this.guideDrag.index] = snap(
        this.clientToWorld(e.clientX, e.clientY).y,
        this.gridStep,
      );
      this.renderGuides();
    });
    rl.addEventListener("pointerup", (e) => {
      if (this.guideDrag?.axis !== "y") return;
      if (e.clientX < this.svg.getBoundingClientRect().left)
        this.guidesY.splice(this.guideDrag.index, 1);
      this.guideDrag = null;
      this.renderGuides();
    });
    document.getElementById("se-corner")?.addEventListener("dblclick", () => {
      this.guidesX = [];
      this.guidesY = [];
      this.renderGuides();
    });
  }

  /** Нарисовать направляющие (экранные px) — линии через весь канвас. */
  private renderGuides(): void {
    this.guidesG.replaceChildren();
    const s = this.scalePx;
    const { w, h } = this.size();
    for (const gx of this.guidesX)
      this.guidesG.append(
        el("line", {
          x1: this.panX + gx * s,
          y1: 0,
          x2: this.panX + gx * s,
          y2: h,
          stroke: "#1aa37a",
          "stroke-width": 0.7,
          "stroke-dasharray": "5 3",
        }),
      );
    for (const gy of this.guidesY)
      this.guidesG.append(
        el("line", {
          x1: 0,
          y1: this.panY + gy * s,
          x2: w,
          y2: this.panY + gy * s,
          stroke: "#1aa37a",
          "stroke-width": 0.7,
          "stroke-dasharray": "5 3",
        }),
      );
  }

  /** Направляющая под точкой (мм), допуск ~4 px. */
  private hitGuide(p: Pt): { axis: "x" | "y"; index: number } | null {
    const tol = Math.max(0.4, 4 / this.scalePx);
    for (let i = this.guidesX.length - 1; i >= 0; i--)
      if (Math.abs(p.x - this.guidesX[i]) <= tol) return { axis: "x", index: i };
    for (let i = this.guidesY.length - 1; i >= 0; i--)
      if (Math.abs(p.y - this.guidesY[i]) <= tol) return { axis: "y", index: i };
    return null;
  }

  // ----- ввод -----

  private installCanvas(): void {
    const svg = this.svg;
    // клавиши работают только в режиме редактора и не в полях ввода
    document.addEventListener("keydown", (e) => {
      if (!this.isOpen || document.activeElement?.tagName === "INPUT") return;
      if (e.key === " ") {
        this.space = true;
        e.preventDefault();
      } else if (e.key === "Escape") {
        // Esc НЕ закрывает редактор — только прерывает текущее действие / снимает выделение
        e.preventDefault();
        this.start = null;
        this.selected = null;
        this.dragOrig = null;
        this.render();
      } else if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
        e.preventDefault();
        this.deleteSelected();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (this.isOpen && e.key === " ") this.space = false;
    });

    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      this.last = this.clientToWorld(e.clientX, e.clientY);
      this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
      if (e.button === 1 || this.space) return; // пан
      if (e.button !== 0) return;
      if (this.tool === "select" || this.tool === "resize") {
        // схватить направляющую (приоритетнее фигур)
        const gh = this.hitGuide(this.last);
        if (gh) {
          this.guideDrag = gh;
          return;
        }
        // в режиме «Размер» сначала пробуем схватить ручку трансформации выделенной графики
        if (this.tool === "resize" && this.selected?.kind === "g") {
          const g = this.graphics[this.selected.index];
          const h = this.hitHandle(g, this.last);
          if (h) {
            this.resizing = { handle: h.id, orig: { ...g } };
            return;
          }
        }
        this.selected = this.hitAt(this.last);
        if (this.selected) {
          const step = this.gridStep;
          this.dragOrig = {
            sx: snap(this.last.x, step),
            sy: snap(this.last.y, step),
            g: this.selected.kind === "g" ? { ...this.graphics[this.selected.index] } : undefined,
            p: this.selected.kind === "p" ? { ...this.pins[this.selected.index] } : undefined,
          };
        }
        this.render();
        return;
      }
      if (this.tool === "pin") {
        const at = { x: snap(this.last.x, this.gridStep), y: snap(this.last.y, this.gridStep) };
        const name = this.pinNameEl.value.trim() || String(this.pins.length + 1);
        this.pins.push({ name, x: at.x, y: at.y });
        this.lastWasPin = true;
        this.pinNameEl.value = nextPinName(name);
        this.render();
        return;
      }
      if (this.tool === "text") {
        const text = (this.textEl?.value ?? "").trim();
        if (text) {
          const size = Number(this.textSizeEl?.value) || 4;
          this.graphics.push({
            type: "text",
            x: snap(this.last.x, this.gridStep),
            y: snap(this.last.y, this.gridStep),
            text,
            size,
            anchor: "middle",
          });
          this.lastWasPin = false;
          this.render();
        }
        return;
      }
      this.start = { x: snap(this.last.x, this.gridStep), y: snap(this.last.y, this.gridStep) };
    });

    svg.addEventListener("pointermove", (e) => {
      this.last = this.clientToWorld(e.clientX, e.clientY);
      if (!this.down) return;
      if (!this.down.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 3)
        this.down.moved = true;
      if (!this.down.moved) return;
      if (this.guideDrag) {
        if (this.guideDrag.axis === "x")
          this.guidesX[this.guideDrag.index] = snap(this.last.x, this.gridStep);
        else this.guidesY[this.guideDrag.index] = snap(this.last.y, this.gridStep);
        this.renderGuides();
      } else if (this.down.button === 1 || this.space) {
        this.panX += e.movementX;
        this.panY += e.movementY;
        this.updateView();
      } else if (this.resizing) {
        this.resizeSelected();
      } else if (this.selected && this.dragOrig) {
        this.dragSelected();
      } else if (this.start) {
        const end = { x: snap(this.last.x, this.gridStep), y: snap(this.last.y, this.gridStep) };
        this.render(this.shapeFrom(this.start, end));
      }
    });

    svg.addEventListener("pointerup", (e) => {
      // завершить перетаскивание направляющей: отпустили за пределами канваса
      // (на линейке/вне) — удалить (как в Visio)
      if (this.guideDrag) {
        const r = this.svg.getBoundingClientRect();
        const outside =
          e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        const gd = this.guideDrag;
        if (outside) {
          if (gd.axis === "x") this.guidesX.splice(gd.index, 1);
          else this.guidesY.splice(gd.index, 1);
        }
        this.guideDrag = null;
        this.renderGuides();
        this.down = null;
        return;
      }
      if (this.start) {
        const end = { x: snap(this.last.x, this.gridStep), y: snap(this.last.y, this.gridStep) };
        const shape = this.shapeFrom(this.start, end);
        this.start = null;
        if (shape) {
          this.graphics.push(shape);
          this.lastWasPin = false;
        }
        this.render();
      }
      this.dragOrig = null;
      this.resizing = null;
      this.down = null;
    });

    // двойной клик по направляющей — удалить её
    svg.addEventListener("dblclick", (e) => {
      const gh = this.hitGuide(this.clientToWorld(e.clientX, e.clientY));
      if (gh) {
        if (gh.axis === "x") this.guidesX.splice(gh.index, 1);
        else this.guidesY.splice(gh.index, 1);
        this.renderGuides();
      }
    });

    svg.addEventListener("pointerleave", () => {
      if (this.start) this.render();
    });

    svg.addEventListener("contextmenu", (e) => e.preventDefault());

    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const before = this.screenToWorld(sx, sy);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.zoom = clamp(this.zoom * factor, 0.2, 64);
        this.panX = sx - before.x * this.scalePx;
        this.panY = sy - before.y * this.scalePx;
        this.updateView();
      },
      { passive: false },
    );
  }

  private shapeFrom(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): GraphicPrimitive | null {
    if (this.tool === "line") {
      if (a.x === b.x && a.y === b.y) return null;
      return { type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    if (this.tool === "rect") {
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (w === 0 || h === 0) return null;
      return { type: "rect", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h };
    }
    if (this.tool === "circle") {
      const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
      if (r === 0) return null;
      return { type: "circle", cx: a.x, cy: a.y, r };
    }
    return null;
  }

  // ----- выбор / перемещение / удаление элемента -----

  /** Элемент под точкой (выводы приоритетнее графики). Допуск ~6 px. */
  private hitAt(p: Pt): Sel {
    const tol = Math.max(1.2, 6 / this.scalePx);
    for (let i = this.pins.length - 1; i >= 0; i--) {
      const k = this.pins[i];
      if (Math.hypot(p.x - k.x, p.y - k.y) <= tol + 0.8) return { kind: "p", index: i };
    }
    for (let i = this.graphics.length - 1; i >= 0; i--) {
      if (this.onGraphic(this.graphics[i], p, tol)) return { kind: "g", index: i };
    }
    return null;
  }

  private onGraphic(g: GraphicPrimitive, p: Pt, tol: number): boolean {
    if (g.type === "line") return distSeg(p, { x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }) <= tol;
    if (g.type === "rect") return nearRectBorder(p, g.x, g.y, g.w, g.h, tol);
    if (g.type === "circle") return Math.abs(Math.hypot(p.x - g.cx, p.y - g.cy) - g.r) <= tol;
    const s = g.size ?? 4;
    const w = Math.max(g.text.length * s * 0.6, 2);
    const x0 = g.anchor === "middle" ? g.x - w / 2 : g.anchor === "end" ? g.x - w : g.x;
    return p.x >= x0 - tol && p.x <= x0 + w + tol && p.y >= g.y - s - tol && p.y <= g.y + tol;
  }

  private dragSelected(): void {
    const sel = this.selected;
    const orig = this.dragOrig;
    if (!sel || !orig) return;
    const step = this.gridStep;
    const dx = snap(this.last.x, step) - orig.sx;
    const dy = snap(this.last.y, step) - orig.sy;
    if (sel.kind === "g" && orig.g) this.graphics[sel.index] = movedGraphic(orig.g, dx, dy);
    else if (sel.kind === "p" && orig.p)
      this.pins[sel.index] = { ...orig.p, x: orig.p.x + dx, y: orig.p.y + dy };
    this.render();
  }

  private deleteSelected(): void {
    const sel = this.selected;
    if (!sel) return;
    if (sel.kind === "g") this.graphics.splice(sel.index, 1);
    else this.pins.splice(sel.index, 1);
    this.selected = null;
    this.dragOrig = null;
    this.resizing = null;
    this.render();
  }

  // ----- трансформация ручками (инструмент «Размер») -----

  /** Позиции ручек элемента (мм): прямоугольник — 8, окружность — 4, линия — 2 конца. */
  private handlePoints(g: GraphicPrimitive): Handle[] {
    if (g.type === "rect") {
      const { x, y, w, h } = g;
      return [
        { id: "nw", x, y },
        { id: "n", x: x + w / 2, y },
        { id: "ne", x: x + w, y },
        { id: "e", x: x + w, y: y + h / 2 },
        { id: "se", x: x + w, y: y + h },
        { id: "s", x: x + w / 2, y: y + h },
        { id: "sw", x, y: y + h },
        { id: "w", x, y: y + h / 2 },
      ];
    }
    if (g.type === "circle")
      return [
        { id: "n", x: g.cx, y: g.cy - g.r },
        { id: "e", x: g.cx + g.r, y: g.cy },
        { id: "s", x: g.cx, y: g.cy + g.r },
        { id: "w", x: g.cx - g.r, y: g.cy },
      ];
    if (g.type === "line")
      return [
        { id: "a", x: g.x1, y: g.y1 },
        { id: "b", x: g.x2, y: g.y2 },
      ];
    return []; // текст — без ручек (кегль через поле)
  }

  /** Ручка под точкой (мм), допуск ~7 px. */
  private hitHandle(g: GraphicPrimitive, p: Pt): Handle | null {
    const tol = Math.max(0.6, 7 / this.scalePx);
    for (const h of this.handlePoints(g)) {
      if (Math.abs(p.x - h.x) <= tol && Math.abs(p.y - h.y) <= tol) return h;
    }
    return null;
  }

  private resizeSelected(): void {
    const sel = this.selected;
    const rz = this.resizing;
    if (sel?.kind !== "g" || !rz) return;
    const step = this.gridStep;
    const sx = snap(this.last.x, step);
    const sy = snap(this.last.y, step);
    const g = rz.orig;
    let next: GraphicPrimitive = g;
    if (g.type === "rect") next = resizeRect(g, rz.handle, sx, sy, step);
    else if (g.type === "circle") {
      const r =
        rz.handle === "e"
          ? sx - g.cx
          : rz.handle === "w"
            ? g.cx - sx
            : rz.handle === "s"
              ? sy - g.cy
              : g.cy - sy;
      next = { ...g, r: Math.max(step, Math.abs(r)) };
    } else if (g.type === "line") {
      next = rz.handle === "a" ? { ...g, x1: sx, y1: sy } : { ...g, x2: sx, y2: sy };
    }
    this.graphics[sel.index] = next;
    this.render();
  }

  /** Нарисовать ручки выделенной графики (экранные px) — только в режиме «Размер». */
  private renderHandles(): void {
    this.handlesG.replaceChildren();
    if (this.tool !== "resize" || this.selected?.kind !== "g") return;
    const g = this.graphics[this.selected.index];
    if (!g) return;
    const s = this.scalePx;
    const hs = 4;
    for (const h of this.handlePoints(g)) {
      const cx = this.panX + h.x * s;
      const cy = this.panY + h.y * s;
      this.handlesG.append(
        g.type === "line"
          ? el("circle", {
              cx,
              cy,
              r: hs + 1,
              fill: "#fff",
              stroke: "#1b6fc4",
              "stroke-width": 1.4,
            })
          : el("rect", {
              x: cx - hs,
              y: cy - hs,
              width: hs * 2,
              height: hs * 2,
              fill: "#fff",
              stroke: "#1b6fc4",
              "stroke-width": 1.4,
            }),
      );
    }
  }

  private isSel(kind: "g" | "p", i: number): boolean {
    return this.selected?.kind === kind && this.selected.index === i;
  }

  // ----- рендер контента (local mm) -----

  private render(preview?: GraphicPrimitive | null): void {
    this.content.replaceChildren();
    this.graphics.forEach((g, i) => this.drawShape(g, this.isSel("g", i) ? "#e8731c" : "#1a1a1a"));
    if (preview) this.drawShape(preview, "#1b6fc4");
    this.pins.forEach((p, i) => {
      this.content.append(el("circle", { cx: p.x, cy: p.y, r: 0.8, fill: "#1b6fc4" }));
      if (this.isSel("p", i))
        this.content.append(
          el("circle", {
            cx: p.x,
            cy: p.y,
            r: 1.8,
            fill: "none",
            stroke: "#e8731c",
            "stroke-width": 0.3,
          }),
        );
      const t = el("text", { x: p.x + 1.2, y: p.y - 1, "font-size": 2.4, fill: "#1257a0" });
      t.textContent = p.name;
      this.content.append(t);
    });
    this.renderHandles();
  }

  private drawShape(g: GraphicPrimitive, color: string): void {
    if (g.type === "line")
      this.content.append(
        el("line", { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, stroke: color, "stroke-width": 0.4 }),
      );
    else if (g.type === "rect")
      this.content.append(
        el("rect", {
          x: g.x,
          y: g.y,
          width: g.w,
          height: g.h,
          fill: "none",
          stroke: color,
          "stroke-width": 0.4,
        }),
      );
    else if (g.type === "circle")
      this.content.append(
        el("circle", {
          cx: g.cx,
          cy: g.cy,
          r: g.r,
          fill: "none",
          stroke: color,
          "stroke-width": 0.4,
        }),
      );
    else {
      const t = el("text", {
        x: g.x,
        y: g.y,
        "font-size": g.size ?? 4,
        fill: color,
        "text-anchor": g.anchor ?? "middle",
      });
      t.textContent = g.text;
      this.content.append(t);
    }
  }

  private save(): void {
    const name = this.nameEl.value.trim();
    const code = this.codeEl.value.trim();
    const sym: SymbolDef = {
      id: this.editId ?? `user.${slugify(name)}.${Date.now().toString(36)}`,
      name,
      category: this.catEl.value,
      componentCode: code,
      kind: this.kindEl.value as SymbolKind,
      graphics: this.graphics,
      pins: this.pins,
    };
    const v = validateSymbol(sym);
    if (!v.ok) {
      this.hintEl.textContent = "Не сохранено: " + v.errors.join("; ");
      return;
    }
    if (this.pins.length === 0) {
      this.hintEl.textContent = "Добавьте хотя бы один вывод.";
      return;
    }
    this.onSave(v.symbol);
    this.exit();
  }
}
