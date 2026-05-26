/**
 * Минимальный срез доменной модели.
 * Полная модель (Device, SymbolInstance, Wire, Net, CabinetItem, ...) — см. docs/ARCHITECTURE.md.
 * Принцип 7: всё сериализуемо, у сущностей стабильные `id`.
 */
import { type Id, newId } from "./ids";
import type { Point } from "./geometry";
import type { Rotation } from "./symbol";
import { type SheetFormat, FORMATS, type TitleBlock, defaultTitleBlock } from "./sheet";

/**
 * Узел на листе. Пока это просто точка, привязанная к сетке —
 * задел под будущие `Junction`.
 */
export interface SchematicNode extends Point {
  id: Id;
}

/**
 * Графическое размещение символа на листе (CLAUDE принцип 3).
 * В S2 один инстанс = одно логическое устройство (1:1); поле `deviceId`
 * зарезервировано под master/slave и привязку к каталогу (S5/S6),
 * где одно `Device` получает N инстансов.
 */
export interface SymbolInstance {
  id: Id;
  /** Ссылка в библиотеку (`SymbolDef.id`). */
  symbolId: string;
  /** Позобозначение, напр. «QF1» (ГОСТ 2.710). */
  designation: string;
  /** Префикс кода (кэш из `SymbolDef.componentCode`) — для автонумерации. */
  componentCode: string;
  /** Координаты опорной точки символа на листе, мм (привязаны к сетке). */
  x: number;
  y: number;
  rotation: Rotation;
  mirror: boolean;
  /** Показывать ли подпись позобозначения. */
  showLabels: boolean;
  /** Задел под master/slave (несколько инстансов одного устройства). */
  deviceId?: Id;
  /**
   * Код(ы) изделия в каталоге (S6). Артикул устройства = код его master-инстанса.
   * Несколько кодов — через `;` (составное изделие). Пусто = без привязки.
   */
  catalogCode?: string;
  /**
   * Значения характеристик (S27): ключ = `AttrDef.key` категории, значение — текст.
   * Напр. `{ current: "10А", curve: "C" }`. Питают подписи и спецификацию.
   */
  attributes?: Record<string, string>;
  /**
   * Какие характеристики показывать подписями у символа (по порядку), напр. `["current","curve"]`.
   * Стопка строк рендерится под сиглой (QF1 / 10А / С). Пусто = только сигла.
   */
  labelFields?: string[];
}

/** Строка подписи инстанса (рендерится стопкой у символа). */
export interface InstanceLabel {
  text: string;
  /** Главная сигла (рендерить крупнее/жирнее). */
  primary: boolean;
}

/**
 * Подписи инстанса: главная сигла (`designation`) + строки из выбранных характеристик
 * (`labelFields`), значения берутся из `attributes`. Пустые значения пропускаются.
 * Чистая функция — рендер (canvas) и отчёты используют один источник.
 */
export function instanceLabels(inst: SymbolInstance): InstanceLabel[] {
  const out: InstanceLabel[] = [];
  if (inst.designation) out.push({ text: inst.designation, primary: true });
  for (const key of inst.labelFields ?? []) {
    const v = inst.attributes?.[key]?.trim();
    if (v) out.push({ text: v, primary: false });
  }
  return out;
}

/**
 * Провод — электрическое соединение (CLAUDE принцип 2: `Wire` ≠ `Line`).
 * Только провода участвуют в связности; геометрия — полилиния в мм (точки на сетке).
 */
export interface Wire {
  id: Id;
  points: Point[];
  /** Силовой / цепь управления (ГОСТ). */
  type: "power" | "control";
  /** Сечение жилы, мм² (напр. «1.5»). */
  section?: string;
  /** Цвет жилы (CSS-цвет; по умолчанию чёрный). */
  color?: string;
  /** Номер цепи / потенциал (ГОСТ 2.709; напр. «1», «L1», «PE»). */
  number?: string;
  /** Ручной номер — автонумерация не перезаписывает. */
  locked?: boolean;
}

/** Тип линии аннотации (оформление чертежа). */
export type AnnotationDash = "solid" | "dashed" | "dotted";

/** Стиль графической аннотации: цвет/толщина/тип линии (для текста — цвет = заливка). */
export interface AnnotationStyle {
  color: string;
  /** Толщина линии, мм. */
  width: number;
  dash: AnnotationDash;
}

/** Стиль аннотаций по умолчанию. */
export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
  color: "#1a1a1a",
  width: 0.35,
  dash: "solid",
};

/**
 * Графическая аннотация (CLAUDE принцип 2: это НЕ `Wire`, не участвует в связности).
 * Оформительский слой: линии/фигуры/стрелки/текст поверх схемы.
 */
export type Annotation =
  | {
      id: Id;
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      /** Стрелка на конце (x2,y2). */
      arrowEnd?: boolean;
      style: AnnotationStyle;
    }
  | { id: Id; kind: "rect"; x: number; y: number; w: number; h: number; style: AnnotationStyle }
  | {
      id: Id;
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      style: AnnotationStyle;
    }
  | {
      id: Id;
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      style: AnnotationStyle;
    };

/** Сдвинуть аннотацию на (dx, dy) — единообразно по всем видам геометрии. */
export function translateAnnotation(a: Annotation, dx: number, dy: number): void {
  switch (a.kind) {
    case "line":
      a.x1 += dx;
      a.y1 += dy;
      a.x2 += dx;
      a.y2 += dy;
      break;
    case "rect":
    case "text":
      a.x += dx;
      a.y += dy;
      break;
    case "ellipse":
      a.cx += dx;
      a.cy += dy;
      break;
  }
}

export interface Page {
  id: Id;
  /** Шаг сетки в мм (выводы символов кратны ему; по умолчанию 5 мм). */
  gridStep: number;
  /** Формат листа (ГОСТ 2.301). */
  format: SheetFormat;
  /** Основная надпись (ГОСТ 2.104). */
  titleBlock: TitleBlock;
  nodes: SchematicNode[];
  /** Размещённые символы. */
  instances: SymbolInstance[];
  /** Провода (электрические соединения). */
  wires: Wire[];
  /** Графические аннотации (оформление: линии/фигуры/текст). */
  annotations: Annotation[];
}

export interface CreatePageOptions {
  format?: SheetFormat;
  gridStep?: number;
}

export function createPage(opts: CreatePageOptions = {}): Page {
  return {
    id: newId(),
    gridStep: opts.gridStep ?? 5,
    format: opts.format ?? FORMATS.A3,
    titleBlock: defaultTitleBlock(),
    nodes: [],
    instances: [],
    wires: [],
    annotations: [],
  };
}

/**
 * Проект: набор листов одного документа (минимальный срез под мультилист S21).
 * Полная иерархия `Project → Document[] → Page[]` (см. ARCHITECTURE) — позже.
 */
export interface Project {
  id: Id;
  name: string;
  pages: Page[];
  /** id активного (показываемого) листа. */
  activePageId: Id;
  /** Визуальная толщина силовых проводов, мм (на весь проект). */
  wireWidthPower: number;
  /** Визуальная толщина проводов управления, мм. */
  wireWidthControl: number;
}

/** Толщина проводов по умолчанию, мм. */
export const DEFAULT_WIRE_WIDTH_POWER = 0.3;
export const DEFAULT_WIRE_WIDTH_CONTROL = 0.2;

export function createProject(opts: CreatePageOptions = {}): Project {
  const page = createPage(opts);
  return {
    id: newId(),
    name: "Без имени",
    pages: [page],
    activePageId: page.id,
    wireWidthPower: DEFAULT_WIRE_WIDTH_POWER,
    wireWidthControl: DEFAULT_WIRE_WIDTH_CONTROL,
  };
}

/** Активный лист проекта. */
export function activePage(project: Project): Page {
  return project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
}
