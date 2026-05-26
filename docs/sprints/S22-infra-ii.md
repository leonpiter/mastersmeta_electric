# S22 · Инфраструктура II — гейт-хуки, headless-рендер, ajv, coverage, CI

- **Веха:** Инфраструктура (сквозная) — продолжение S20
- **Статус:** 🚧 В работе (Блок A — гейт/хуки готов; B/C/D — позже) · ветка `phase-2-symbols`
- **Зависит от:** S20 (гейт качества). Блок B пересекается с S21 по `canvas.ts` — см. секвенс.
- **Ветка:** `sprint-22-infra-ii` (от `main`) — создать **после** фиксации текущего WIP (connectivity) и согласования с S21
- **Оценка:** ~2–3 дня

## Цель
Сделать гейт качества из S20 **реально срабатывающим локально**: перенести основную проверку на
событие конца хода агента (Stop), вернуть авто-feedback правильно (батчем), и погасить топ-долги —
headless-рендер в `core` (принцип 1) + snapshot-тесты, ajv-валидация символов, coverage, дормантный CI.

## Контекст
Аудит 2026-05-26 после S20/S21. Гейт S20 готов на 12/13, но вскрылись структурные пробелы:

1. **Строгий гейт не срабатывает.** Remote нет → `git push` не делается → хук `pre-push → pnpm verify`
   (единственное место полной проверки) **мёртв**. Автоматически бежит только `pre-commit`
   (`prettier --write` по staged) — битые типы/тесты/билд коммитятся свободно.
2. **Авто-feedback хук (PostToolUse) отложен в S20** — агент не получает сигнала после правок
   (причина отказа: per-edit `tsc` шумный/медленный + кросс-платформенный `child_process` конфликт).
3. **Нарушение принципа 1:** SVG-рендер DOM-завязан в `apps/desktop/src/symbol-render.ts` + `canvas.ts`;
   в `core` нет headless `renderToSvg`; snapshot-тестов рендера 0 (принцип 6 — «тесты = глаза агента»).
   `symbol.ts:7` уже предусматривает вынос: «рендер … позже `core/render`».
4. `validateSymbol()` — слабая ручная проверка, хотя JSON Schema уже лежит
   (`packages/core/schemas/symbol.schema.json`); `*.symbol.json` на диске пока нет (символы в `symbols-gost.ts`).
5. Нет coverage-отчёта; нет CI-файла (remote нет, но workflow можно положить дормантным — backstop под мёртвый pre-push).

**Решения (согласованы):** Stop-гейт = `typecheck` + `lint` + `test` (блок.; `build` вне — медленный);
полный объём (хуки/гейт + P1 рендер + P2 ajv + P3 coverage + P6 CI + дешёвые бонусы).

## Стадии гейта (fast → slow)
| Стадия | Когда | Что бежит | Почему здесь |
|---|---|---|---|
| **PostToolUse** | каждый Edit/Write | `prettier --write` по 1 файлу | формат — не «гейт»; дёшево; убирает причину `format:check`-падений |
| **Stop** ⭐ | конец хода агента | **`typecheck` + `lint` + `test`** (блок.) | главный повторяющийся гейт; **замена мёртвому pre-push**; нельзя обойти `--no-verify` |
| **pre-commit** | `git commit` | `lint-staged` + `pnpm typecheck` | дешёвый ценный отлов; тесты/билд НЕ тут (иначе агент байпасит) |
| **pre-push** | `git push` | `pnpm verify` | оставить на день remote; задокументировать, что сейчас не срабатывает |
| **`pnpm verify`** | `/sprint-finalize`, вручную | полный + **build** | авторитетный зелёный свет спринта |

## Scope (задачи)

### Блок A — Гейт и хуки (не трогает `canvas.ts` — первым) ✅ (кроме import-sort/.vscode)
- [x] `scripts/hooks/format-edited.mjs` (PostToolUse): stdin-JSON → `tool_input.file_path` → Prettier **Node API** (без spawn, кросс-платформенно) для `{.ts,.tsx,.js,.mjs,.json,.css,.html}`; **всегда exit 0**.
- [x] `scripts/hooks/turn-gate.mjs` (Stop): анти-реентранси по `stop_hook_active`; `typecheck`→`lint`→`test` (`shell:true`, статичные команды — без интерполяции путей); падение → ~100 строк stderr + **exit 2**; **fail-open** (`error`/`status 127`/таймаут 120с); escape `SEE_SKIP_TURN_GATE=1`. Протестирован (ловит реальный lint-fail).
- [x] `scripts/hooks/commit-msg.mjs`: Conventional Commits, пропуск `Merge|Revert|fixup!|squash!`.
- [x] `.claude/settings.json`: `"hooks"` — `PostToolUse` (matcher `Edit|Write|MultiEdit`) и `Stop`.
- [x] root `package.json`: `commit-msg`; `pre-commit` = `lint-staged && pnpm typecheck`; `lint-staged` = `eslint --fix` + `prettier` (для `.ts`). Хуки переустановлены.
- [x] `eslint.config.js`: `no-restricted-globals` (`document`/`window`) для `packages/core/**` — страж принципа 1. `scripts/**` исключены из линта.
- [ ] `eslint-plugin-simple-import-sort` (import-order) — **отложено** (переупорядочит все импорты = большой дифф; отдельной задачей).
- [x] `/sprint-finalize` (скилл): шаг «прогнать `pnpm verify`, отказать при красном».
- [ ] `.vscode/extensions.json` + `settings.json` (format-on-save) — **пропущено** (по решению пользователя).

### Блок B — Headless-рендер (P1; ⚠️ конфликт с S21 по `canvas.ts`)
- [ ] `packages/core/src/render.ts`: `renderSymbolToSvg(def, opts): string` — чистые SVG-строки, ноль DOM (перенос switch по `GraphicPrimitive` из `symbol-render.ts`). Опц. `renderSheetToSvg(page)`.
- [ ] реэкспорт из `index.ts`.
- [ ] `apps/desktop/src/symbol-render.ts` + `canvas.ts` → тонкие DOM-адаптеры поверх строк `core`.
- [ ] `render.test.ts`: `toMatchInlineSnapshot` на каждый ГОСТ-символ **с учётом трансформа** (rotate/mirror).

### Блок C — Валидация схемой (P2)
- [ ] `ajv` в `@see/core`.
- [ ] `validateSymbol()` подпереть скомпилированной `schemas/symbol.schema.json` (тот же тип возврата `SymbolValidation`).
- [ ] тест: все ГОСТ-символы валидны + 1 негативная фикстура.

### Блок D — Coverage + CI (P3, P6)
- [ ] `@vitest/coverage-v8`; `vitest run --coverage`; нижний порог (~60% линий, подтягивать); вшить в `verify`.
- [ ] `.github/workflows/ci.yml` (дормантный): `pnpm install --frozen-lockfile` + `pnpm verify`.

## Технический дизайн
- Хуки — через `node scripts/hooks/*.mjs` (shell-agnostic; Windows/PS7 + bash + CI одинаково). Никаких шелл-специфичных команд в settings.json/git-хуках; путь файла НЕ интерполируется в строку шелла (пробелы в `d:\Projects\…` ломают — это и подкосило прошлую попытку S20).
- Stop-хук блокирует через exit 2 (Claude Code вернёт stderr как причину) — батч вместо per-edit убирает «шум».
- `core/render.ts` — источник истины SVG; `apps/desktop` — только DOM-адаптер (принцип 1).
- ajv: вызовы `validateSymbol` в `library-panel.ts`/`main.ts` не трогаем (сохранить сигнатуру).

## Acceptance / DoD
- [ ] `pnpm verify` зелёный (typecheck+lint+format+test+build), порог coverage enforce-ится.
- [ ] **Stop-гейт:** заведомая type-ошибка блокирует завершение хода (ошибка возвращается агенту); починка разблокирует; `SEE_SKIP_TURN_GATE=1` обходит.
- [ ] **PostToolUse:** криво отформатированный `.ts` авто-форматируется после правки.
- [ ] **commit-msg:** `git commit -m "bad"` отклонён; `feat(x): ok` принят.
- [ ] **render (B):** snapshot-тесты проходят; в `pnpm dev` канвас рисует символы как раньше (визуальная приёмка).
- [ ] **ajv (C):** все ГОСТ-символы валидны; негативная фикстура отклонена.
- [ ] ESLint-страж: `document`/`window` в `packages/core/**` — ошибка линта.
- [ ] документы (SPRINTS/ROADMAP) обновлены.

## Открытые вопросы
- Секвенс блока B vs S21: B правит `canvas.ts`/`symbol-render.ts`, которые S21 активно меняет → конфликты. Рекомендация: A+C+D сделать и влить первыми, B — после фиксации UI-работы S21.
- Порог coverage стартовый (60%? выше?) и стоит ли отдельный порог на `core` vs `desktop`.
- pre-commit: добавлять ли `pnpm test` (700мс) или оставить только typecheck (тесты уже в Stop-гейте).

## Секвенс и ветка (⚠️ S21 в работе, есть незакоммиченный WIP)
1. Закоммитить/`stash` текущий WIP (`connectivity.ts`/`.test.ts` + правки `model/commands/symbol/index`); решить судьбу `connectivity` (экспорт в `index.ts` или ветка S3).
2. Ветка `sprint-22-infra-ii` от `main`.
3. **Блок A + C + D** (не трогают `canvas.ts`) → `pnpm verify` зелёный → влить в `main`.
4. **Блок B (P1)** — после того, как UI-работа S21 по `canvas.ts` устаканилась.

## Вне объёма (на потом)
- Правка проводов: выделение/удаление провода, двойной клик (участок→участок) → модалка сечение/тип/цвет → **S3/S4** (отмечено пользователем «позже»).
- P7 — покрытие canvas/панелей: вытаскивать чистую логику (hit-test, snap, трансформы) в `core` headless (начинается с P1), а не browser-харнесс.

## Итоговый отчёт
<!-- заполняется /sprint-finalize -->
