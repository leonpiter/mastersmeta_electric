/**
 * Стартовый набор УГО по ГОСТ (встроенная библиотека).
 * Геометрия приближённая, но узнаваемая; выводы — на сетке 5 мм.
 * Уточнение начертаний по ГОСТ 2.721/2.755 — отдельная задача (как и точный штамп).
 * Расширяется чистыми данными: добавить элемент = добавить `SymbolDef`.
 *
 * Соглашение: вертикальный 2-выводной элемент, выводы (0,0) сверху и (0,15) снизу,
 * тело между y=4..11, начало координат — в верхнем выводе.
 */
import type { GraphicPrimitive, Pin, SymbolDef } from "./symbol";

const TOP = 0;
const BOT = 15;
/** Верхний/нижний выводы для типового вертикального элемента. */
const lead = (fromY: number, toY: number) =>
  ({ type: "line", x1: 0, y1: fromY, x2: 0, y2: toY }) as const;

/**
 * Отразить графику по вертикали (y → h − y) — чтобы контакты «открывались вверх»
 * (неподвижный контакт сверху). Выводы (pins) симметричны (0 и h), поэтому остаются.
 */
function flipY(prims: GraphicPrimitive[], h = 15): GraphicPrimitive[] {
  return prims.map((g) => {
    if (g.type === "line") return { ...g, y1: h - g.y1, y2: h - g.y2 };
    if (g.type === "rect") return { ...g, y: h - g.y - g.h };
    if (g.type === "circle" || g.type === "ellipse") return { ...g, cy: h - g.cy };
    if (g.type === "arc") return { ...g, cy: h - g.cy, a0: -g.a1, a1: -g.a0 };
    return { ...g, y: h - g.y }; // text
  });
}

/** Графика полюса рубильника/разъединителя при x (база «открыт вниз»; flipY в агрегаторе). */
function switchPole(x: number): GraphicPrimitive[] {
  return [
    { type: "line", x1: x, y1: 0, x2: x, y2: 5 }, // верхний вывод
    { type: "line", x1: x, y1: 11, x2: x, y2: 15 }, // нижний вывод
    { type: "circle", cx: x, cy: 11, r: 0.6 }, // неподвижный контакт
    { type: "line", x1: x, y1: 5, x2: x + 3, y2: 10.2 }, // подвижный контакт 30°, длина 6
  ];
}

/**
 * Полюс автоматического выключателя (ГОСТ 2.755): неподвижный контакт-кружок Ø2
 * снизу (токовая перегрузка), наклонный подвижный нож с коробочкой авторасцепителя
 * (≈1.5×2), знак «×» функции выключения сверху. По образцу UGO/методички.
 */
function breakerPole(x: number): GraphicPrimitive[] {
  // база «открыт вниз» (× сверху, Ø2 снизу); flipY в агрегаторе → Ø2 сверху, × снизу
  return [
    { type: "line", x1: x, y1: 0, x2: x, y2: 4 }, // вывод
    { type: "line", x1: x - 1.2, y1: 1.8, x2: x + 1.2, y2: 4.2 }, // × функция выключения (≈2)
    { type: "line", x1: x - 1.2, y1: 4.2, x2: x + 1.2, y2: 1.8 },
    { type: "line", x1: x, y1: 4.5, x2: x + 3, y2: 9 }, // подвижный контакт (нож), наклон ~30°
    // коробочка авторасцепителя — наклонный прямоугольник ≈1.5×2 вдоль ножа
    { type: "line", x1: x + 1.1, y1: 5.4, x2: x + 2.1, y2: 6.9 },
    { type: "line", x1: x + 2.1, y1: 6.9, x2: x + 1.0, y2: 7.7 },
    { type: "line", x1: x + 1.0, y1: 7.7, x2: x, y2: 6.2 },
    { type: "line", x1: x, y1: 6.2, x2: x + 1.1, y2: 5.4 },
    { type: "circle", cx: x, cy: 11, r: 1 }, // неподвижный контакт Ø2 (токовая перегрузка)
    { type: "line", x1: x, y1: 12, x2: x, y2: 15 }, // вывод
  ];
}

/**
 * Многополюсный коммутационный аппарат (ГОСТ 2.755): N полюсов с шагом 5 мм,
 * выводы 1/2, 3/4 … + штрих механической связи между подвижными контактами.
 */
function poleSwitch(opts: {
  id: string;
  name: string;
  category: string;
  code: string;
  poles: number;
  auto?: boolean;
}): SymbolDef {
  const g: GraphicPrimitive[] = [];
  const pins: Pin[] = [];
  for (let i = 0; i < opts.poles; i++) {
    const x = i * 5;
    g.push(...(opts.auto ? breakerPole(x) : switchPole(x)));
    pins.push({ name: String(2 * i + 1), x, y: TOP });
    pins.push({ name: String(2 * i + 2), x, y: BOT });
  }
  if (opts.poles > 1) {
    // механическая связь (штрих) между подвижными контактами
    const ly = opts.auto ? 6.5 : 7.6;
    g.push({ type: "line", x1: 0, y1: ly, x2: (opts.poles - 1) * 5, y2: ly });
  }
  return {
    id: opts.id,
    name: opts.name,
    category: opts.category,
    componentCode: opts.code,
    kind: "component-aux",
    pins,
    graphics: g,
  };
}

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
    lead(TOP, 2.5),
    lead(12.5, BOT),
    { type: "rect", x: -2, y: 2.5, w: 4, h: 10 },
    { type: "line", x1: 0, y1: 2.5, x2: 0, y2: 12.5 },
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
    { type: "line", x1: 0, y1: 5, x2: 3, y2: 10.2 }, // подвижный контакт 30°, длина 6 (разомкнут)
  ],
};

/** Автоматический выключатель (ГОСТ 2.755): нож + Ø2 + коробочка + знак выключения. */
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
  graphics: breakerPole(0),
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
  graphics: [lead(TOP, 4.5), lead(10.5, BOT), { type: "rect", x: -6, y: 4.5, w: 12, h: 6 }],
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
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 }, // контакт (разомкнут)
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
    lead(TOP, 2.5),
    lead(12.5, BOT),
    { type: "circle", cx: 0, cy: 7.5, r: 5 },
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
    { name: "1", x: 0, y: 0 },
    { name: "2", x: 0, y: 20 },
    { name: "3", x: 5, y: 0 },
    { name: "4", x: 5, y: 20 },
  ],
  graphics: [
    // полюс 1 — автоматический контакт (× + коробочка + Ø2)
    { type: "line", x1: 0, y1: 0, x2: 0, y2: 5 },
    { type: "line", x1: -1, y1: 2, x2: 1, y2: 4 },
    { type: "line", x1: -1, y1: 4, x2: 1, y2: 2 }, // ×
    { type: "line", x1: 0, y1: 5, x2: 2.6, y2: 9 }, // нож
    { type: "rect", x: 0.2, y: 5.6, w: 1.6, h: 2 }, // коробочка авторасцепителя
    { type: "circle", cx: 0, cy: 10, r: 1 }, // Ø2 — токовая перегрузка
    { type: "line", x1: 0, y1: 11, x2: 0, y2: 20 },
    // полюс 2 (нейтраль) — коммутируемый контакт
    { type: "line", x1: 5, y1: 0, x2: 5, y2: 5 },
    { type: "circle", cx: 5, cy: 10, r: 0.6 },
    { type: "line", x1: 5, y1: 5, x2: 7.6, y2: 9 }, // нож
    { type: "line", x1: 5, y1: 11, x2: 5, y2: 20 },
    // механическая связь полюсов
    { type: "line", x1: 0, y1: 6.5, x2: 5, y2: 6.5 },
    // тороид дифференциального тока (эллипс) вокруг обоих проводников
    { type: "ellipse", cx: 2.5, cy: 15, rx: 5.5, ry: 2.3 },
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
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
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
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 0, y1: 5, x2: 5, y2: 5 },
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
  graphics: [lead(TOP, 4.5), lead(10.5, BOT), { type: "rect", x: -6, y: 4.5, w: 12, h: 6 }],
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
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
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
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 0, y1: 5, x2: 5, y2: 5 },
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
    { type: "circle", cx: 0, cy: 7, r: 5 },
    { type: "circle", cx: 0, cy: 13, r: 5 },
    { type: "line", x1: -5, y1: 0, x2: -2.9, y2: 2.95 },
    { type: "line", x1: 5, y1: 0, x2: 2.9, y2: 2.95 },
    { type: "line", x1: -5, y1: 20, x2: -2.9, y2: 17.05 },
    { type: "line", x1: 5, y1: 20, x2: 2.9, y2: 17.05 },
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

/** Перекидной (переключающий) контакт реле (ГОСТ 2.755): общий + НО + НЗ, нож на НЗ. */
const K_CO: SymbolDef = {
  id: "gost.k.co",
  name: "Контакт перекидной",
  category: "Реле",
  componentCode: "K",
  kind: "contact-co",
  pins: [
    { name: "11", x: 0, y: 15 }, // общий
    { name: "12", x: -5, y: 0 }, // НЗ
    { name: "14", x: 5, y: 0 }, // НО
  ],
  graphics: [
    { type: "line", x1: 0, y1: 15, x2: 0, y2: 10 }, // общий вывод
    { type: "line", x1: -5, y1: 0, x2: -5, y2: 6 }, // вывод НЗ
    { type: "line", x1: 5, y1: 0, x2: 5, y2: 6 }, // вывод НО
    { type: "line", x1: 0, y1: 10, x2: -5, y2: 6 }, // подвижный нож (замкнут на НЗ)
    { type: "circle", cx: 0, cy: 10, r: 0.6 }, // ось
    { type: "circle", cx: 5, cy: 6, r: 0.6 }, // контакт НО (разомкнут)
  ],
};

/** Главный (силовой) контакт контактора: НО-полюс; в зеркале — колонка «Гл.». */
const KM_MAIN: SymbolDef = {
  id: "gost.km.main",
  name: "Силовой контакт (KM)",
  category: "Контакторы",
  componentCode: "KM",
  kind: "contact-main",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 }, // подвижный контакт (НО)
    { type: "line", x1: -1.5, y1: 6.5, x2: 1.5, y2: 9.5 }, // штрих силового полюса
  ],
};

// ===== Ф3 · Силовая коммутация (Q, ГОСТ 2.755) + полюсные варианты =====
const SWG = "Силовая коммутация";

/** Выключатель силовой (Q) — однополюсный коммутационный контакт. */
const Q1 = poleSwitch({
  id: "gost.q",
  name: "Выключатель силовой",
  category: SWG,
  code: "Q",
  poles: 1,
});
/** Выключатель нагрузки (QW). */
const QW1 = poleSwitch({
  id: "gost.qw",
  name: "Выключатель нагрузки",
  category: SWG,
  code: "QW",
  poles: 1,
});

/** Короткозамыкатель (QK): контакт, замыкающий цепь на землю (нож с заземлением). */
const QK: SymbolDef = {
  id: "gost.qk",
  name: "Короткозамыкатель",
  category: SWG,
  componentCode: "QK",
  kind: "component-aux",
  pins: [{ name: "1", x: 0, y: TOP }],
  graphics: [
    lead(TOP, 5),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 3, y2: 10.2 }, // подвижный контакт 30°
    { type: "line", x1: 0, y1: 11, x2: 0, y2: 13 }, // к земле
    { type: "line", x1: -2.5, y1: 13, x2: 2.5, y2: 13 }, // заземление
    { type: "line", x1: -1.6, y1: 14, x2: 1.6, y2: 14 },
    { type: "line", x1: -0.8, y1: 15, x2: 0.8, y2: 15 },
  ],
};

/** Отделитель (QR): разъединитель с автоматическим отключением (метка). */
const QR: SymbolDef = {
  id: "gost.qr",
  name: "Отделитель",
  category: SWG,
  componentCode: "QR",
  kind: "component-aux",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 3, y2: 10.2 },
    { type: "rect", x: -1, y: 6.5, w: 2, h: 2 }, // метка отделителя
  ],
};

/** Разъединитель-заземлитель (QSG): рубильник с заземляющим ножом. */
const QSG: SymbolDef = {
  id: "gost.qsg",
  name: "Разъединитель-заземлитель",
  category: SWG,
  componentCode: "QSG",
  kind: "component-aux",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 3, y2: 10.2 },
    { type: "line", x1: 3, y1: 10.2, x2: 6, y2: 10.2 }, // отвод к земле
    { type: "line", x1: 4.5, y1: 11.4, x2: 7.5, y2: 11.4 },
    { type: "line", x1: 5.4, y1: 12.4, x2: 7, y2: 12.4 },
  ],
};

const QF2 = poleSwitch({
  id: "gost.qf.2p",
  name: "Автомат 2-полюсный",
  category: "Автоматические выключатели",
  code: "QF",
  poles: 2,
  auto: true,
});
const QF3 = poleSwitch({
  id: "gost.qf.3p",
  name: "Автомат 3-полюсный",
  category: "Автоматические выключатели",
  code: "QF",
  poles: 3,
  auto: true,
});
const QF4 = poleSwitch({
  id: "gost.qf.4p",
  name: "Автомат 4-полюсный",
  category: "Автоматические выключатели",
  code: "QF",
  poles: 4,
  auto: true,
});

const QS2 = poleSwitch({
  id: "gost.qs.2p",
  name: "Разъединитель 2-полюсный",
  category: "Выключатели-разъединители",
  code: "QS",
  poles: 2,
});
const QS3 = poleSwitch({
  id: "gost.qs.3p",
  name: "Разъединитель 3-полюсный",
  category: "Выключатели-разъединители",
  code: "QS",
  poles: 3,
});
const QS4 = poleSwitch({
  id: "gost.qs.4p",
  name: "Разъединитель 4-полюсный",
  category: "Выключатели-разъединители",
  code: "QS",
  poles: 4,
});

const QW2 = poleSwitch({
  id: "gost.qw.2p",
  name: "Выключатель нагрузки 2-полюсный",
  category: SWG,
  code: "QW",
  poles: 2,
});
const QW3 = poleSwitch({
  id: "gost.qw.3p",
  name: "Выключатель нагрузки 3-полюсный",
  category: SWG,
  code: "QW",
  poles: 3,
});
const QW4 = poleSwitch({
  id: "gost.qw.4p",
  name: "Выключатель нагрузки 4-полюсный",
  category: SWG,
  code: "QW",
  poles: 4,
});

// ===== Ф4 · Коммутация управления (S, ГОСТ 2.755) =====
const BTN = "Кнопки и переключатели";
/** Толкатель кнопки (шток + клавиша) сбоку от подвижного контакта. */
const pusher: GraphicPrimitive[] = [
  { type: "line", x1: 2.3, y1: 7.4, x2: 2.3, y2: 2.5 },
  { type: "line", x1: 0.3, y1: 2.5, x2: 4.3, y2: 2.5 },
];

/** Кнопка управления (НЗ): размыкающий контакт с толкателем. */
const SB_NC: SymbolDef = {
  id: "gost.sb.nc",
  name: "Кнопка управления (НЗ)",
  category: BTN,
  componentCode: "SB",
  kind: "contact-nc",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 0, y1: 5, x2: 5, y2: 5 }, // перемычка НЗ
    ...pusher,
  ],
};

/** Переключатель / ключ управления (SA): перекидной контакт (общий + НО + НЗ). */
const SA: SymbolDef = {
  id: "gost.sa",
  name: "Переключатель (ключ)",
  category: BTN,
  componentCode: "SA",
  kind: "contact-co",
  pins: [
    { name: "11", x: 0, y: 15 },
    { name: "12", x: -5, y: 0 },
    { name: "14", x: 5, y: 0 },
  ],
  graphics: [
    { type: "line", x1: 0, y1: 15, x2: 0, y2: 10 },
    { type: "line", x1: -5, y1: 0, x2: -5, y2: 6 },
    { type: "line", x1: 5, y1: 0, x2: 5, y2: 6 },
    { type: "line", x1: 0, y1: 10, x2: -5, y2: 6 },
    { type: "circle", cx: 0, cy: 10, r: 0.6 },
    { type: "circle", cx: 5, cy: 6, r: 0.6 },
    { type: "line", x1: 0, y1: 10, x2: 2.5, y2: 12 }, // рукоятка ключа
  ],
};

/** Автоматический выключатель цепи управления (SF): однополюсный с меткой автомата. */
const SF: SymbolDef = poleSwitch({
  id: "gost.sf",
  name: "Автомат цепи управления",
  category: BTN,
  code: "SF",
  poles: 1,
  auto: true,
});

/** Концевой (путевой) выключатель, НО (SQ): контакт с роликом-толкателем. */
const SQ_NO: SymbolDef = {
  id: "gost.sq.no",
  name: "Выключатель концевой (НО)",
  category: BTN,
  componentCode: "SQ",
  kind: "contact-no",
  pins: [
    { name: "13", x: 0, y: TOP },
    { name: "14", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 2, y1: 7.4, x2: 4.5, y2: 7.4 }, // упор ролика
    { type: "rect", x: 4.5, y: 6.4, w: 2, h: 2 }, // ролик/упор
  ],
};

/** Концевой выключатель, НЗ (SQ). */
const SQ_NC: SymbolDef = {
  id: "gost.sq.nc",
  name: "Выключатель концевой (НЗ)",
  category: BTN,
  componentCode: "SQ",
  kind: "contact-nc",
  pins: [
    { name: "11", x: 0, y: TOP },
    { name: "12", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 0, y1: 5, x2: 5, y2: 5 }, // перемычка НЗ
    { type: "rect", x: 4.5, y: 6.4, w: 2, h: 2 }, // ролик/упор
  ],
};

/** Термоконтакт (SK): размыкающий контакт, срабатывающий от температуры. */
const SK: SymbolDef = {
  id: "gost.sk",
  name: "Термоконтакт (SK)",
  category: BTN,
  componentCode: "SK",
  kind: "contact-nc",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 0, y1: 5, x2: 5, y2: 5 }, // перемычка НЗ
    { type: "text", x: 5.5, y: 4.5, text: "t°", size: 3, anchor: "start" }, // признак температуры
  ],
};

/** Замыкающий контакт с замедлением (ГОСТ 2.755): дуга-«парашют» у подвижного контакта. */
const S_NO_DELAY: SymbolDef = {
  id: "gost.s.no.delay",
  name: "Контакт с замедлением (НО)",
  category: BTN,
  componentCode: "SA",
  kind: "contact-no",
  pins: [
    { name: "13", x: 0, y: TOP },
    { name: "14", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "arc", cx: 2, cy: 7.75, r: 2, a0: 0, a1: 180 }, // замедление (парашют снизу)
  ],
};

/** Размыкающий контакт с замедлением. */
const S_NC_DELAY: SymbolDef = {
  id: "gost.s.nc.delay",
  name: "Контакт с замедлением (НЗ)",
  category: BTN,
  componentCode: "SA",
  kind: "contact-nc",
  pins: [
    { name: "11", x: 0, y: TOP },
    { name: "12", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 5),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 11, r: 0.6 },
    { type: "line", x1: 0, y1: 5, x2: 4, y2: 10.5 },
    { type: "line", x1: 0, y1: 5, x2: 5, y2: 5 }, // перемычка НЗ
    { type: "arc", cx: 2, cy: 7.75, r: 2, a0: 180, a1: 360 }, // замедление (парашют сверху)
  ],
};

// ===== Ф5 · Реле (K, ГОСТ 2.756) — катушки подтипов (общее начертание 12×6) =====
const RELAY = "Реле";
/** Катушка реле-подтипа: общий прямоугольник 12×6, сигла — свой код. */
function relayCoil(code: string, name: string): SymbolDef {
  return {
    id: `gost.coil.${code.toLowerCase()}`,
    name,
    category: RELAY,
    componentCode: code,
    kind: "coil",
    pins: [
      { name: "A1", x: 0, y: TOP },
      { name: "A2", x: 0, y: BOT },
    ],
    graphics: [lead(TOP, 4.5), lead(10.5, BOT), { type: "rect", x: -6, y: 4.5, w: 12, h: 6 }],
  };
}
const RELAY_COILS: SymbolDef[] = (
  [
    ["KA", "Реле токовое"],
    ["KB", "Реле блокировки"],
    ["KBS", "Реле блокировки от многократных вкл."],
    ["KF", "Реле частоты"],
    ["KH", "Реле указательное"],
    ["KL", "Реле промежуточное"],
    ["KQ", "Реле фиксации положения"],
    ["KQC", "Реле положения «включено»"],
    ["KQT", "Реле положения «отключено»"],
    ["KQS", "Реле положения разъединителя"],
    ["KS", "Реле контроля"],
    ["KSS", "Реле контроля сигнализации"],
    ["KSV", "Реле контроля напряжения"],
    ["KSG", "Реле газовое"],
    ["KST", "Термореле"],
    ["KT", "Реле времени"],
    ["KV", "Реле напряжения"],
    ["KW", "Реле мощности"],
  ] as const
).map(([code, name]) => relayCoil(code, name));

/** Воспринимающая часть электротеплового реле (KK): нагреватель в силовой цепи. */
const KK: SymbolDef = {
  id: "gost.kk",
  name: "Тепловое реле (нагреватель)",
  category: RELAY,
  componentCode: "KK",
  kind: "component-aux",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 2.5),
    lead(12.5, BOT),
    { type: "rect", x: -3, y: 2.5, w: 6, h: 10 },
    { type: "line", x1: -3, y1: 5.5, x2: 3, y2: 5.5 }, // элемент нагревателя
    { type: "line", x1: -3, y1: 9.5, x2: 3, y2: 9.5 },
  ],
};

// ===== Ф6 · Приборы, пассивные, полупроводники, источники, сигнальные, тр-ры, соединения =====
const twoPin: Pin[] = [
  { name: "1", x: 0, y: TOP },
  { name: "2", x: 0, y: BOT },
];

/** Измерительный прибор (ГОСТ 2.729): круг Ø10 с обозначением величины. */
/** Круглый 2-выводной элемент Ø10 с буквенной меткой (прибор/машина/источник). */
function meterLike(
  id: string,
  name: string,
  category: string,
  code: string,
  label: string,
): SymbolDef {
  return {
    id,
    name,
    category,
    componentCode: code,
    kind: "component",
    pins: twoPin,
    graphics: [
      lead(TOP, 2.5),
      lead(12.5, BOT),
      { type: "circle", cx: 0, cy: 7.5, r: 5 },
      { type: "text", x: 0, y: 7.5, text: label, size: 3.4, anchor: "middle" },
    ],
  };
}
const meter = (code: string, name: string, label: string): SymbolDef =>
  meterLike(`gost.${code.toLowerCase()}`, name, "Приборы измерительные", code, label);
const METERS: SymbolDef[] = (
  [
    ["PA", "Амперметр", "A"],
    ["PV", "Вольтметр", "V"],
    ["PW", "Ваттметр", "W"],
    ["PVA", "Варметр", "var"],
    ["PI", "Счётчик активной энергии", "Wh"],
    ["PK", "Счётчик реактивной энергии", "вр"],
    ["PR", "Омметр", "Ω"],
    ["PS", "Регистрирующий прибор", "∿"],
  ] as const
).map(([c, n, l]) => meter(c, n, l));

/** Резистор постоянный (ГОСТ 2.728): прямоугольник 10×4. */
const R: SymbolDef = {
  id: "gost.r",
  name: "Резистор",
  category: "Резисторы",
  componentCode: "R",
  kind: "component",
  pins: twoPin,
  graphics: [lead(TOP, 2.5), lead(12.5, BOT), { type: "rect", x: -2, y: 2.5, w: 4, h: 10 }],
};

/** Варистор / ОПН (RU): резистор с косой стрелкой. */
const RU: SymbolDef = {
  id: "gost.ru",
  name: "Варистор / ОПН",
  category: "Резисторы",
  componentCode: "RU",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 2.5),
    lead(12.5, BOT),
    { type: "rect", x: -2, y: 2.5, w: 4, h: 10 },
    { type: "line", x1: -3, y1: 12, x2: 3, y2: 4 }, // косая характеристика
  ],
};

/** Конденсатор (ГОСТ 2.728): две обкладки. */
const C: SymbolDef = {
  id: "gost.c",
  name: "Конденсатор",
  category: "Конденсаторы",
  componentCode: "C",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 6),
    lead(9, BOT),
    { type: "line", x1: -3.5, y1: 6, x2: 3.5, y2: 6 },
    { type: "line", x1: -3.5, y1: 9, x2: 3.5, y2: 9 },
  ],
};

/** Конденсаторная батарея (CB). */
const CB: SymbolDef = {
  id: "gost.cb",
  name: "Конденсаторная батарея",
  category: "Конденсаторы",
  componentCode: "CB",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 6),
    lead(9, BOT),
    { type: "line", x1: -3.5, y1: 6, x2: 3.5, y2: 6 },
    { type: "line", x1: -3.5, y1: 9, x2: 3.5, y2: 9 },
    { type: "line", x1: -3.5, y1: 10.5, x2: 3.5, y2: 10.5 },
  ],
};

/** Дроссель / катушка индуктивности (L): три полудуги. */
const L: SymbolDef = {
  id: "gost.l",
  name: "Дроссель",
  category: "Катушки и реакторы",
  componentCode: "L",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 4),
    lead(11, BOT),
    { type: "arc", cx: 0, cy: 5.5, r: 1.5, a0: -90, a1: 90 },
    { type: "arc", cx: 0, cy: 8, r: 1.5, a0: -90, a1: 90 },
    { type: "arc", cx: 0, cy: 10.5, r: 1.5, a0: -90, a1: 90 },
  ],
};

/** Реактор (LR, ГОСТ 2.723): 3/4 окружности Ø12 с радиусом. */
const LR: SymbolDef = {
  id: "gost.lr",
  name: "Реактор",
  category: "Катушки и реакторы",
  componentCode: "LR",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 1.5),
    { type: "arc", cx: 0, cy: 7.5, r: 6, a0: 60, a1: 360 }, // 3/4 окружности
    { type: "line", x1: 0, y1: 7.5, x2: 3, y2: 12.7 }, // радиус
    lead(13.5, BOT),
  ],
};

/** Диод (VD, ГОСТ 2.730): треугольник + катодная черта. */
const VD: SymbolDef = {
  id: "gost.vd",
  name: "Диод",
  category: "Полупроводники",
  componentCode: "VD",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 5),
    lead(10, BOT),
    { type: "line", x1: -2.5, y1: 5, x2: 2.5, y2: 5 }, // анод
    { type: "line", x1: -2.5, y1: 5, x2: 0, y2: 10 },
    { type: "line", x1: 2.5, y1: 5, x2: 0, y2: 10 },
    { type: "line", x1: -2.5, y1: 10, x2: 2.5, y2: 10 }, // катод (5×5)
  ],
};

/** Тиристор (VS): диод с управляющим электродом. */
const VS: SymbolDef = {
  id: "gost.vs",
  name: "Тиристор",
  category: "Полупроводники",
  componentCode: "VS",
  kind: "component",
  pins: [
    { name: "1", x: 0, y: TOP },
    { name: "2", x: 0, y: BOT },
    { name: "G", x: 5, y: 10 },
  ],
  graphics: [
    lead(TOP, 5),
    lead(10, BOT),
    { type: "line", x1: -2.5, y1: 5, x2: 2.5, y2: 5 },
    { type: "line", x1: -2.5, y1: 5, x2: 0, y2: 10 },
    { type: "line", x1: 2.5, y1: 5, x2: 0, y2: 10 },
    { type: "line", x1: -2.5, y1: 10, x2: 2.5, y2: 10 },
    { type: "line", x1: 2, y1: 10, x2: 5, y2: 10 }, // управляющий электрод
  ],
};

/** Транзистор (VT, ГОСТ 2.730): круг Ø10, база + коллектор/эмиттер. */
const VT: SymbolDef = {
  id: "gost.vt",
  name: "Транзистор",
  category: "Полупроводники",
  componentCode: "VT",
  kind: "component",
  pins: [
    { name: "B", x: -5, y: 5 },
    { name: "C", x: 5, y: TOP },
    { name: "E", x: 5, y: BOT },
  ],
  graphics: [
    { type: "circle", cx: 1, cy: 7.5, r: 5 }, // корпус Ø10
    { type: "line", x1: -5, y1: 5, x2: -1, y2: 5 }, // вывод базы
    { type: "line", x1: -1, y1: 3.5, x2: -1, y2: 11.5 }, // пластина базы
    { type: "line", x1: -1, y1: 5, x2: 5, y2: 0 }, // коллектор
    { type: "line", x1: -1, y1: 10, x2: 5, y2: 15 }, // эмиттер
    { type: "line", x1: 2.6, y1: 12, x2: 4, y2: 12.4 }, // стрелка эмиттера
    { type: "line", x1: 3.6, y1: 11, x2: 4, y2: 12.4 },
  ],
};

/** Преобразователь / выпрямитель (UZ): квадрат с диагональю и знаками ∼/=. */
const UZ: SymbolDef = {
  id: "gost.uz",
  name: "Преобразователь (UZ)",
  category: "Преобразователи",
  componentCode: "UZ",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 2),
    lead(13, BOT),
    { type: "rect", x: -5, y: 2, w: 10, h: 11 },
    { type: "line", x1: 5, y1: 2, x2: -5, y2: 13 }, // диагональ
    { type: "text", x: -2.5, y: 5.5, text: "∼", size: 3, anchor: "middle" },
    { type: "text", x: 2.5, y: 11, text: "=", size: 3, anchor: "middle" },
  ],
};

/** Генератор (G, ГОСТ 2.722): круг Ø10 с буквой G. */
const G: SymbolDef = meterLike("gost.g", "Генератор", "Источники питания", "G", "G");
/** Синхронный компенсатор (GC). */
const GC: SymbolDef = meterLike(
  "gost.gc",
  "Синхронный компенсатор",
  "Источники питания",
  "GC",
  "GC",
);

/** Аккумуляторная батарея (GB, ГОСТ 2.742): чередование длинных/коротких черт. */
const GB: SymbolDef = {
  id: "gost.gb",
  name: "Батарея аккумуляторная",
  category: "Источники питания",
  componentCode: "GB",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 5),
    lead(10, BOT),
    { type: "line", x1: -3, y1: 5, x2: 3, y2: 5 }, // +
    { type: "line", x1: -1.5, y1: 6.5, x2: 1.5, y2: 6.5 }, // −
    { type: "line", x1: -3, y1: 8, x2: 3, y2: 8 },
    { type: "line", x1: -1.5, y1: 9.5, x2: 1.5, y2: 9.5 },
  ],
};

/** Звуковая сигнализация (HA): полукруг (звонок). */
const HA: SymbolDef = {
  id: "gost.ha",
  name: "Звуковая сигнализация",
  category: "Лампы и индикаторы",
  componentCode: "HA",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 4),
    lead(11, BOT),
    { type: "arc", cx: 0, cy: 7.5, r: 4, a0: 180, a1: 360 },
    { type: "line", x1: -4, y1: 7.5, x2: 4, y2: 7.5 },
  ],
};

/** Сигнальное табло (HLA): прямоугольник с диагоналями. */
const HLA: SymbolDef = {
  id: "gost.hla",
  name: "Табло сигнальное",
  category: "Лампы и индикаторы",
  componentCode: "HLA",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 3),
    lead(12, BOT),
    { type: "rect", x: -5, y: 3, w: 10, h: 9 },
    { type: "line", x1: -5, y1: 3, x2: 5, y2: 12 },
    { type: "line", x1: 5, y1: 3, x2: -5, y2: 12 },
  ],
};

/** Лампа осветительная (EL): круг с крестом. */
const EL: SymbolDef = {
  id: "gost.el",
  name: "Лампа осветительная",
  category: "Лампы и индикаторы",
  componentCode: "EL",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 4),
    lead(11, BOT),
    { type: "circle", cx: 0, cy: 7.5, r: 3.5 },
    { type: "line", x1: -2.5, y1: 5, x2: 2.5, y2: 10 },
    { type: "line", x1: -2.5, y1: 10, x2: 2.5, y2: 5 },
  ],
};

/** Трансформатор тока (TA, ГОСТ 2.723): первичная шина сквозь кольцо. */
const TA: SymbolDef = {
  id: "gost.ta",
  name: "Трансформатор тока",
  category: "Трансформаторы",
  componentCode: "TA",
  kind: "component",
  pins: [
    { name: "Л1", x: 0, y: TOP },
    { name: "Л2", x: 0, y: BOT },
    { name: "И1", x: 5, y: 5 },
    { name: "И2", x: 5, y: 10 },
  ],
  graphics: [
    { type: "line", x1: 0, y1: 0, x2: 0, y2: 15 }, // первичная шина сквозь кольцо
    { type: "circle", cx: 0, cy: 7.5, r: 5 }, // магнитопровод Ø10
    { type: "line", x1: 4.33, y1: 5, x2: 5, y2: 5 }, // вторичный вывод И1
    { type: "line", x1: 4.33, y1: 10, x2: 5, y2: 10 }, // вторичный вывод И2
  ],
};

/** Трансформатор напряжения (TV): две обмотки-круга. */
const TV: SymbolDef = {
  id: "gost.tv",
  name: "Трансформатор напряжения",
  category: "Трансформаторы",
  componentCode: "TV",
  kind: "component",
  pins: [
    { name: "A", x: -5, y: 0 },
    { name: "X", x: 5, y: 0 },
    { name: "a", x: -5, y: 20 },
    { name: "x", x: 5, y: 20 },
  ],
  graphics: [
    { type: "circle", cx: 0, cy: 7, r: 5 },
    { type: "circle", cx: 0, cy: 13, r: 5 },
    { type: "line", x1: -5, y1: 0, x2: -2.9, y2: 2.95 },
    { type: "line", x1: 5, y1: 0, x2: 2.9, y2: 2.95 },
    { type: "line", x1: -5, y1: 20, x2: -2.9, y2: 17.05 },
    { type: "line", x1: 5, y1: 20, x2: 2.9, y2: 17.05 },
  ],
};

/** Разрядник / ОПН (FV, ГОСТ 2.727): искровой промежуток в прямоугольнике. */
const FV: SymbolDef = {
  id: "gost.fv",
  name: "Разрядник",
  category: "Предохранители",
  componentCode: "FV",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 3),
    lead(12, BOT),
    { type: "rect", x: -2.5, y: 3, w: 5, h: 9 },
    { type: "line", x1: 0, y1: 3, x2: 0, y2: 6 }, // верхний электрод
    { type: "line", x1: -2, y1: 8, x2: 2, y2: 8 }, // искровой промежуток (стрелка ↓)
    { type: "line", x1: 0, y1: 6, x2: -2, y2: 8 },
    { type: "line", x1: 0, y1: 6, x2: 2, y2: 8 },
  ],
};

/** Штырь разъёма (XP): вилка. */
const XP: SymbolDef = {
  id: "gost.xp",
  name: "Штырь (вилка)",
  category: "Разъёмы",
  componentCode: "XP",
  kind: "connector",
  pins: [{ name: "1", x: 0, y: 0 }],
  graphics: [
    { type: "line", x1: 0, y1: 0, x2: 5, y2: 0 },
    { type: "line", x1: 5, y1: -1.5, x2: 8, y2: 0 }, // острие штыря
    { type: "line", x1: 5, y1: 1.5, x2: 8, y2: 0 },
  ],
};

/** Контактное соединение (X): разъёмное — полая точка. */
const X_CONN: SymbolDef = {
  id: "gost.x",
  name: "Соединение контактное",
  category: "Разъёмы",
  componentCode: "X",
  kind: "connector",
  pins: [
    { name: "1", x: 0, y: 0 },
    { name: "2", x: 0, y: 5 },
  ],
  graphics: [{ type: "circle", cx: 0, cy: 2.5, r: 1.4 }],
};

/** Неразборное соединение (XN): сплошная точка-пайка. */
const XN: SymbolDef = {
  id: "gost.xn",
  name: "Соединение неразборное",
  category: "Разъёмы",
  componentCode: "XN",
  kind: "connector",
  pins: [
    { name: "1", x: 0, y: 0 },
    { name: "2", x: 0, y: 5 },
  ],
  graphics: [
    { type: "circle", cx: 0, cy: 2.5, r: 1 },
    { type: "circle", cx: 0, cy: 2.5, r: 0.4 },
  ],
};

/** Электромагнит (YA, ГОСТ 2.756): прямоугольник привода. */
const YA: SymbolDef = {
  id: "gost.ya",
  name: "Электромагнит",
  category: "Электромагниты",
  componentCode: "YA",
  kind: "component-aux",
  pins: [
    { name: "A1", x: 0, y: TOP },
    { name: "A2", x: 0, y: BOT },
  ],
  graphics: [
    lead(TOP, 4.5),
    lead(10.5, BOT),
    { type: "rect", x: -6, y: 4.5, w: 12, h: 6 },
    { type: "line", x1: -6, y1: 4.5, x2: 6, y2: 10.5 }, // диагональ привода
  ],
};

/** Фильтр (Z): прямоугольник с обозначением. */
const Z: SymbolDef = {
  id: "gost.z",
  name: "Фильтр",
  category: "Фильтры",
  componentCode: "Z",
  kind: "component",
  pins: twoPin,
  graphics: [
    lead(TOP, 2.5),
    lead(12.5, BOT),
    { type: "rect", x: -4, y: 2.5, w: 8, h: 10 },
    { type: "text", x: 0, y: 7.5, text: "Z", size: 4, anchor: "middle" },
  ],
};

/** Встроенная библиотека стартовых УГО (ГОСТ). */
// коды коммутационных аппаратов, у которых контакт «открывается вверх»
const SWITCH_CODES = new Set(["Q", "QF", "QS", "QW", "QK", "QR", "QSG", "SF"]);
// аппараты с заземлением — землю держим снизу, по вертикали не отражаем
const GROUND_BEARING = new Set(["gost.qfd", "gost.qk", "gost.qsg"]);
/** Нужно ли отражать символ по вертикали (контакты/рубильники/автоматы открыты вверх). */
function opensUp(s: SymbolDef): boolean {
  if (GROUND_BEARING.has(s.id)) return false; // земля/тороид снизу — не отражаем
  if (s.kind === "contact-no" || s.kind === "contact-nc" || s.kind === "contact-main") return true;
  return s.kind === "component-aux" && SWITCH_CODES.has(s.componentCode);
}

const RAW_SYMBOLS: SymbolDef[] = [
  ...RELAY_COILS,
  KK,
  ...METERS,
  R,
  RU,
  C,
  CB,
  L,
  LR,
  VD,
  VS,
  VT,
  UZ,
  G,
  GC,
  GB,
  HA,
  HLA,
  EL,
  TA,
  TV,
  FV,
  XP,
  X_CONN,
  XN,
  YA,
  Z,
  SB_NC,
  SA,
  SF,
  SQ_NO,
  SQ_NC,
  SK,
  S_NO_DELAY,
  S_NC_DELAY,
  Q1,
  QW1,
  QK,
  QR,
  QSG,
  QF2,
  QF3,
  QF4,
  QS2,
  QS3,
  QS4,
  QW2,
  QW3,
  QW4,
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
  K_CO,
  KM_MAIN,
];

/**
 * Встроенная библиотека стартовых УГО (ГОСТ). Контакты/рубильники/автоматы
 * отражаются по вертикали (открыты вверх — неподвижный контакт сверху).
 */
export const GOST_SYMBOLS: SymbolDef[] = RAW_SYMBOLS.map((s) =>
  opensUp(s) ? { ...s, graphics: flipY(s.graphics) } : s,
);
