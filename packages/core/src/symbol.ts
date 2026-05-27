/**
 * Символы (УГО) — графические условные обозначения.
 * Слой 2 доменной модели (CLAUDE принцип 3): декуплено от каталога и схемы.
 *
 * `SymbolDef` — чистые данные (графика в мм + выводы + поведение `kind` + код ГОСТ).
 * Открытый формат `*.symbol.json` = `SymbolDef` + `formatVersion` (см. schemas/symbol.schema.json).
 * Рендер в SVG — на стороне клиента (пока в `apps/desktop`, позже `core/render`).
 */
import type { Point } from "./geometry";
import type { Rect } from "./sheet";

/** Версия формата `*.symbol.json` (для миграций, принцип 7). */
export const SYMBOL_FORMAT_VERSION = 1;

/**
 * Поведение символа (источник — Crea blocco в See Electrical, см. ARCHITECTURE).
 * Определяет логику связности/кросс-референсов (master/slave) на следующих спринтах.
 */
export type SymbolKind =
  | "coil" // катушка (авто contact cross)
  | "component" // уникальная сигла (двигатель, лампа)
  | "component-aux" // уникальная + доп. контакты (автомат, разъединитель)
  | "contact-no" // нормально разомкнутый контакт
  | "contact-nc" // нормально замкнутый контакт
  | "terminal" // клемма
  | "connector" // разъём
  | "black-box"; // прочее

export const SYMBOL_KINDS: readonly SymbolKind[] = [
  "coil",
  "component",
  "component-aux",
  "contact-no",
  "contact-nc",
  "terminal",
  "connector",
  "black-box",
];

/** Графический примитив УГО (координаты в мм, локальные к символу). */
export type GraphicPrimitive =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "arc"; cx: number; cy: number; r: number; a0: number; a1: number }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      size?: number;
      anchor?: "start" | "middle" | "end";
    };

/** Точка на окружности (мм) для угла в градусах (y вниз). */
export function polarPoint(cx: number, cy: number, r: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG-путь дуги (центр/радиус/углы в градусах) — общий для рендера и редактора. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = polarPoint(cx, cy, r, a0);
  const p1 = polarPoint(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 >= a0 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.y}`;
}

/** Вывод символа: имя (IEC: «A1», «13», «1») и положение в мм (на сетке 5 мм). */
export interface Pin {
  name: string;
  x: number;
  y: number;
}

/** Определение УГО (то, что лежит в библиотеке и в `*.symbol.json`). */
export interface SymbolDef {
  /** Стабильный id, напр. «gost.qf». */
  id: string;
  name: string;
  category: string;
  /** Префикс позобозначения по ГОСТ 2.710 (QF/QS/KM/...). */
  componentCode: string;
  kind: SymbolKind;
  graphics: GraphicPrimitive[];
  pins: Pin[];
}

/** Углы поворота инстанса — кратны 90° (выводы остаются на сетке). */
export type Rotation = 0 | 90 | 180 | 270;

/** Канонизировать «-0» в «0» (для устойчивых сравнений и сериализации). */
const nz = (n: number): number => (n === 0 ? 0 : n);

/** Повернуть точку вокруг (0,0) на кратный 90° угол (экранные координаты, y вниз). */
export function rotatePoint(p: Point, deg: Rotation): Point {
  switch (deg) {
    case 0:
      return { x: nz(p.x), y: nz(p.y) };
    case 90:
      return { x: nz(-p.y), y: nz(p.x) };
    case 180:
      return { x: nz(-p.x), y: nz(-p.y) };
    case 270:
      return { x: nz(p.y), y: nz(-p.x) };
  }
}

/**
 * Преобразовать локальную точку символа в систему координат инстанса
 * (без сдвига): сначала зеркало по X (scale(-1,1)), затем поворот.
 * Совпадает с SVG-трансформом `rotate(deg) scale(mx,1)`.
 */
export function transformLocalPoint(p: Point, rotation: Rotation, mirror: boolean): Point {
  const m = mirror ? { x: -p.x, y: p.y } : p;
  return rotatePoint(m, rotation);
}

/** Вывод в координатах листа (после поворота/зеркала и сдвига инстанса). */
export interface PlacedPin {
  name: string;
  x: number;
  y: number;
}

/**
 * Положения выводов символа на листе для размещения `placement`
 * (структурно совпадает с `SymbolInstance`: x/y/rotation/mirror).
 * Используется движком связности (S3) — не зависит от модели схемы.
 */
export function instancePins(
  sym: SymbolDef,
  placement: { x: number; y: number; rotation: Rotation; mirror: boolean },
): PlacedPin[] {
  return sym.pins.map((p) => {
    const t = transformLocalPoint(p, placement.rotation, placement.mirror);
    return { name: p.name, x: placement.x + t.x, y: placement.y + t.y };
  });
}

/** Габаритный прямоугольник символа (мм) по графике и выводам. */
export function symbolBounds(sym: SymbolDef): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const acc = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const g of sym.graphics) {
    switch (g.type) {
      case "line":
        acc(g.x1, g.y1);
        acc(g.x2, g.y2);
        break;
      case "rect":
        acc(g.x, g.y);
        acc(g.x + g.w, g.y + g.h);
        break;
      case "circle":
      case "arc":
        // дуга: габарит по описанной окружности (безопасная оценка)
        acc(g.cx - g.r, g.cy - g.r);
        acc(g.cx + g.r, g.cy + g.r);
        break;
      case "text":
        acc(g.x, g.y);
        break;
    }
  }
  for (const p of sym.pins) acc(p.x, p.y);
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Следующее свободное позобозначение для кода (ГОСТ 2.710): «QF» + (max+1).
 * Сканирует существующие обозначения, не хранит счётчик → корректно с undo/redo.
 */
export function nextDesignation(existing: string[], code: string): string {
  const re = new RegExp(`^${escapeRegExp(code)}(\\d+)$`);
  let max = 0;
  for (const d of existing) {
    const m = d.match(re);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `${code}${max + 1}`;
}

/** Результат валидации `*.symbol.json`. */
export type SymbolValidation = { ok: true; symbol: SymbolDef } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Структурная валидация объекта как `SymbolDef` (формат `*.symbol.json`).
 * Канонический контракт — schemas/symbol.schema.json; формальная JSON-Schema
 * валидация в CI подключается в S12 (тогда же — ajv). Здесь — проверка при загрузке.
 */
export function validateSymbol(input: unknown): SymbolValidation {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["symbol must be an object"] };

  for (const f of ["id", "name", "category", "componentCode"] as const) {
    if (!isStr(input[f]) || input[f].length === 0) errors.push(`"${f}" must be a non-empty string`);
  }
  if (!SYMBOL_KINDS.includes(input.kind as SymbolKind))
    errors.push(`"kind" must be one of: ${SYMBOL_KINDS.join(", ")}`);

  if (!Array.isArray(input.pins)) {
    errors.push(`"pins" must be an array`);
  } else {
    input.pins.forEach((p, i) => {
      if (!isObj(p) || !isStr(p.name) || !isNum(p.x) || !isNum(p.y))
        errors.push(`pins[${i}]: requires { name: string, x: number, y: number }`);
    });
  }

  if (!Array.isArray(input.graphics)) {
    errors.push(`"graphics" must be an array`);
  } else {
    input.graphics.forEach((g, i) => {
      const err = validateGraphic(g);
      if (err) errors.push(`graphics[${i}]: ${err}`);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, symbol: input as unknown as SymbolDef };
}

function validateGraphic(g: unknown): string | null {
  if (!isObj(g)) return "must be an object";
  switch (g.type) {
    case "line":
      return isNum(g.x1) && isNum(g.y1) && isNum(g.x2) && isNum(g.y2)
        ? null
        : "line requires x1,y1,x2,y2 numbers";
    case "rect":
      return isNum(g.x) && isNum(g.y) && isNum(g.w) && isNum(g.h)
        ? null
        : "rect requires x,y,w,h numbers";
    case "circle":
      return isNum(g.cx) && isNum(g.cy) && isNum(g.r) ? null : "circle requires cx,cy,r numbers";
    case "arc":
      return isNum(g.cx) && isNum(g.cy) && isNum(g.r) && isNum(g.a0) && isNum(g.a1)
        ? null
        : "arc requires cx,cy,r,a0,a1 numbers";
    case "text":
      return isNum(g.x) && isNum(g.y) && isStr(g.text)
        ? null
        : "text requires x,y numbers and text string";
    default:
      return `unknown graphic type "${String(g.type)}"`;
  }
}

/** Библиотека УГО: символы по id, группировка по категориям. */
export class SymbolLibrary {
  private readonly map = new Map<string, SymbolDef>();

  constructor(symbols: SymbolDef[] = []) {
    for (const s of symbols) this.add(s);
  }

  add(sym: SymbolDef): void {
    this.map.set(sym.id, sym);
  }

  /** Удалить символ из библиотеки (S9: удаление пользовательского УГО). */
  remove(id: string): void {
    this.map.delete(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  get(id: string): SymbolDef | undefined {
    return this.map.get(id);
  }

  all(): SymbolDef[] {
    return [...this.map.values()];
  }

  /** Символы, сгруппированные по `category` (порядок появления сохраняется). */
  byCategory(): Map<string, SymbolDef[]> {
    const groups = new Map<string, SymbolDef[]>();
    for (const s of this.map.values()) {
      const list = groups.get(s.category) ?? [];
      list.push(s);
      groups.set(s.category, list);
    }
    return groups;
  }
}
