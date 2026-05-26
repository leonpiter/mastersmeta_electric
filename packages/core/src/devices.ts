/**
 * Устройства (Device) — слой 3 доменной модели (CLAUDE принцип 3).
 *
 * Одно устройство = одна сигла (позобозначение, напр. «KM1») = N графических
 * представлений (`SymbolInstance`): катушка-master + контакты-slave на разных листах.
 * Принцип 2/связности: устройства НЕ хранятся, а **вычисляются** из инстансов по
 * общей сигле (как `Net` из проводов) — корректно с undo/redo, без миграций модели.
 *
 * Здесь же — адресация master/slave (адрес «лист.зона» через `zoneOf`) и поиск
 * несвязанных катушек/контактов («Список контактов» See Electrical).
 */
import type { Project, SymbolInstance } from "./model";
import type { SymbolKind, SymbolLibrary } from "./symbol";
import { zoneOf } from "./sheet";

/** Представление устройства на листе (катушка, контакт, аппарат). */
export interface DeviceMember {
  instance: SymbolInstance;
  /** Индекс листа в проекте (0-based). */
  pageIndex: number;
  /** Поведение символа (kind), напр. «coil», «contact-no». */
  kind: SymbolKind;
  /** Имена выводов представления (напр. ["13","14"]). */
  pins: string[];
  /** Адрес «лист.зона» (ГОСТ 2.104), напр. «2.3B». */
  address: string;
}

/** Устройство: сигла + все её представления (master + контакты). */
export interface DeviceInfo {
  /** Позобозначение, напр. «KM1». */
  designation: string;
  /** Код ГОСТ (KM, K, QF…). */
  code: string;
  /** Главный элемент (катушка / аппарат), если найден. */
  master?: DeviceMember;
  /** Контакты (НО/НЗ) — slave-представления. */
  contacts: DeviceMember[];
  /** Все представления в порядке листов/появления. */
  members: DeviceMember[];
  /** Артикул(ы) каталога устройства (S6): код master-инстанса, иначе первый заданный. */
  catalogCode?: string;
}

const isMasterKind = (k: SymbolKind): boolean => k === "coil" || k === "component-aux";
const isContactKind = (k: SymbolKind): boolean => k === "contact-no" || k === "contact-nc";

/**
 * Сгруппировать все инстансы проекта по сигле в устройства.
 * Master — первая катушка/аппарат сиглы; контакты — представления contact-no/nc.
 */
export function computeDevices(project: Project, library: SymbolLibrary): DeviceInfo[] {
  const byDesig = new Map<string, DeviceInfo>();
  const order: string[] = [];

  project.pages.forEach((page, pageIndex) => {
    for (const inst of page.instances) {
      const sym = library.get(inst.symbolId);
      const kind: SymbolKind = sym?.kind ?? "black-box";
      const member: DeviceMember = {
        instance: inst,
        pageIndex,
        kind,
        pins: sym ? sym.pins.map((p) => p.name) : [],
        address: `${pageIndex + 1}.${zoneOf(page.format, inst)}`,
      };

      let dev = byDesig.get(inst.designation);
      if (!dev) {
        dev = {
          designation: inst.designation,
          code: inst.componentCode,
          contacts: [],
          members: [],
        };
        byDesig.set(inst.designation, dev);
        order.push(inst.designation);
      }
      dev.members.push(member);
      if (!dev.master && isMasterKind(kind)) dev.master = member;
      if (isContactKind(kind)) dev.contacts.push(member);
    }
  });

  // артикул устройства: код master-инстанса, иначе первый заданный среди представлений
  for (const dev of byDesig.values()) {
    dev.catalogCode =
      dev.master?.instance.catalogCode ??
      dev.members.find((m) => m.instance.catalogCode)?.instance.catalogCode;
  }

  return order.map((d) => byDesig.get(d)!);
}

/** Найти устройство по сигле (или undefined). */
export function findDevice(devices: DeviceInfo[], designation: string): DeviceInfo | undefined {
  return devices.find((d) => d.designation === designation);
}

/** Колонка зеркала контактов (ГОСТ/See Electrical): силовой / НО / НЗ. */
export type ContactColumn = "M" | "NO" | "NC";

/** Строка зеркала контактов под катушкой (тип, выводы, адрес, цель перехода). */
export interface ContactRow {
  column: ContactColumn;
  /** Имена выводов контакта, напр. ["13","14"]. */
  pins: string[];
  /** Адрес «лист.зона», напр. «2.4». */
  address: string;
  /** Индекс листа контакта (0-based) — для перехода по двойному клику. */
  pageIndex: number;
  /** id инстанса контакта — для выбора/центрирования вида. */
  instanceId: string;
}

/**
 * Зеркало контактов устройства (S27): по одной строке на размещённый контакт,
 * с колонкой НО/НЗ и адресом. Колонка M (силовые) зарезервирована — заполнится,
 * когда появятся силовые контакты как отдельные представления.
 */
export function coilContactRows(device: DeviceInfo): ContactRow[] {
  return device.contacts.map((c) => ({
    column: c.kind === "contact-nc" ? "NC" : "NO",
    pins: c.pins,
    address: c.address,
    pageIndex: c.pageIndex,
    instanceId: c.instance.id,
  }));
}

/** Несвязанные представления: катушки без контактов и контакты-сироты без катушки. */
export interface UnlinkedReport {
  /** Катушки, у которых нет ни одного контакта. */
  coilsWithoutContacts: DeviceInfo[];
  /** Контакты реле/контактора, чья сигла не имеет катушки. */
  orphanContacts: DeviceInfo[];
}

/**
 * Поиск несвязанных катушек/контактов. «Сирота» — контакт с кодом, для которого в
 * библиотеке есть катушка (KM/K), но в проекте нет катушки с такой же сиглой
 * (кнопки/концевики с собственным кодом не считаются осиротевшими).
 */
export function findUnlinked(project: Project, library: SymbolLibrary): UnlinkedReport {
  const devices = computeDevices(project, library);
  const coilCodes = new Set(
    library
      .all()
      .filter((s) => s.kind === "coil")
      .map((s) => s.componentCode),
  );
  return {
    coilsWithoutContacts: devices.filter(
      (d) => d.master?.kind === "coil" && d.contacts.length === 0,
    ),
    orphanContacts: devices.filter(
      (d) => !d.master && d.contacts.length > 0 && coilCodes.has(d.code),
    ),
  };
}
