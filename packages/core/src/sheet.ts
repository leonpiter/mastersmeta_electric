/**
 * Лист чертежа: форматы (ГОСТ 2.301), рамка, зонная сетка, основная надпись (ГОСТ 2.104).
 * Чистая геометрия в мм — без UI (CLAUDE принцип 1).
 */

export interface SheetFormat {
  id: string;
  /** отображаемое имя, напр. «А3» */
  name: string;
  /** ширина листа, мм (альбомная ориентация) */
  width: number;
  /** высота листа, мм */
  height: number;
}

/** Стандартные форматы (ГОСТ 2.301), альбомная ориентация. */
export const FORMATS = {
  A4: { id: "A4", name: "А4", width: 297, height: 210 },
  A3: { id: "A3", name: "А3", width: 420, height: 297 },
} as const satisfies Record<string, SheetFormat>;

/** Поля рамки (ГОСТ 2.301): слева 20 мм (подшивка), остальные по 5 мм. */
export const FRAME_MARGIN = { left: 20, top: 5, right: 5, bottom: 5 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Прямоугольник внутренней рамки в координатах листа (мм). */
export function frameRect(format: SheetFormat): Rect {
  return {
    x: FRAME_MARGIN.left,
    y: FRAME_MARGIN.top,
    w: format.width - FRAME_MARGIN.left - FRAME_MARGIN.right,
    h: format.height - FRAME_MARGIN.top - FRAME_MARGIN.bottom,
  };
}

/** Зонная разбивка рамки (ГОСТ 2.104): равные части, цель ~`targetZone` мм. */
export interface ZoneGrid {
  cols: number;
  rows: number;
  /** X-координаты вертикальных линий зон (мм), длина cols+1 */
  colX: number[];
  /** Y-координаты горизонтальных линий зон (мм), длина rows+1 */
  rowY: number[];
}

export function zoneGrid(format: SheetFormat, targetZone = 50): ZoneGrid {
  const fr = frameRect(format);
  const cols = Math.max(1, Math.round(fr.w / targetZone));
  const rows = Math.max(1, Math.round(fr.h / targetZone));
  const colX: number[] = [];
  for (let i = 0; i <= cols; i++) colX.push(fr.x + (fr.w * i) / cols);
  const rowY: number[] = [];
  for (let i = 0; i <= rows; i++) rowY.push(fr.y + (fr.h * i) / rows);
  return { cols, rows, colX, rowY };
}

/** Индекс полосы (0..count-1), в которую попадает `v` по границам `edges` (длина count+1). */
function bandIndex(edges: number[], v: number, count: number): number {
  for (let i = count - 1; i >= 0; i--) {
    if (v >= edges[i]) return i;
  }
  return 0;
}

/**
 * Зона точки на листе (ГОСТ 2.104): номер колонки + буква строки, напр. «3B».
 * Используется для кросс-референсов master/slave (S5): адрес «лист.зона».
 */
export function zoneOf(format: SheetFormat, p: { x: number; y: number }): string {
  const zg = zoneGrid(format);
  const col = bandIndex(zg.colX, p.x, zg.cols);
  const row = bandIndex(zg.rowY, p.y, zg.rows);
  return `${col + 1}${String.fromCharCode(65 + row)}`;
}

/** Размер основной надписи (ГОСТ 2.104, Форма 1), мм. */
export const TITLE_BLOCK_SIZE = { width: 185, height: 55 } as const;

/**
 * Размерная сетка Формы 1 как данные (мм) — рендер рисует из неё, не из хардкода.
 * Слева блок ролей (65), центр (95: обозначение/наименование/организация), справа (25).
 */
export const TITLE_BLOCK_FORM1 = {
  rowH: 11, // высота строки роли
  roleRows: 5, // число строк ролей
  leftLabelW: 25, // «Разраб.» …
  leftNameW: 20, // ФИО
  leftSignW: 10, // подпись
  leftDateW: 10, // дата
  leftW: 65,
  centerX: 65,
  centerW: 95,
  designH: 16, // обозначение (верх центра)
  titleH: 28, // наименование (середина)
  companyH: 11, // организация (низ)
  rightX: 160,
  rightW: 25,
  rightCellH: 8, // масштаб/масса/лит.
  rightSheetH: 15.5, // лист/листов
} as const;

/** Роль в основной надписи (настраиваемый список «должность → ФИО»). */
export interface TitleRole {
  /** Подпись роли, напр. «Разраб.». */
  role: string;
  /** ФИО исполнителя. */
  name: string;
}

/** Производственные роли ГОСТ 2.104 по умолчанию. */
export const DEFAULT_TITLE_ROLES: readonly string[] = [
  "Разраб.",
  "Пров.",
  "Т.контр.",
  "Н.контр.",
  "Утв.",
];

/**
 * Поля основной надписи (ГОСТ 2.104, Форма 1) — шаблонные, заполняются из проекта.
 * Номера граф указаны в комментариях.
 */
export interface TitleBlock {
  title: string; // графа 1 — наименование
  designation: string; // графа 2 — обозначение документа
  company: string; // графа 9 — организация
  letter: string; // графа 4 — литера
  mass: string; // графа 5 — масса
  scale: string; // графа 6 — масштаб
  sheet: number; // графа 7 — лист
  sheetsTotal: number; // графа 8 — листов
  developer: string; // «Разраб.» (back-compat; см. roles)
  checker: string; // «Пров.» (back-compat; см. roles)
  /** Настраиваемые роли (должность → ФИО). Если пусто — берутся из developer/checker. */
  roles?: TitleRole[];
}

/** Роли надписи для рендера: список из `roles`, иначе из дефолта + developer/checker. */
export function titleRoles(tb: TitleBlock): TitleRole[] {
  if (tb.roles && tb.roles.length > 0) return tb.roles;
  return DEFAULT_TITLE_ROLES.map((role, i) => ({
    role,
    name: i === 0 ? tb.developer : i === 1 ? tb.checker : "",
  }));
}

export function defaultTitleBlock(): TitleBlock {
  return {
    title: "",
    designation: "",
    company: "",
    letter: "",
    mass: "",
    scale: "1:1",
    sheet: 1,
    sheetsTotal: 1,
    developer: "",
    checker: "",
    roles: DEFAULT_TITLE_ROLES.map((role) => ({ role, name: "" })),
  };
}
