/**
 * Каталог изделий (Catalog) — слой 1 доменной модели (CLAUDE принцип 3): изделия
 * производителей, декуплены от символов (УГО) и схемы. Артикул присваивается
 * устройству (`Device`) и попадает в спецификацию (S7).
 *
 * MVP-формат (минимум полей): код/артикул, производитель, тип/серия, номинал,
 * описание, применимый ГОСТ-код (для фильтра в браузере). Открытый формат
 * `*.part.json` + JSON Schema и расширяемые каталоги из файлов — позже (S6+/S12).
 */

/** Изделие каталога (одна позиция спецификации). */
export interface CatalogPart {
  /** Артикул / код заказа — уникальный ключ, напр. «MVA40-1-016-C». */
  code: string;
  /** Производитель, напр. «IEK». */
  manufacturer: string;
  /** Тип / серия, напр. «ВА47-29». */
  type: string;
  /** Номинал / характеристика, напр. «C16» или «230В 50Гц». */
  rating?: string;
  /** Человекочитаемое описание. */
  description?: string;
  /** ГОСТ-код сиглы, к которому применимо изделие (QF/KM/K/…) — для фильтра. */
  componentCode?: string;
}

/** Каталог изделий: доступ по коду, фильтр по ГОСТ-коду сиглы. */
export class Catalog {
  private readonly map = new Map<string, CatalogPart>();

  constructor(parts: CatalogPart[] = []) {
    for (const p of parts) this.add(p);
  }

  add(part: CatalogPart): void {
    this.map.set(part.code, part);
  }

  get(code: string): CatalogPart | undefined {
    return this.map.get(code);
  }

  all(): CatalogPart[] {
    return [...this.map.values()];
  }

  /** Изделия, применимые к ГОСТ-коду сиглы (для браузера при привязке). */
  byComponentCode(code: string): CatalogPart[] {
    return this.all().filter((p) => p.componentCode === code);
  }
}

/** Короткая строка изделия для подписи: «производитель тип номинал». */
export function partLabel(p: CatalogPart): string {
  return [p.manufacturer, p.type, p.rating].filter(Boolean).join(" ");
}
