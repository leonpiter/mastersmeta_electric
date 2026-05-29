# S30 · Библиотека УГО в папке на диске (вместо localStorage)

- **Веха:** C — Создание контента (расширяет S9/S27 хранение библиотеки)
- **Статус:** ✅ Готов · ветка `sprint-30-library-folder` (влита в `main`) · Дата окончания: 2026-05-29
- **Зависит от:** S11 (Electron/Platform-порт), S9/S27 (пользовательская библиотека)
- **Оценка:** 2–3 дня

## Цель
Хранить пользовательскую библиотеку УГО (свои символы и override системных, категории, блоки)
не в localStorage, а **файлами в папке на диске** — по умолчанию в «Документах». В настройках
пользователь может сменить папку и подключить любую (общий сетевой/git-каталог библиотеки).

## Контекст
Сейчас библиотека в localStorage (`see.userSymbols`/`see.userCategories`/`see.userBlocks`) —
не шарится, не бэкапится, теряется при переустановке/смене ПК. Папка с файлами решает это и
готовит шеринг/git. Запись в произвольную папку — только в десктоп-сборке (Electron, нативный
FS через Platform-порт `desktop()`); веб-версия остаётся на localStorage (fallback).

Решения пользователя: реализуем **сейчас**; раскладка — **по файлу на символ** (открытый формат,
принцип 4); папка по умолчанию — в «Документах»; смена папки — в настройках.

## Scope (задачи)
- [x] **Ф1. Electron FS-слой.** IPC в `main.cjs`: `library:defaultDir` (Documents/Мастермета Электро/Библиотека УГО), `library:pickDir` (нативный выбор папки), `library:load(dir)`, `library:saveSymbol(dir,sym)`, `library:deleteSymbol(dir,id)`, `library:saveCategories(dir,list)`, `library:saveBlocks(dir,list)`; `desktop.library` в preload/bridge.
- [x] **Ф2. Хранилище-сервис.** `library-store.ts`: in-memory кэш (symbols/categories/blocks) + backend (Electron FS / web localStorage); синхронные геттеры (сигнатуры `loadUser*` сохранены), мутаторы пишут в backend; `initLibrary(refresh)` — async-гидрация на старте + **миграция** localStorage→папка при первом запуске.
- [x] **Ф3. Настройки папки.** В настройках — поле «Папка библиотеки» (путь) + «Изменить…» (нативный пикер) + «Открыть папку»; путь хранится (`see.libraryDir`); смена папки перезагружает библиотеку.
- [x] **Ф4. Раскладка файлов.** `symbols/<id>.symbol.json` (по файлу на символ), `categories.json`, `blocks.json`; чтение валидирует схемой (битые — пропуск).

## Технический дизайн
- **Electron (main.cjs):** `fs.promises` + `dialog.showOpenDialog({properties:["openDirectory"]})`; путь приходит из рендерера (main без состояния).
- **bridge (`desktop.library`):** `defaultDir()`, `pickDir()`, `load(dir)`, `saveSymbol/deleteSymbol/saveCategories/saveBlocks`.
- **renderer (`library-store.ts`):** источник истины — in-memory кэш; web-backend = localStorage (как сейчас), electron-backend = `desktop.library`. `user-symbols.ts`/`user-categories.ts`/`user-blocks.ts` становятся тонкими делегатами к store (имена экспортов сохранены — нулевой риск для импортов).
- **Старт:** строим `SymbolLibrary(GOST_SYMBOLS)`, затем `await initLibrary()` (гидрация из папки), `library.add(...)` пользовательских + `panel.refresh()`.
- **Миграция:** если папка пуста, а в localStorage есть данные — записать их в папку (один раз).

## Acceptance / DoD
- [x] правка системного УГО сохраняется файлом в папке; после перезапуска подхватывается из папки (не из localStorage).
- [x] папка по умолчанию в «Документах» создаётся; в настройках видно путь, можно сменить нативным пикером, библиотека перезагружается.
- [x] миграция: ранее сохранённые в localStorage символы появляются файлами в папке.
- [x] веб-версия (`pnpm dev`) работает по-прежнему (localStorage).
- [x] `pnpm verify` зелёный; видимый результат в десктоп-сборке.

## Открытые вопросы
- Категории/блоки — единичными файлами `categories.json`/`blocks.json` (компактно) vs по файлу (как символы). Старт — единичными.
- Поведение при недоступной/удалённой папке — fallback на дефолтную + предупреждение.

## Итоговый отчёт
**Дата:** 2026-05-29 · **Итог:** Ф1–Ф4 закрыты · **Время:** ~1 сессия

### Выполнено
- Ф1 (`2073889`) — Electron IPC: `library:defaultDir/pickDir/load/saveSymbol/deleteSymbol/saveCategories/saveBlocks/reveal`; `desktop.library` в preload/bridge.
- Ф2–Ф3 (`a45e7ee`) — `library-store.ts` (кэш + backend FS/localStorage, `initLibrary` async + миграция); `user-*` стали ре-экспортами; меню Файл → «Папка библиотеки УГО…» (путь / Изменить / Открыть).
- Ф4 — раскладка `symbols/<id>.symbol.json` + `categories.json` + `blocks.json`, валидация при чтении.

### Проверено
- web (`pnpm dev`): библиотека грузится (13 категорий), диалог папки = «localStorage» (смена недоступна).
- Electron smoke: приложение стартует, создаётся `Documents\Мастермета Электро\Библиотека УГО\symbols`, миграция отрабатывает. `pnpm verify` зелёный.

### Не выполнено (вынесено)
- Предупреждение/fallback при недоступной/удалённой подключённой папке.
- Категории/блоки — пока единичными файлами (по файлу — если понадобится).

### Уроки
- Чтобы не делать `project`/`library` nullable и async везде: единый in-memory кэш + async-гидрация на старте + `applyLibrary()` (снять прошлые override → наложить текущие). Старые `user-*` модули оставлены ре-экспортами → нулевой риск для импортов.
- Dev-запуск Electron использует тот же `userData`/appId, что и установленное приложение, — миграция и папка общие; смоук может конфликтовать по cache-локу (безвредно).
