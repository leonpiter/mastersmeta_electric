# S0 · Каркас монорепо

- **Веха:** A — Редактор схем
- **Статус:** ✅ готов (коммит `b0f5685` на `main`)
- **Зависит от:** —

## Цель
Рабочий каркас: монорепо, headless-ядро, интерактивный SVG-канвас, undo/redo.

## Сделано
- pnpm-монорепо: `packages/core` (без UI) + `apps/desktop` (Vite + TS + SVG).
- `core`: единицы (мм), uuid, geometry+snap, `CommandStack` (undo/redo), модель `Page/SchematicNode`.
- `desktop`: канвас pan/zoom (зум к курсору), адаптивная сетка, привязка, постановка узлов, тулбар + Ctrl+Z/Y.
- 8 юнит-тестов (vitest), строгий TS, сборка Vite.

## DoD (выполнено)
- [x] вид двигается, точки липнут к сетке, undo/redo работает
- [x] `pnpm test` / `typecheck` / `build` зелёные
