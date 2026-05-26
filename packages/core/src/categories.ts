/**
 * Категории оборудования (S27): строгая типизация УГО по классу оборудования
 * (автоматы, контакторы, лампы, клеммы…). Категория задаёт префикс сиглы, допустимые
 * поведения (kind) и **схему характеристик** класса — они используются в подписях и
 * свойствах элемента (data-driven вместо хардкода). Символ живёт в своей категории.
 *
 * Базовый комплект — `GOST_CATEGORIES`. Пользователь может завести свои категории
 * (тот же тип) со своими характеристиками; они мёржатся в `CategoryRegistry` и
 * выгружаются/шарятся вместе с символами (пак — позже, S12).
 */
import type { SymbolKind } from "./symbol";

/** Характеристика категории (поле, используемое в подписях/свойствах). */
export interface AttrDef {
  /** Ключ (хранится в `SymbolInstance.attributes`). */
  key: string;
  /** Подпись поля для UI. */
  label: string;
  type?: "text" | "number" | "select";
  /** Варианты для `type: "select"`. */
  options?: string[];
}

/** Класс оборудования = «строгая категория» УГО. */
export interface EquipmentCategory {
  /** Стабильный id, напр. «breaker». */
  id: string;
  /** Отображаемое имя (= `SymbolDef.category`), напр. «Автоматические выключатели». */
  name: string;
  /** Префикс сиглы по ГОСТ 2.710 (QF/KM/…); «» для прочего. */
  componentCode: string;
  /** Допустимые поведения символов в категории. */
  kinds: SymbolKind[];
  /** Характеристики класса (для подписей/свойств). */
  attributes: AttrDef[];
  /** Пользовательская категория (не из базового комплекта). */
  user?: boolean;
}

const sel = (key: string, label: string, options: string[]): AttrDef => ({
  key,
  label,
  type: "select",
  options,
});
const txt = (key: string, label: string): AttrDef => ({ key, label, type: "text" });

/** Базовый комплект категорий (ГОСТ). */
export const GOST_CATEGORIES: EquipmentCategory[] = [
  {
    id: "breaker",
    name: "Автоматические выключатели",
    componentCode: "QF",
    kinds: ["component-aux"],
    attributes: [
      txt("current", "Номинал, А"),
      sel("curve", "Характеристика", ["B", "C", "D"]),
      sel("poles", "Полюса", ["1P", "2P", "3P", "4P"]),
    ],
  },
  {
    id: "rcbo",
    name: "Дифавтоматы (АВДТ)",
    componentCode: "QF",
    kinds: ["component-aux"],
    attributes: [
      txt("current", "Номинал, А"),
      sel("leak", "Ток утечки, мА", ["10", "30", "100", "300"]),
      sel("poles", "Полюса", ["2P", "4P"]),
    ],
  },
  {
    id: "disconnector",
    name: "Выключатели-разъединители",
    componentCode: "QS",
    kinds: ["component-aux"],
    attributes: [txt("current", "Номинал, А")],
  },
  {
    id: "fuse",
    name: "Предохранители",
    componentCode: "FU",
    kinds: ["component"],
    attributes: [txt("current", "Номинал, А")],
  },
  {
    id: "contactor",
    name: "Контакторы",
    componentCode: "KM",
    kinds: ["coil", "contact-no", "contact-nc"],
    attributes: [txt("coilU", "Напряжение катушки"), txt("current", "Ток гл. контактов, А")],
  },
  {
    id: "relay",
    name: "Реле",
    componentCode: "K",
    kinds: ["coil", "contact-no", "contact-nc"],
    attributes: [txt("coilU", "Напряжение катушки")],
  },
  {
    id: "button",
    name: "Кнопки и переключатели",
    componentCode: "SB",
    kinds: ["contact-no", "contact-nc"],
    attributes: [txt("color", "Цвет"), sel("latching", "Фиксация", ["без фикс.", "с фикс."])],
  },
  {
    id: "lamp",
    name: "Лампы и индикаторы",
    componentCode: "HL",
    kinds: ["component"],
    attributes: [txt("color", "Цвет"), txt("voltage", "Напряжение")],
  },
  {
    id: "motor",
    name: "Двигатели",
    componentCode: "M",
    kinds: ["component"],
    attributes: [txt("power", "Мощность, кВт"), txt("rpm", "Обороты, об/мин")],
  },
  {
    id: "transformer",
    name: "Трансформаторы",
    componentCode: "T",
    kinds: ["component"],
    attributes: [txt("windings", "Напряжения обмоток")],
  },
  {
    id: "terminal",
    name: "Клеммы",
    componentCode: "XT",
    kinds: ["terminal", "connector"],
    attributes: [txt("section", "Сечение, мм²")],
  },
  {
    id: "misc",
    name: "Прочее",
    componentCode: "",
    kinds: ["component", "black-box"],
    attributes: [],
  },
];

/** Реестр категорий: доступ по имени/id; мёрж базового комплекта и пользовательских. */
export class CategoryRegistry {
  private readonly byNameMap = new Map<string, EquipmentCategory>();

  constructor(categories: EquipmentCategory[] = []) {
    for (const c of categories) this.add(c);
  }

  /** Добавить/перекрыть категорию (по имени). */
  add(category: EquipmentCategory): void {
    this.byNameMap.set(category.name, category);
  }

  byName(name: string): EquipmentCategory | undefined {
    return this.byNameMap.get(name);
  }

  byId(id: string): EquipmentCategory | undefined {
    for (const c of this.byNameMap.values()) if (c.id === id) return c;
    return undefined;
  }

  all(): EquipmentCategory[] {
    return [...this.byNameMap.values()];
  }
}
