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
  /** Задел под S5/S6 (master/slave, каталог). */
  deviceId?: Id;
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
}

export function createProject(opts: CreatePageOptions = {}): Project {
  const page = createPage(opts);
  return { id: newId(), name: "Без имени", pages: [page], activePageId: page.id };
}

/** Активный лист проекта. */
export function activePage(project: Project): Page {
  return project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
}
