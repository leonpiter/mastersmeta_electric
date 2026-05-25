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

/** Размер основной надписи (ГОСТ 2.104, Форма 1), мм. */
export const TITLE_BLOCK_SIZE = { width: 185, height: 55 } as const;

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
  developer: string; // «Разраб.»
  checker: string; // «Пров.»
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
  };
}
