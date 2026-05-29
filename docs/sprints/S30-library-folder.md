# S30 · Библиотека УГО в папке на диске (вместо localStorage)

- **Веха:** C — Создание контента (расширяет S9/S27 хранение библиотеки)
- **Статус:** 🚧 В работе · ветка `sprint-30-library-folder`
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
- [ ] **Ф1. Electron FS-слой.** IPC в `main.cjs`: `library:defaultDir` (Documents/Мастермета Электро/Библиотека УГО), `library:pickDir` (нативный выбор папки), `library:load(dir)`, `library:saveSymbol(dir,sym)`, `library:deleteSymbol(dir,id)`, `library:saveCategories(dir,list)`, `library:saveBlocks(dir,list)`; `desktop.library` в preload/bridge.
- [ ] **Ф2. Хранилище-сервис.** `library-store.ts`: in-memory кэш (symbols/categories/blocks) + backend (Electron FS / web localStorage); синхронные геттеры (сигнатуры `loadUser*` сохранены), мутаторы пишут в backend; `initLibrary(refresh)` — async-гидрация на старте + **миграция** localStorage→папка при первом запуске.
- [ ] **Ф3. Настройки папки.** В настройках — поле «Папка библиотеки» (путь) + «Изменить…» (нативный пикер) + «Открыть папку»; путь хранится (`see.libraryDir`); смена папки перезагружает библиотеку.
- [ ] **Ф4. Раскладка файлов.** `symbols/<id>.symbol.json` (по файлу на символ), `categories.json`, `blocks.json`; чтение валидирует схемой (битые — пропуск).

## Технический дизайн
- **Electron (main.cjs):** `fs.promises` + `dialog.showOpenDialog({properties:["openDirectory"]})`; путь приходит из рендерера (main без состояния).
- **bridge (`desktop.library`):** `defaultDir()`, `pickDir()`, `load(dir)`, `saveSymbol/deleteSymbol/saveCategories/saveBlocks`.
- **renderer (`library-store.ts`):** источник истины — in-memory кэш; web-backend = localStorage (как сейчас), electron-backend = `desktop.library`. `user-symbols.ts`/`user-categories.ts`/`user-blocks.ts` становятся тонкими делегатами к store (имена экспортов сохранены — нулевой риск для импортов).
- **Старт:** строим `SymbolLibrary(GOST_SYMBOLS)`, затем `await initLibrary()` (гидрация из папки), `library.add(...)` пользовательских + `panel.refresh()`.
- **Миграция:** если папка пуста, а в localStorage есть данные — записать их в папку (один раз).

## Acceptance / DoD
- [ ] правка системного УГО сохраняется файлом в папке; после перезапуска подхватывается из папки (не из localStorage).
- [ ] папка по умолчанию в «Документах» создаётся; в настройках видно путь, можно сменить нативным пикером, библиотека перезагружается.
- [ ] миграция: ранее сохранённые в localStorage символы появляются файлами в папке.
- [ ] веб-версия (`pnpm dev`) работает по-прежнему (localStorage).
- [ ] `pnpm verify` зелёный; видимый результат в десктоп-сборке.

## Открытые вопросы
- Категории/блоки — единичными файлами `categories.json`/`blocks.json` (компактно) vs по файлу (как символы). Старт — единичными.
- Поведение при недоступной/удалённой папке — fallback на дефолтную + предупреждение.

## Итоговый отчёт
<!-- заполняется /sprint-finalize -->
