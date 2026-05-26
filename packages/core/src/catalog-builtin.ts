/**
 * Встроенный мини-каталог (стартовый набор изделий) — для привязки артикулов и
 * проверки спецификации (S7). Расширяется чистыми данными; полноценные каталоги
 * из файлов `*.part.json` — позже (S6+/S12). Номиналы/артикулы — примерные.
 */
import type { CatalogPart } from "./catalog";

export const BUILTIN_PARTS: CatalogPart[] = [
  // Автоматические выключатели (QF)
  {
    code: "MVA20-1-010-C",
    manufacturer: "IEK",
    type: "ВА47-29 1P",
    rating: "C10",
    description: "Выключатель автоматический 1P 10А C",
    componentCode: "QF",
  },
  {
    code: "MVA20-1-016-C",
    manufacturer: "IEK",
    type: "ВА47-29 1P",
    rating: "C16",
    description: "Выключатель автоматический 1P 16А C",
    componentCode: "QF",
  },
  {
    code: "A9F74225",
    manufacturer: "Schneider Electric",
    type: "Acti9 iC60N 2P",
    rating: "C25",
    description: "Выключатель автоматический 2P 25А C",
    componentCode: "QF",
  },
  // Дифавтоматы / АВДТ (QF)
  {
    code: "MVD10-2-016-30",
    manufacturer: "IEK",
    type: "АВДТ32 2P",
    rating: "C16 / 30мА",
    description: "Дифавтомат 2P 16А C, 30мА",
    componentCode: "QF",
  },
  // Контакторы (KM)
  {
    code: "LC1D09M7",
    manufacturer: "Schneider Electric",
    type: "TeSys D",
    rating: "9А / 230В",
    description: "Контактор 3P 9А, катушка 230В AC",
    componentCode: "KM",
  },
  {
    code: "MKK10-09-230",
    manufacturer: "IEK",
    type: "КМИ",
    rating: "9А / 230В",
    description: "Контактор 3P 9А, катушка 230В",
    componentCode: "KM",
  },
  // Реле (K)
  {
    code: "RXM2AB2P7",
    manufacturer: "Schneider Electric",
    type: "Zelio RXM",
    rating: "230В AC",
    description: "Реле промежуточное 2CO, катушка 230В AC",
    componentCode: "K",
  },
  // Выключатели-разъединители (QS)
  {
    code: "MPR10-3-040",
    manufacturer: "IEK",
    type: "ВР-32",
    rating: "40А",
    description: "Выключатель-разъединитель 3P 40А",
    componentCode: "QS",
  },
  // Предохранители (FU)
  {
    code: "DF101610",
    manufacturer: "DKC",
    type: "10×38",
    rating: "gG 10А",
    description: "Предохранитель цилиндрический 10×38 10А",
    componentCode: "FU",
  },
  // Лампы (HL)
  {
    code: "AD22DS-G",
    manufacturer: "IEK",
    type: "AD22DS",
    rating: "230В зелёная",
    description: "Лампа сигнальная 22мм зелёная 230В",
    componentCode: "HL",
  },
  // Кнопки (SB)
  {
    code: "ABLFP1-G",
    manufacturer: "IEK",
    type: "ABLF",
    rating: "1НО зелёная",
    description: "Кнопка управления 22мм с фиксацией, 1НО",
    componentCode: "SB",
  },
  // Клеммы (XT)
  {
    code: "YZN10-004",
    manufacturer: "IEK",
    type: "ЗНИ-4",
    rating: "4 мм²",
    description: "Клемма винтовая проходная 4 мм²",
    componentCode: "XT",
  },
];
