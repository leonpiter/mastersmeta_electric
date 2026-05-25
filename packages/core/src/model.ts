/**
 * Минимальный срез доменной модели для Фазы 0.
 * Полная модель (Device, SymbolInstance, Wire, Net, CabinetItem, ...) — см. docs/ARCHITECTURE.md.
 * Принцип 7: всё сериализуемо, у сущностей стабильные `id`.
 */
import { type Id, newId } from "./ids";
import type { Point } from "./geometry";

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
  nodes: SchematicNode[];
}

export function createPage(gridStep = 5): Page {
  return { id: newId(), gridStep, nodes: [] };
}
