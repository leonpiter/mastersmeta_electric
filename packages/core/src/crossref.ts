/**
 * Адресация соединителей страниц (S29): партнёры по метке и их адрес «лист·зона»,
 * авто-метка по номеру цепи. Зона/лист — из готовых `zoneOf` (ГОСТ 2.104) и
 * `titleBlock.sheet` (графа 7), как в кросс-рефах S5.
 */
import type { Id } from "./ids";
import { snap } from "./geometry";
import type { Page } from "./model";
import { zoneOf } from "./sheet";
import { computeNets } from "./connectivity";
import type { SymbolLibrary } from "./symbol";

/** Адрес соединителя: лист (графа 7) + зона + готовая строка «лист·зона». */
export interface ConnectorRef {
  instanceId: Id;
  pageIndex: number;
  sheet: number;
  zone: string;
  /** Готовый адрес, напр. «1·3B». */
  address: string;
}

/**
 * Соединители страниц с данной меткой (опц. кроме `exceptId`) — с адресами.
 * Источник адресов на стрелке и цель навигации по клику.
 */
export function connectorPartners(
  pages: Page[],
  library: SymbolLibrary,
  signal: string,
  exceptId?: Id,
): ConnectorRef[] {
  const target = signal.trim();
  if (!target) return [];
  const out: ConnectorRef[] = [];
  pages.forEach((page, pageIndex) => {
    for (const inst of page.instances) {
      if (library.get(inst.symbolId)?.kind !== "page-connector") continue;
      if ((inst.signal ?? "").trim() !== target) continue;
      if (inst.id === exceptId) continue;
      const zone = zoneOf(page.format, { x: inst.x, y: inst.y });
      const sheet = page.titleBlock.sheet;
      out.push({ instanceId: inst.id, pageIndex, sheet, zone, address: `${sheet}·${zone}` });
    }
  });
  return out;
}

/**
 * Номер цепи (провода) в точке листа — авто-метка соединителя по умолчанию.
 * Берём номер первого нумерованного провода цепи, проходящей через точку.
 */
export function circuitNumberAt(
  page: Page,
  library: SymbolLibrary,
  x: number,
  y: number,
): string | undefined {
  const step = page.gridStep;
  const k = `${snap(x, step)},${snap(y, step)}`;
  const net = computeNets(page, library).find((n) => n.coordKeys.includes(k));
  if (!net) return undefined;
  for (const wid of net.wireIds) {
    const w = page.wires.find((ww) => ww.id === wid);
    if (w?.number) return w.number;
  }
  return undefined;
}

/** Список адресов партнёров одной строкой, напр. «1·3B, 2·1A» (для подписи стрелки). */
export function partnersText(refs: ConnectorRef[]): string {
  return refs.map((r) => r.address).join(", ");
}
