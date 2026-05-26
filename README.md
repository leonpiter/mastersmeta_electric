# See Electrical lite

Офлайн десктоп-редактор **принципиальных** и **однолинейных** электрических схем щитов —
упрощённая, ГОСТ-ориентированная альтернатива See Electrical / AutoCAD Electrical.
Разработка полностью агентная (Claude Code).

## Стек

- **TypeScript**, монорепо (pnpm workspaces).
- `packages/core` — чистое ядро (домен, связность, рендер в SVG, генераторы), **без UI**; работает в Node и в браузере.
- `apps/desktop` — web-UI (SVG-канвас) на Vite; нативная оболочка (Tauri/Electron) выбирается позже.

## Требования

- Node 20+, pnpm 9+

## Команды

```bash
pnpm install        # установка зависимостей
pnpm dev            # запустить десктоп-UI (Vite dev-сервер)
pnpm test           # юнит-тесты ядра (vitest)
pnpm typecheck      # проверка типов (tsc --noEmit, все пакеты)
pnpm lint           # ESLint (typescript-eslint, type-checked)
pnpm format         # Prettier — записать форматирование
pnpm verify         # полный гейт качества: typecheck + lint + format:check + test + build
pnpm build          # production-сборка десктоп-UI
```

**Гейт качества:** git-хук `pre-push` запускает `pnpm verify` — сломанный код не уедет в ветку
(локальная замена CI, см. спринт S20). `pre-commit` форматирует изменённые файлы (lint-staged).

## Документация

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — доменная модель (3 слоя), движок связности, форматы файлов.
- [docs/ROADMAP.md](docs/ROADMAP.md) — фазы с критериями готовности.
- [docs/SPRINTS.md](docs/SPRINTS.md) — индекс спринтов.
- [docs/UI-RIBBON.md](docs/UI-RIBBON.md) — карта функционала верхнего меню (ленты) по вкладкам.
- [docs/REFERENCE-SEE-ELECTRICAL.md](docs/REFERENCE-SEE-ELECTRICAL.md) — разбор UX See Electrical → наш дизайн.

## Лицензия

Код — [MIT](LICENSE). Контент-библиотеки (УГО, каталоги) — лицензируются отдельно (предположительно CC-BY).
