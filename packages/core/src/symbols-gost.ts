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
  category: "Предохранители",
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
  category: "Выключатели-разъединители",
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
  category: "Автоматические выключатели",
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
  category: "Контакторы",
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
  category: "Кнопки и переключатели",
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
  category: "Лампы и индикаторы",
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
  category: "Двигатели",
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
  category: "Дифавтоматы (АВДТ)",
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

/** Контакт контактора, НО (13/14) — slave катушки KM (общая сигла). */
const KM_NO: SymbolDef = {
  id: "gost.km.no",
  name: "Контакт КМ (НО)",
  category: "Контакторы",
  componentCode: "KM",
  kind: "contact-no",
  pins: [
    { name: "13", x: 0, y: TOP },
    { name: "14", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 9.5 },
  ],
};

/** Контакт контактора, НЗ (21/22) — slave катушки KM; перемычка = нормально замкнут. */
const KM_NC: SymbolDef = {
  id: "gost.km.nc",
  name: "Контакт КМ (НЗ)",
  category: "Контакторы",
  componentCode: "KM",
  kind: "contact-nc",
  pins: [
    { name: "21", x: 0, y: TOP },
    { name: "22", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 9.5 },
    { type: "line", x1: 3.2, y1: 8, x2: 5.4, y2: 6.4 },
  ],
};

/** Катушка реле (ГОСТ 2.756): прямоугольник, выводы A1/A2. */
const K: SymbolDef = {
  id: "gost.k",
  name: "Катушка реле",
  category: "Реле",
  componentCode: "K",
  kind: "coil",
  pins: [
    { name: "A1", x: 0, y: TOP },
    { name: "A2", x: 0, y: BOT },
  ],
  graphics: [lead(TOP, 4), lead(11, BOT), { type: "rect", x: -3, y: 4, w: 6, h: 7 }],
};

/** Контакт реле, НО (13/14) — slave катушки K (общая сигла). */
const K_NO: SymbolDef = {
  id: "gost.k.no",
  name: "Контакт реле (НО)",
  category: "Реле",
  componentCode: "K",
  kind: "contact-no",
  pins: [
    { name: "13", x: 0, y: TOP },
    { name: "14", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 9.5 },
  ],
};

/** Контакт реле, НЗ (21/22) — slave катушки K; перемычка = нормально замкнут. */
const K_NC: SymbolDef = {
  id: "gost.k.nc",
  name: "Контакт реле (НЗ)",
  category: "Реле",
  componentCode: "K",
  kind: "contact-nc",
  pins: [
    { name: "21", x: 0, y: TOP },
    { name: "22", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 9.5 },
    { type: "line", x1: 3.2, y1: 8, x2: 5.4, y2: 6.4 },
  ],
};

/** Трансформатор однофазный (ГОСТ 2.723): две обмотки — два круга. */
const T: SymbolDef = {
  id: "gost.t",
  name: "Трансформатор",
  category: "Трансформаторы",
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
  category: "Клеммы",
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

/** Разъём 4-контактный (ГОСТ 2.755): розетка XS — контакты с полукруглыми гнёздами. */
const XS: SymbolDef = {
  id: "gost.xs",
  name: "Разъём (розетка)",
  category: "Разъёмы",
  componentCode: "XS",
  kind: "connector",
  pins: [
    { name: "1", x: 0, y: 0 },
    { name: "2", x: 0, y: 5 },
    { name: "3", x: 0, y: 10 },
    { name: "4", x: 0, y: 15 },
  ],
  graphics: [
    { type: "line", x1: 0, y1: 0, x2: 4, y2: 0 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 5 },
    { type: "line", x1: 0, y1: 10, x2: 4, y2: 10 },
    { type: "line", x1: 0, y1: 15, x2: 4, y2: 15 },
    { type: "circle", cx: 5, cy: 0, r: 1 }, // гнездо контакта
    { type: "circle", cx: 5, cy: 5, r: 1 },
    { type: "circle", cx: 5, cy: 10, r: 1 },
    { type: "circle", cx: 5, cy: 15, r: 1 },
    { type: "line", x1: 7, y1: -2, x2: 7, y2: 17 }, // корпус разъёма
  ],
};

/**
 * Соединитель страниц (S29): адресная стрелка переноса провода между листами.
 * Один вывод в опорной точке (0,0) — цепляется к концу провода; стрелка смотрит «наружу»
 * (вправо, направление меняется поворотом). Метка сигнала и адрес партнёра — в рендере.
 */
const PAGE_CONN: SymbolDef = {
  id: "gost.page-connector",
  name: "Соединитель страниц",
  category: "Служебные",
  componentCode: "W", // служебный (провод/перенос); сигла не используется — адресуется меткой
  kind: "page-connector",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [
    { type: "line", x1: 0, y1: 0, x2: 8, y2: 0 },
    { type: "line", x1: 8, y1: 0, x2: 5, y2: -2.5 },
    { type: "line", x1: 8, y1: 0, x2: 5, y2: 2.5 },
  ],
};

/**
 * Продолжение провода (S29): приёмный соединитель страниц — «ласточкин хвост»
 * (флажок с V-вырезом). Тот же `page-connector`: связывается по метке как стрелка.
 */
const PAGE_CONN_IN: SymbolDef = {
  id: "gost.page-connector-in",
  name: "Продолжение провода",
  category: "Служебные",
  componentCode: "W",
  kind: "page-connector",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [
    { type: "line", x1: 0, y1: 0, x2: 3, y2: 0 }, // хвостик к проводу
    { type: "line", x1: 3, y1: -3, x2: 9, y2: -3 }, // верх флажка
    { type: "line", x1: 9, y1: -3, x2: 7, y2: 0 }, // вырез (верхняя грань)
    { type: "line", x1: 7, y1: 0, x2: 9, y2: 3 }, // вырез (нижняя грань)
    { type: "line", x1: 9, y1: 3, x2: 3, y2: 3 }, // низ флажка
    { type: "line", x1: 3, y1: 3, x2: 3, y2: -3 }, // левая грань
  ],
};

/** Встроенная библиотека стартовых УГО (ГОСТ). */
export const GOST_SYMBOLS: SymbolDef[] = [
  QF,
  QFD,
  QS,
  FU,
  KM,
  KM_NO,
  KM_NC,
  K,
  K_NO,
  K_NC,
  SB,
  HL,
  M,
  T,
  XT,
  XS,
  PAGE_CONN,
  PAGE_CONN_IN,
];
