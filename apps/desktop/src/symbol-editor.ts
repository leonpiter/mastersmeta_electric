/**
 * Редактор УГО (S9): рисование примитивов (линия/прямоугольник/окружность) + выводы,
 * атрибуты (название/код/категория/поведение). Сохраняет `SymbolDef` через колбэк.
 * Координаты — локальные мм символа; графика к сетке 1 мм, выводы — к 5 мм.
 */
import {
  validateSymbol,
  type GraphicPrimitive,
  type Pin,
  type SymbolDef,
  type SymbolKind,
} from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Полупролёт окна редактора в мм (viewBox -SPAN..SPAN). */
const SPAN = 24;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const snap = (v: number, step: number): number => Math.round(v / step) * step;

export class SymbolEditor {
  private readonly dialog = document.getElementById("symbol-editor") as HTMLDialogElement;
  private readonly svg = document.getElementById("se-canvas") as unknown as SVGSVGElement;
  private readonly nameEl = document.getElementById("se-name") as HTMLInputElement;
  private readonly codeEl = document.getElementById("se-code") as HTMLInputElement;
  private readonly catEl = document.getElementById("se-cat") as HTMLInputElement;
  private readonly kindEl = document.getElementById("se-kind") as HTMLSelectElement;
  private readonly pinNameEl = document.getElementById("se-pinname") as HTMLInputElement;
  private readonly hintEl = document.getElementById("se-hint")!;
  private readonly toolBtns = document.querySelectorAll<HTMLButtonElement>(
    "#symbol-editor [data-tool]",
  );

  private graphics: GraphicPrimitive[] = [];
  private pins: Pin[] = [];
  private tool: "line" | "rect" | "circle" | "pin" = "line";
  private start: { x: number; y: number } | null = null;
  private editId: string | null = null;

  constructor(private readonly onSave: (sym: SymbolDef) => void) {
    this.svg.setAttribute("viewBox", `${-SPAN} ${-SPAN} ${SPAN * 2} ${SPAN * 2}`);
    this.toolBtns.forEach((b) =>
      b.addEventListener("click", () => {
        this.tool = b.dataset.tool as "line" | "rect" | "circle" | "pin";
        this.toolBtns.forEach((x) => x.classList.toggle("on", x === b));
      }),
    );
    (document.getElementById("se-undo") as HTMLButtonElement).addEventListener("click", () => {
      if (this.pins.length || this.graphics.length) {
        // убрать последнее добавленное (грубо: сначала выводы, потом графику — по факту добавления)
        if (this.lastWasPin) this.pins.pop();
        else this.graphics.pop();
      }
      this.render();
    });
    (document.getElementById("se-clear") as HTMLButtonElement).addEventListener("click", () => {
      this.graphics = [];
      this.pins = [];
      this.render();
    });
    (document.getElementById("se-save") as HTMLButtonElement).addEventListener("click", () =>
      this.save(),
    );
    this.installCanvas();
  }

  private lastWasPin = false;

  /** Открыть редактор: новый символ (seed=undefined) или правка существующего. */
  open(seed?: SymbolDef, opts: { asCopy?: boolean } = {}): void {
    this.graphics = seed ? seed.graphics.map((g) => ({ ...g })) : [];
    this.pins = seed ? seed.pins.map((p) => ({ ...p })) : [];
    this.editId = seed && !opts.asCopy ? seed.id : null;
    this.nameEl.value = seed ? (opts.asCopy ? `${seed.name} (копия)` : seed.name) : "";
    this.codeEl.value = seed?.componentCode ?? "";
    this.catEl.value = seed?.category ?? "Пользовательские";
    this.kindEl.value = seed?.kind ?? "component";
    this.pinNameEl.value = "1";
    this.hintEl.textContent = this.editId
      ? "Правка системного УГО сохранится как пользовательский override."
      : "";
    document.getElementById("se-title")!.textContent = seed
      ? opts.asCopy
        ? "Дублировать символ"
        : "Правка символа"
      : "Новый символ";
    this.render();
    this.dialog.showModal();
    this.nameEl.focus();
  }

  private toLocal(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    return {
      x: -SPAN + ((clientX - r.left) / r.width) * SPAN * 2,
      y: -SPAN + ((clientY - r.top) / r.height) * SPAN * 2,
    };
  }

  private installCanvas(): void {
    this.svg.addEventListener("pointerdown", (e) => {
      const p = this.toLocal(e.clientX, e.clientY);
      if (this.tool === "pin") {
        const at = { x: snap(p.x, 5), y: snap(p.y, 5) };
        const name = this.pinNameEl.value.trim() || String(this.pins.length + 1);
        this.pins.push({ name, x: at.x, y: at.y });
        this.lastWasPin = true;
        const n = Number(name);
        if (Number.isFinite(n)) this.pinNameEl.value = String(n + 1);
        this.render();
        return;
      }
      this.start = { x: snap(p.x, 1), y: snap(p.y, 1) };
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!this.start || this.tool === "pin") return;
      const p = this.toLocal(e.clientX, e.clientY);
      this.render(this.shapeFrom(this.start, { x: snap(p.x, 1), y: snap(p.y, 1) }));
    });
    this.svg.addEventListener("pointerup", (e) => {
      if (!this.start || this.tool === "pin") return;
      const p = this.toLocal(e.clientX, e.clientY);
      const end = { x: snap(p.x, 1), y: snap(p.y, 1) };
      const shape = this.shapeFrom(this.start, end);
      this.start = null;
      if (shape) {
        this.graphics.push(shape);
        this.lastWasPin = false;
      }
      this.render();
    });
    this.svg.addEventListener("pointerleave", () => {
      if (this.start) this.render();
    });
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
    // circle: радиус = расстояние, центр a
    const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    if (r === 0) return null;
    return { type: "circle", cx: a.x, cy: a.y, r };
  }

  private render(preview?: GraphicPrimitive | null): void {
    this.svg.replaceChildren();
    // сетка 5 мм + оси
    for (let v = -SPAN; v <= SPAN; v += 5) {
      const light = v !== 0;
      this.svg.append(
        el("line", {
          x1: v,
          y1: -SPAN,
          x2: v,
          y2: SPAN,
          stroke: light ? "#e4e8ef" : "#b9c2cf",
          "stroke-width": 0.15,
        }),
        el("line", {
          x1: -SPAN,
          y1: v,
          x2: SPAN,
          y2: v,
          stroke: light ? "#e4e8ef" : "#b9c2cf",
          "stroke-width": 0.15,
        }),
      );
    }
    const drawShape = (g: GraphicPrimitive, color: string): void => {
      if (g.type === "line")
        this.svg.append(
          el("line", {
            x1: g.x1,
            y1: g.y1,
            x2: g.x2,
            y2: g.y2,
            stroke: color,
            "stroke-width": 0.4,
          }),
        );
      else if (g.type === "rect")
        this.svg.append(
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
        this.svg.append(
          el("circle", {
            cx: g.cx,
            cy: g.cy,
            r: g.r,
            fill: "none",
            stroke: color,
            "stroke-width": 0.4,
          }),
        );
      else if (g.type === "text") {
        const t = el("text", {
          x: g.x,
          y: g.y,
          "font-size": g.size ?? 4,
          fill: color,
          "text-anchor": g.anchor ?? "middle",
        });
        t.textContent = g.text;
        this.svg.append(t);
      }
    };
    for (const g of this.graphics) drawShape(g, "#1a1a1a");
    if (preview) drawShape(preview, "#1b6fc4");
    for (const p of this.pins) {
      this.svg.append(el("circle", { cx: p.x, cy: p.y, r: 0.8, fill: "#1b6fc4" }));
      const t = el("text", { x: p.x + 1.2, y: p.y - 1, "font-size": 2.4, fill: "#1257a0" });
      t.textContent = p.name;
      this.svg.append(t);
    }
  }

  private save(): void {
    const name = this.nameEl.value.trim();
    const code = this.codeEl.value.trim();
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-zа-я0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "symbol";
    const sym: SymbolDef = {
      id: this.editId ?? `user.${slug}.${Date.now().toString(36)}`,
      name,
      category: this.catEl.value.trim() || "Пользовательские",
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
    this.dialog.close();
  }
}
