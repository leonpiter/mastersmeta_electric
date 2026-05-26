/**
 * Отчёты из схемы (CLAUDE принцип 1: всё, что в UI, выражается вызовом к ядру).
 * MVP — перечень элементов (ГОСТ 2.701): одна строка на устройство (`Device`),
 * наименование = имя УГО + изделие каталога, артикул в примечании. «Живые»: данные
 * вычисляются из проекта при каждом вызове. Таблица соединений и Excel round-trip — позже.
 */
import type { Project, Wire } from "./model";
import type { SymbolLibrary } from "./symbol";
import { type Catalog, partLabel } from "./catalog";
import { computeDevices } from "./devices";
import { computeNets } from "./connectivity";

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
  return toCsv(["Поз. обозначение", "Наименование", "Кол.", "Примечание"], rows, (r) => [
    r.designation,
    r.name,
    String(r.quantity),
    r.note,
  ]);
}

/** Строка таблицы соединений (ГОСТ 2.701): цепь связывает выводы устройств. */
export interface ConnectionRow {
  /** Номер цепи (потенциала), напр. «1»/«L1» или «—». */
  net: string;
  /** Соединяемые выводы «сигла:вывод», напр. «KM1:A1 · QF1:2». */
  pins: string;
  /** Данные провода: тип + сечение. */
  wire: string;
  /** Номер листа. */
  sheet: string;
}

function wireLabel(w: Wire | undefined): string {
  if (!w) return "";
  const parts = [w.type === "power" ? "силовой" : "управление"];
  if (w.section) parts.push(`${w.section} мм²`);
  return parts.join(" · ");
}

/**
 * Таблица соединений из проекта: по цепям (потенциалам). Каждая цепь с ≥2 выводами —
 * строка со списком соединяемых выводов «сигла:вывод» и данными провода. По листам.
 */
export function computeConnections(project: Project, library: SymbolLibrary): ConnectionRow[] {
  const rows: ConnectionRow[] = [];

  project.pages.forEach((page, pageIndex) => {
    const desigOf = new Map(page.instances.map((i) => [i.id, i.designation]));
    const wireById = new Map(page.wires.map((w) => [w.id, w]));

    for (const net of computeNets(page, library)) {
      if (net.pins.length < 2) continue;
      const labels = net.pins
        .map((p) => `${desigOf.get(p.instanceId) ?? "?"}:${p.pinName}`)
        .sort((a, b) => a.localeCompare(b, "ru"));
      const numbered = net.wireIds.map((id) => wireById.get(id)).find((w) => w?.number);
      const anyWire = net.wireIds.length ? wireById.get(net.wireIds[0]) : undefined;
      rows.push({
        net: numbered?.number ?? "—",
        pins: labels.join(" · "),
        wire: wireLabel(anyWire),
        sheet: String(pageIndex + 1),
      });
    }
  });

  rows.sort(
    (a, b) =>
      a.sheet.localeCompare(b.sheet, undefined, { numeric: true }) ||
      a.net.localeCompare(b.net, undefined, { numeric: true }) ||
      a.pins.localeCompare(b.pins, "ru"),
  );
  return rows;
}

/** Экспорт таблицы соединений в CSV. */
export function connectionsToCsv(rows: ConnectionRow[]): string {
  return toCsv(["Цепь", "Соединяемые выводы", "Провод", "Лист"], rows, (r) => [
    r.net,
    r.pins,
    r.wire,
    r.sheet,
  ]);
}

/** Общий сборщик CSV (разделитель «;», экранирование, для Excel). */
function toCsv<T>(header: string[], rows: T[], cells: (row: T) => string[]): string {
  const esc = (s: string): string => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [header.join(";")];
  for (const r of rows) lines.push(cells(r).map(esc).join(";"));
  return lines.join("\r\n");
}
