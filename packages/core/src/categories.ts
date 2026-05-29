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
import { SYMBOL_KINDS, type SymbolKind } from "./symbol";

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
    kinds: ["coil", "contact-no", "contact-nc", "contact-co", "contact-main"],
    attributes: [txt("coilU", "Напряжение катушки"), txt("current", "Ток гл. контактов, А")],
  },
  {
    id: "relay",
    name: "Реле",
    componentCode: "K",
    kinds: ["coil", "contact-no", "contact-nc", "contact-co"],
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
    id: "connector",
    name: "Разъёмы",
    componentCode: "XS",
    kinds: ["connector"],
    attributes: [txt("pins", "Контактов"), txt("rating", "Ток / напряжение")],
  },
  {
    id: "service",
    name: "Служебные",
    componentCode: "W",
    kinds: ["page-connector"],
    attributes: [],
  },
  {
    id: "misc",
    name: "Прочее",
    componentCode: "",
    kinds: ["component", "black-box"],
    attributes: [],
  },
];

/** Результат валидации категории (формат пользовательского пака — позже, S12). */
export type CategoryValidation =
  | { ok: true; category: EquipmentCategory }
  | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Структурная валидация `EquipmentCategory` (при загрузке пользовательских категорий).
 * `componentCode` может быть пустым (категория «Прочее»); `kinds` — непустой список
 * допустимых поведений; `attributes` — массив пар {key,label}.
 */
export function validateCategory(input: unknown): CategoryValidation {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["category must be an object"] };

  for (const f of ["id", "name"] as const) {
    if (!isStr(input[f]) || input[f].length === 0) errors.push(`"${f}" must be a non-empty string`);
  }
  if (!isStr(input.componentCode)) errors.push(`"componentCode" must be a string`);

  if (!Array.isArray(input.kinds) || input.kinds.length === 0) {
    errors.push(`"kinds" must be a non-empty array`);
  } else if (!input.kinds.every((k) => SYMBOL_KINDS.includes(k as SymbolKind))) {
    errors.push(`"kinds" must contain only valid symbol kinds`);
  }

  if (!Array.isArray(input.attributes)) {
    errors.push(`"attributes" must be an array`);
  } else {
    input.attributes.forEach((a, i) => {
      if (!isObj(a) || !isStr(a.key) || !isStr(a.label))
        errors.push(`attributes[${i}]: requires { key: string, label: string }`);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, category: input as unknown as EquipmentCategory };
}

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
