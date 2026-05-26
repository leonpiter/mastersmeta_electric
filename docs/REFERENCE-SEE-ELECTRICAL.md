# Референс: See Electrical → наш дизайн

Разбор UX/механизмов See Electrical (установлен локально у пользователя) и их перенос в наш проект.
Эмулируем поведение и компоновку. НЕ копируем ассеты/иконки/код.

## Каркас UI (эмулируем 1:1)

- **Слева — Workspace**: дерево проекта. Низ панели — переключатель: **Workspace / Components / Commands**.
- **Центр — канвас** с вкладками листов (`Titov: 0001`, `Titov: 0002`).
- **Справа — Symbols**: библиотека УГО, поле **Filter**, дерево категорий, **Favorites**.

## Структура проекта (дерево Workspace)

```
Project
├─ Project cover sheet      титульный лист
├─ Circuit Diagrams IEC     принципиальные схемы (листы 0000…0013)
├─ Building Installation    монтаж/план
├─ Cabinets                 компоновка шкафов
├─ Distribution Diagrams    распределительные (однолинейные)
├─ 3D Panel                 3D-компоновка
├─ Graphical lists          ОТЧЁТЫ как листы-чертежи (!)
└─ Database                 база компонентов
```
→ Модель: `Project → Document[] (типы) → Page[]`, общая база компонентов. Отчёты = генерируемые листы со штампом.

## Две базы (ключевое)

| Панель | Содержимое | Пример |
|---|---|---|
| **Symbols** (справа) | Графические УГО | «Disyuntor 1P», «Relay coil» |
| **Components** (слева, вкладка) | Каталог изделий по производителям | ABB → Auxiliary Contactors → 201080 |

Производители в каталоге: ABB, AEG, Allen-Bradley, EAO, Eaton, Festo, GE, Gould, Hoffman, IFM,
IGE+XAO, Legrand, Murrelektronik, Omron, Panduit, Phoenix Contact, Schneider Electric, Siemens,
Socomec, Transfab, WAGO, Weidmüller.

### Master/slave (главный/подчинённый)

`ABB 201080` (контактор) разложен на функциональные блоки:
```
201080  (1 строка в спецификации)
 ├─ A1,A2   катушка (master)
 ├─ 13,14   контакт (slave)
 ├─ 23,24 · 33,34 · 43,44
```
Одно устройство = N графических символов на разных листах + кросс-референсы. См. `ARCHITECTURE.md` (Device/SymbolInstance).

## Диалог Component Properties (поля → наш `props`)

Из снимков (Relay Coil K1 / Component S2 / Terminal X2):
- **Product (-)** — позобозначение (`K1`, `S2`, `X2`). Кнопка **Db** = выбор из базы.
- **Description 00** — описание/номинал (`DC12V`).
- **Component in List** — `in all lists` (включать в отчёты).
- **Type** — тип/каталожный (выбор из Db), Show/Hide.
- **Connection 00 / 01** — имена выводов (`1`, `2`).
- **ComponentCode** — буквенный код (`K`, `S`).
- **Name locked** — `According settings` (автонумерация позобозначений).
- Чекбоксы: Show component / connection / **slave** / type information.

**Терминал** (X2) — отдельные поля: **Terminal Number**, **Terminal Sorting**, **Symbol for graphic**.
→ `Terminal` — спец-сущность.

## Лента → каталог skills для LLM

| Вкладка | Команды | Наш слой |
|---|---|---|
| **Electrical** ⭐ | Potential(Top/Bottom/Cursor), Orthogonal Wiring, 1/3 Wires, **Auto Connection**, rubberband, **Numbers**, Cable, Multicore, **Function/Location Box**, Swap/Rearrange/Define Signal Number | Связность + автонумерация (Фаза 3) |
| **Draw** | Line, Rectangle, Circle, Arc, Multiline, Dimension, Guide Line | Примитивы |
| **Edit** | Block/Explode/Add to Block, Move/Copy/Rotate/Mirror/Scale, Align, Break/Trim/Join/Extend | Редактирование + редактор блоков (Фаза 5) |
| **Functions** | Database, Component Add/Properties, Pick List | Привязка к каталогу (Фаза 4) |
| **Extensions** | Drawing2PDF, Workspace2PDF, DBListsToExcel, PLCImport | Генераторы/экспорт (Фаза 4) |
| **General** | Select, Clipboard, Undo/Redo, Find&Replace | Command-стек |
| **View** | Grid, Snap to elements, Layer Manager, Component Descriptions/Types (All/Normal/None) | Канвас-сервисы |

Группа **Potential** доказывает: See Electrical мыслит потенциалами → подтверждает наш `Net`.

## Контекстное меню + горячие клавиши (эмулируем)

Paste(Ctrl+V) · Potential▶ · Wire(s)▶ · Cable · Complete · Component properties ·
Select(Esc) · Select Single Element(F6) · Select Component(F7) ·
Text New(Ctrl+T) · Text Edit(Ctrl+E) · Zoom Original(F3) · Zoom Window(F4) · Zoom Pan · Refresh(F5) ·
Page Properties · Page Information.

## Сам лист (механизмы)

- **Зонная сетка**: колонки 1–8 (верх), строки A–F (бок) — координаты кросс-референсов.
- **Кросс-референсы между листами**: метки `A0 →3.1`, `A1 →3.1` (потенциал → лист 3, цепь 1).
- **Силовые шины** сверху (A0/A1) и снизу (N/PE).
- **Штамп кастомный** (OVKlife, IEC-стиль) → штамп шаблонный, не захардкоженный.
- Класс схемы — щит ОВК/котельной (скважинный насос, греющие кабели, водоподготовка, ввод ИБП/ВРУ, резерв генератора).

## Уроки из tutorial (SEE Electrical FREE V8R2)

### Форматы файлов
| See Electrical | Содержимое | Наш аналог |
|---|---|---|
| `.SEP` | Workspace (проект) + шаблоны | `.esch` / `project.json` |
| `.SES` | База символов (УГО) | `*.symbol.json` |
| `TYPES.SES` | База типов/изделий | `*.part.json` (каталог) |
| `.TDW` | Шаблон листа | Шаблон листа (формат+штамп+зоны) |
| `.DAT` / `.SLS` | Шрифты / этикетки | — (позже) |

### Ключевые механики (эмулируем)
- **Wire ≠ Line**: провод = электрическая связь; линия = графика. Вставка символа на провод его разрезает и подключает.
- **3 Wires / 1 Wire** (Ctrl+3 / Ctrl+1): 3-фазная связь одним движением (L2/L3 авто).
- **Потенциалы** L1/L2/L3 (верх), N/PE (низ); Left/Right (F11/F12). Все провода — непрерывные.
- **Master/slave по имени**: контакт = то же `Product (-)`, что катушка + выводы (A1/A2, NO 13/14, NC 21/22). Авто **contact cross**.
- **Нумерация**: сквозная или по номеру листа (`1CB1`). **Page Index** (`1a`) — вставка без перенумерации.
- **Type/Description**: Type ссылается на TYPES.SES (в Free — просто текст).
- **Block → Component**: выделил графику → Block → префикс имени = свой компонент. Explode для правки.
- **Cable**: `W1`, пересекает провода, жилы (No./Colour/Size); цвета/сечения из type-базы.

### Шаблон workspace задаёт
Стандарт (IEC/IEEE) · схему нумерации · формат листа (A3/B-size) · число зон.

### Платные фичи (= наш roadmap)
Кастомные символы · кастомные шаблоны · **иерархия Function/Location (=/+)** · PLC · шкафы (3D) ·
планы зданий · перевод · кастомные списки (отчёты) · **auto-diagramming из Excel** (≈ наша LLM-генерация).

## Уроки из польской «Pierwsze kroki» (Standard/Advanced)

Эта редакция покрывает то, чего нет во Free-tutorial: каталог изделий, генерацию отчётов, компоновку шкафов.

### 4 эксплорера (левая панель)
Projekt · Symbole (УГО, напр. «Norma EN60617» = IEC) · **Symbole wg kodu** (каталог: производитель→группа→изделие; вставка авто-добавляет код) · Polecenia (команды только на английском).

### Модули проекта (типы документов)
Schematy zasadnicze (принципиальные) · Instalacje (монтаж) · **Zabudowa aparatury** (шкафы) · **Baza techniczna** («живые» списки) · **Zestawienia** (генерируемые отчёты).

### Каталог (Kody katalogowe)
- Уникальный **Kod katalogowy** на изделие; каталоги расширяемые (Przetwarzanie > Kody katalogowe > Katalog aparatów).
- **Несколько кодов** на один аппарат — через `;` (база + доп. контакты).
- Код задаёт **конфигурацию контактов** → contact cross заменяется реальной графикой контактов из каталога.
- Master-символы (катушки, выключатели, двигатели) **нумеруются автоматически**.

### Отчёты (Zestawienia) — решает наш открытый вопрос (типы)
Перечень аппаратуры · перечень зажимов/клемм · каналы PLC · жилы кабелей · кабели · документы.
Графические: план клеммника (**Matrix**), кабели, аппаратура. Шаблоны — `.tdw` + **Crystal Reports**.
Списки «живые» (модуль *Baza techniczna*) или генерируемые (right-click → Generuj). Копируются в Excel (Ctrl+C/V).

### Сетка
Выводы символов — на шаге **5 мм**; графику можно рисовать в шаге 1 мм при «опорной сетке» 5 мм. Начало координат (0,0) — левый нижний угол.

### Модуль шкафов (Zabudowa aparatury)
- Масштаб **1:10** (или 1:5), A3; масштабируются только рисуемые объекты (рейки, кабель-каналы, символы).
- Элементы: **Szafa** (шкаф, Dx×Dy + код), **Korytko kablowe** (кабель-канал), **Szyna montażowa** (рейка 35 мм).
- **«Lista symboli do wstawienia»** — все символы из схем; ставишь в шкаф → исчезает из списка (удалил → вернулся). Связь схема↔шкаф через один `Device`.
- Footprint-габариты — из каталога (Szerokość/Wysokość) или назначенного «Symbol zabudowy».
- Символы на рейке цепляются к ней (двигаются вместе); F7 — отцепить. Размеры: Rysuj > Wymiar.

## Уроки из итальянского V7 (полный getting-started)

Самый полный из трёх мануалов (127 стр.): покрывает редактор символов, штампа, листы шкафа, планировки.

### Создание символа (гл.12)
Рисуешь Line/Rect/Circle/Arc/Ellipse/Polygon → Crea blocco (Ctrl+G) → выбираешь **поведение**: Bobina / Componente / Componente con contatti aus. / Contatto NA/NC. Сохраняешь в «Simboli Utente». Можно импортировать из DWG/DXF.
- **Black box**: прямоугольник на проводах → Crea blocco → «Black box» → префикс сиглы → кликаешь линии-выводы. Электрический символ без особой графики.
- **Атрибуты символа**: Esplodi → Nuovo testo → тип атрибута (напр. «Componente/Altezza»); видимость через «Mostra».

### Автонумерация проводов (гл.5)
Connessioni > Numeri > Genera. Тип (все / *Comando*=управление). Блокировка провода (двойной клик → Blocco filo). Провод нумеруется только между двумя символами. Ручной номер — поле Potenziale.

### Спецификация и отчёты (гл.6)
Progetto > Liste grafiche → right-click список → Genera → листы (foglio 0001…). Включает все компоненты. Фильтр — через Database-вид (wildcard `*`/`?`). **Индекс проекта** — из атрибута листа *Titolo*. **Excel**: DBListsToExcel/FromExcel — правишь коды (через `;`), импорт обновляет компоненты.

### Клеммники (гл.7)
Семейства X верт./гориз. (верт. клемму — на верт. провод!). Sigla = «Клеммник–Клемма», Numero + Ordinamento. **Wire2Terminal** — присвоить клемме номер провода. Генерация: табличная / графическая (Advanced) / многоуровневая-3D.

### Разъёмы (гл.8)
Разъём = компонент с пинами: Sigla + Nome pin + Pin id; пины из каталога. Отчёты «Connettori» / «Pin connettori».

### Штамп / шаблон листа (гл.10)
Cartiglio = «Foglio modello». Правка: Esplodi blocco → тексты/лого (Inserisci/Immagine) → Blocca → Salva come Foglio modello. **Атрибуты: проектные vs листовые.** Шрифт Arial (совместимость с DWG). Параметры листа: размеры мм, **число колонок (зоны)**, позиции верх/низ потенциалов, отступы, расстояние до contact mirror, авто-связь 25 мм.

### Лист шкафа (гл.13)
В каталоге кода — габариты **X/Y/Z + «Simbolo Quadro»**. Foglio quadro в масштабе (1:4 для 600×800 на A3). Рисуешь Quadro / Canalina (канал) / Guida (рейка). **Lista di selezione** — компоненты схемы (вставил → исчез). Индекс-таблица материалов. **512 слоёв**.

### Планировки (гл.11)
Модуль Installazione: импорт DWG/DXF/DXB, масштаб 1:50, стены/двери/окна, символы ориентируются по стенам, высота над полом, **авто-расчёт длины кабеля**.

## Чего ещё не видели (TODO)

- Точная вёрстка отчётов: механика полностью известна; остаётся ГОСТ-оформление колонок перечня — по скриншоту конкретного отчёта.
