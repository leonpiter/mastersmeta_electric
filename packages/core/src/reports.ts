/**
 * Отчёты из схемы (CLAUDE принцип 1: всё, что в UI, выражается вызовом к ядру).
 * MVP — перечень элементов (ГОСТ 2.701): одна строка на устройство (`Device`),
 * наименование = имя УГО + изделие каталога, артикул в примечании. «Живые»: данные
 * вычисляются из проекта при каждом вызове. Таблица соединений и Excel round-trip — позже.
 */
import type { Project } from "./model";
import type { SymbolLibrary } from "./symbol";
import { type Catalog, partLabel } from "./catalog";
import { computeDevices } from "./devices";

/** Строка перечня элементов (ГОСТ 2.701). */
export interface BomRow {
  /** Позиционное обозначение (сигла), напр. «QF1». */
  designation: string;
  /** Наименование: тип УГО + изделие каталога. */
  name: string;
  /** Количество (одно устройство = 1; группировка одинаковых — позже). */
  quantity: number;
  /** Примечание (артикул каталога). */
  note: string;
}

/** Разбить сиглу на буквенный префикс и хвостовое число («QF10» → ["QF", 10]). */
function splitDesignation(s: string): [string, number] {
  let i = s.length;
  while (i > 0 && s[i - 1] >= "0" && s[i - 1] <= "9") i--;
  const digits = s.slice(i);
  return [s.slice(0, i), digits ? Number.parseInt(digits, 10) : 0];
}

/** Натуральная сортировка сигл: буквенный префикс, затем число (QF2 < QF10). */
function cmpDesignation(a: string, b: string): number {
  const [pa, na] = splitDesignation(a);
  const [pb, nb] = splitDesignation(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  if (na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Перечень элементов из проекта: строка на устройство, отсортировано по сигле. */
export function computeBom(project: Project, library: SymbolLibrary, catalog: Catalog): BomRow[] {
  const rows = computeDevices(project, library).map((d) => {
    const ref = d.master ?? d.members[0];
    const baseName = library.get(ref.instance.symbolId)?.name ?? d.code;
    const part = d.catalogCode ? catalog.get(d.catalogCode) : undefined;
    return {
      designation: d.designation,
      name: part ? `${baseName} · ${partLabel(part)}` : baseName,
      quantity: 1,
      note: d.catalogCode ?? "",
    };
  });
  rows.sort((a, b) => cmpDesignation(a.designation, b.designation));
  return rows;
}

/** Экспорт перечня в CSV (разделитель «;», экранирование, для Excel). */
export function bomToCsv(rows: BomRow[]): string {
  const esc = (s: string): string => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = ["Поз. обозначение", "Наименование", "Кол.", "Примечание"];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push([r.designation, r.name, String(r.quantity), r.note].map(esc).join(";"));
  }
  return lines.join("\r\n");
}
