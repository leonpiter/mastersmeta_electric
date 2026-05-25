/**
 * Минимальный срез доменной модели.
 * Полная модель (Device, SymbolInstance, Wire, Net, CabinetItem, ...) — см. docs/ARCHITECTURE.md.
 * Принцип 7: всё сериализуемо, у сущностей стабильные `id`.
 */
import { type Id, newId } from "./ids";
import type { Point } from "./geometry";
import { type SheetFormat, FORMATS, type TitleBlock, defaultTitleBlock } from "./sheet";

/**
 * Узел на листе. Пока это просто точка, привязанная к сетке —
 * задел под будущие `SymbolInstance` / `Junction`.
 */
export interface SchematicNode extends Point {
  id: Id;
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
  };
}
