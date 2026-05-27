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

/** Строка таблицы клемм (ГОСТ 2.701): клемма и подключения к каждому её выводу. */
export interface TerminalRow {
  /** Обозначение клеммы, напр. «XT1». */
  terminal: string;
  /** Вывод 1: цепь и подключённые выводы устройств. */
  side1: string;
  /** Вывод 2: цепь и подключённые выводы устройств. */
  side2: string;
  /** Номер листа. */
  sheet: string;
}

/**
 * Таблица клемм из проекта: для каждого символа-клеммы (`kind: "terminal"`) — что
 * подключено к каждому её выводу (номер цепи + соседние выводы устройств).
 */
export function computeTerminals(project: Project, library: SymbolLibrary): TerminalRow[] {
  const rows: TerminalRow[] = [];

  project.pages.forEach((page, pageIndex) => {
    const nets = computeNets(page, library);
    const desigOf = new Map(page.instances.map((i) => [i.id, i.designation]));
    const wireById = new Map(page.wires.map((w) => [w.id, w]));

    const netOfPin = (instanceId: string, pinName: string) =>
      nets.find((n) => n.pins.some((p) => p.instanceId === instanceId && p.pinName === pinName));
    const sideLabel = (instanceId: string, pinName: string): string => {
      const net = netOfPin(instanceId, pinName);
      if (!net) return "—";
      const others = net.pins
        .filter((p) => p.instanceId !== instanceId)
        .map((p) => `${desigOf.get(p.instanceId) ?? "?"}:${p.pinName}`)
        .sort((a, b) => a.localeCompare(b, "ru"));
      const num = net.wireIds.map((id) => wireById.get(id)).find((w) => w?.number)?.number;
      const parts = [];
      if (num) parts.push(`цепь ${num}`);
      if (others.length) parts.push(others.join(", "));
      return parts.join(" → ") || "—";
    };

    for (const inst of page.instances) {
      const sym = library.get(inst.symbolId);
      if (sym?.kind !== "terminal") continue;
      const p1 = sym.pins[0]?.name ?? "1";
      const p2 = sym.pins[1]?.name ?? "2";
      rows.push({
        terminal: inst.designation,
        side1: sideLabel(inst.id, p1),
        side2: sideLabel(inst.id, p2),
        sheet: String(pageIndex + 1),
      });
    }
  });

  rows.sort(
    (a, b) =>
      a.sheet.localeCompare(b.sheet, undefined, { numeric: true }) ||
      a.terminal.localeCompare(b.terminal, undefined, { numeric: true }),
  );
  return rows;
}

/** Клеммник (рейка): группа клемм с общим буквенным префиксом сиглы. */
export interface TerminalStrip {
  /** Имя клеммника — префикс сиглы без номера, напр. «XT». */
  name: string;
  /** Клеммы рейки в порядке номера. */
  rows: TerminalRow[];
}

/** Префикс сиглы без хвостовых цифр: «XT1» → «XT», «X12» → «X». */
function stripPrefix(designation: string): string {
  let i = designation.length;
  while (i > 0 && designation[i - 1] >= "0" && designation[i - 1] <= "9") i--;
  return designation.slice(0, i) || designation;
}

/**
 * Сгруппировать клеммы проекта в клеммники (рейки) по буквенному префиксу сиглы.
 * Связность не хранится — клеммники вычисляются из размещённых XT (принцип 2).
 * Внутри рейки — сортировка по номеру; рейки — по имени.
 */
export function computeTerminalStrips(project: Project, library: SymbolLibrary): TerminalStrip[] {
  const byName = new Map<string, TerminalRow[]>();
  for (const r of computeTerminals(project, library)) {
    const name = stripPrefix(r.terminal);
    const list = byName.get(name) ?? [];
    list.push(r);
    byName.set(name, list);
  }
  for (const rows of byName.values()) {
    rows.sort((a, b) => a.terminal.localeCompare(b.terminal, undefined, { numeric: true }));
  }
  return [...byName.entries()]
    .map(([name, rows]) => ({ name, rows }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** Экспорт таблицы клемм в CSV. */
export function terminalsToCsv(rows: TerminalRow[]): string {
  return toCsv(["Клемма", "Вывод 1", "Вывод 2", "Лист"], rows, (r) => [
    r.terminal,
    r.side1,
    r.side2,
    r.sheet,
  ]);
}

/** Строка таблицы разъёмов (ГОСТ 2.701): один контакт разъёма и его подключение. */
export interface ConnectorRow {
  /** Обозначение разъёма, напр. «XS1». */
  connector: string;
  /** Имя контакта, напр. «1». */
  pin: string;
  /** Подключение контакта: цепь и соседние выводы устройств. */
  connection: string;
  /** Номер листа. */
  sheet: string;
}

/**
 * Таблица разъёмов из проекта: для каждого символа-разъёма (`kind: "connector"`) —
 * по строке на каждый контакт с его подключением (номер цепи + соседние выводы).
 */
export function computeConnectors(project: Project, library: SymbolLibrary): ConnectorRow[] {
  const rows: ConnectorRow[] = [];

  project.pages.forEach((page, pageIndex) => {
    const nets = computeNets(page, library);
    const desigOf = new Map(page.instances.map((i) => [i.id, i.designation]));
    const wireById = new Map(page.wires.map((w) => [w.id, w]));

    const connectionLabel = (instanceId: string, pinName: string): string => {
      const net = nets.find((n) =>
        n.pins.some((p) => p.instanceId === instanceId && p.pinName === pinName),
      );
      if (!net) return "—";
      const others = net.pins
        .filter((p) => p.instanceId !== instanceId)
        .map((p) => `${desigOf.get(p.instanceId) ?? "?"}:${p.pinName}`)
        .sort((a, b) => a.localeCompare(b, "ru"));
      const num = net.wireIds.map((id) => wireById.get(id)).find((w) => w?.number)?.number;
      const parts: string[] = [];
      if (num) parts.push(`цепь ${num}`);
      if (others.length) parts.push(others.join(", "));
      return parts.join(" → ") || "—";
    };

    for (const inst of page.instances) {
      const sym = library.get(inst.symbolId);
      if (sym?.kind !== "connector") continue;
      for (const pin of sym.pins) {
        rows.push({
          connector: inst.designation,
          pin: pin.name,
          connection: connectionLabel(inst.id, pin.name),
          sheet: String(pageIndex + 1),
        });
      }
    }
  });

  rows.sort(
    (a, b) =>
      a.sheet.localeCompare(b.sheet, undefined, { numeric: true }) ||
      a.connector.localeCompare(b.connector, undefined, { numeric: true }) ||
      a.pin.localeCompare(b.pin, undefined, { numeric: true }),
  );
  return rows;
}

/** Экспорт таблицы разъёмов в CSV. */
export function connectorsToCsv(rows: ConnectorRow[]): string {
  return toCsv(["Разъём", "Контакт", "Подключение", "Лист"], rows, (r) => [
    r.connector,
    r.pin,
    r.connection,
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
