/**
 * Стартовый набор УГО по ГОСТ (встроенная библиотека).
 * Геометрия приближённая, но узнаваемая; выводы — на сетке 5 мм.
 * Уточнение начертаний по ГОСТ 2.721/2.755 — отдельная задача (как и точный штамп).
 * Расширяется чистыми данными: добавить элемент = добавить `SymbolDef`.
 *
 * Соглашение: вертикальный 2-выводной элемент, выводы (0,0) сверху и (0,15) снизу,
 * тело между y=4..11, начало координат — в верхнем выводе.
 */
import type { SymbolDef } from "./symbol";

const TOP = 0;
const BOT = 15;
/** Верхний/нижний выводы для типового вертикального элемента. */
const lead = (fromY: number, toY: number) =>
  ({ type: "line", x1: 0, y1: fromY, x2: 0, y2: toY }) as const;

/** Предохранитель (ГОСТ 2.727): прямоугольник с осевой линией. */
const FU: SymbolDef = {
  id: "gost.fu",
  name: "Предохранитель",
  category: "Защита",
  componentCode: "FU",
  kind: "component",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 4),
    lead(11, BOT),
    { type: "rect", x: -2.5, y: 4, w: 5, h: 7 },
    { type: "line", x1: 0, y1: 4, x2: 0, y2: 11 },
  ],
};

/** Выключатель-разъединитель (ГОСТ 2.755): подвижный контакт под углом. */
const QS: SymbolDef = {
  id: "gost.qs",
  name: "Выключатель-разъединитель",
  category: "Коммутация",
  componentCode: "QS",
  kind: "component-aux",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 }, // неподвижный контакт
    { type: "line", x1: 0, y1: 5, x2: 4.5, y2: 10.5 }, // подвижный контакт (разомкнут)
  ],
};

/** Автоматический выключатель (ГОСТ 2.755): контакт + метка авторасцепителя. */
const QF: SymbolDef = {
  id: "gost.qf",
  name: "Выключатель автоматический",
  category: "Коммутация",
  componentCode: "QF",
  kind: "component-aux",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4.5, y2: 10.5 },
    { type: "rect", x: 3.3, y: 4.6, w: 2, h: 2 }, // метка автомата у конца контакта
  ],
};

/** Катушка контактора/реле (ГОСТ 2.756): прямоугольник, выводы A1/A2. */
const KM: SymbolDef = {
  id: "gost.km",
  name: "Катушка контактора",
  category: "Контакторы и реле",
  componentCode: "KM",
  kind: "coil",
  pins: [
    { name: "A1", x: 0, y: TOP },
    { name: "A2", x: 0, y: BOT },
  ],
  graphics: [lead(TOP, 4), lead(11, BOT), { type: "rect", x: -3, y: 4, w: 6, h: 7 }],
};

/** Кнопка управления (ГОСТ 2.755): нормально разомкнутый контакт с толкателем. */
const SB: SymbolDef = {
  id: "gost.sb",
  name: "Кнопка управления (НО)",
  category: "Управление",
  componentCode: "SB",
  kind: "contact-no",
  pins: [
    { name: "3", x: 0, y: TOP },
    { name: "4", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 9.5 }, // контакт (разомкнут)
    { type: "line", x1: 2.3, y1: 7.4, x2: 2.3, y2: 2.5 }, // шток толкателя
    { type: "line", x1: 0.3, y1: 2.5, x2: 4.3, y2: 2.5 }, // кнопка
  ],
};

/** Лампа сигнальная (ГОСТ 2.732): круг с крестом. */
const HL: SymbolDef = {
  id: "gost.hl",
  name: "Лампа сигнальная",
  category: "Индикация",
  componentCode: "HL",
  kind: "component",
  pins: [
    { name: "X1", x: 0, y: TOP },
    { name: "X2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 4),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 7.5, r: 3.5 },
    { type: "line", x1: -2.5, y1: 5, x2: 2.5, y2: 10 },
    { type: "line", x1: -2.5, y1: 10, x2: 2.5, y2: 5 },
  ],
};

/** Двигатель (ГОСТ 2.722): круг с буквой M. */
const M: SymbolDef = {
  id: "gost.m",
  name: "Двигатель",
  category: "Нагрузка",
  componentCode: "M",
  kind: "component",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 4),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 7.5, r: 3.5 },
    { type: "text", x: 0, y: 7.5, text: "M", size: 4, anchor: "middle" },
  ],
};

/** Дифференциальный автомат / УЗО (АВДТ): модуль с контактом и датчиком тока. */
const QFD: SymbolDef = {
  id: "gost.qfd",
  name: "Дифавтомат (АВДТ)",
  category: "Коммутация",
  componentCode: "QF",
  kind: "component-aux",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 3),
    lead(12, BOT),
    { type: "rect", x: -4, y: 3, w: 8, h: 9 },
    { type: "line", x1: 0, y1: 3, x2: 3, y2: 8 }, // контакт
    { type: "circle", cx: 0, cy: 10, r: 1.2 }, // датчик дифф. тока
  ],
};

/** Катушка реле (ГОСТ 2.756): прямоугольник, выводы A1/A2. */
const K: SymbolDef = {
  id: "gost.k",
  name: "Катушка реле",
  category: "Контакторы и реле",
  componentCode: "K",
  kind: "coil",
  pins: [
    { name: "A1", x: 0, y: TOP },
    { name: "A2", x: 0, y: BOT },
  ],
  graphics: [lead(TOP, 4), lead(11, BOT), { type: "rect", x: -3, y: 4, w: 6, h: 7 }],
};

/** Трансформатор однофазный (ГОСТ 2.723): две обмотки — два круга. */
const T: SymbolDef = {
  id: "gost.t",
  name: "Трансформатор",
  category: "Питание",
  componentCode: "T",
  kind: "component",
  pins: [
    { name: "1", x: -5, y: 0 }, // первичная
    { name: "2", x: 5, y: 0 },
    { name: "3", x: -5, y: 20 }, // вторичная
    { name: "4", x: 5, y: 20 },
  ],
  graphics: [
    { type: "circle", cx: 0, cy: 7, r: 4 },
    { type: "circle", cx: 0, cy: 13, r: 4 },
    { type: "line", x1: -5, y1: 0, x2: -2.8, y2: 4.2 },
    { type: "line", x1: 5, y1: 0, x2: 2.8, y2: 4.2 },
    { type: "line", x1: -5, y1: 20, x2: -2.8, y2: 15.8 },
    { type: "line", x1: 5, y1: 20, x2: 2.8, y2: 15.8 },
  ],
};

/** Клемма (ГОСТ: XT): проходное соединение, точка-маркер. */
const XT: SymbolDef = {
  id: "gost.xt",
  name: "Клемма",
  category: "Соединения",
  componentCode: "XT",
  kind: "terminal",
  pins: [
    { name: "1", x: 0, y: 0 },
    { name: "2", x: 0, y: 10 },
  ],
  graphics: [
    { type: "line", x1: 0, y1: 0, x2: 0, y2: 10 },
    { type: "circle", cx: 0, cy: 5, r: 1.5 },
  ],
};

/** Встроенная библиотека стартовых УГО (ГОСТ). */
export const GOST_SYMBOLS: SymbolDef[] = [QF, QFD, QS, FU, KM, K, SB, HL, M, T, XT];
