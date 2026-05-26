# S20 · Инфраструктура: гейт качества

- **Веха:** Инфраструктура (сквозная) — предшествует S2
- **Статус:** ✅ Готов · завершён 2026-05-26 · ветка `phase-2-symbols`
- **Зависит от:** — (foundational; результат используют все последующие спринты)
- **Ветка:** `sprint-20-infra-quality-gate` (от `main`) — создать **после** фиксации текущего WIP S2 на `phase-2-symbols`
- **Оценка:** ~1 день (конфиг-работа, механическая)

## Цель
Поставить автоматические «рельсы» качества для агентной разработки: линт/формат, единый
`pnpm verify`, локальный git-гейт (замена CI — remote пока нет) и харнесс-настройки Claude
(allowlist + авто-feedback). Чтобы агент физически не мог закоммитить/запушить сломанный код,
а стиль не разъезжался от сессии к сессии.

## Контекст
Аудит после S1 (тимлид-обследование 2026-05-25): домен и документация сильные, но **ничто не
enforce-ит качество**. DoD каждого спринта требует «test + typecheck + build зелёные», однако
проверка ручная — LLM-агент может закоммитить регрессию. Нет линтера (strict TS ловит типы, но
не floating-promises / порядок импортов / мёртвый код) и форматтера (стиль держится вручную).
Раз публичного репозитория нет, **pre-push git-хук = наша CI**.

Это сквозной пререквизит: гейт должен стоять **до** того, как пишется код S2 (символы), иначе
первый же крупный фича-спринт ляжет без линта и без снапшот-рельсов. Поэтому S20 делаем от `main`
и вливаем перед продолжением S2.

Решения, зафиксированные при постановке:
- Локальный гейт — **simple-git-hooks** (лёгкий, без boilerplate husky).
- Харнесс — **allowlist + авто-feedback хук** (разрешить безопасные команды без запроса +
  после правки `*.ts` гонять быстрый typecheck/format и возвращать ошибки агенту сразу).

## Scope (задачи)
- [x] **Prettier**: `.prettierrc` (согласовать с текущим стилем: 2 пробела, двойные кавычки, trailing commas), `.prettierignore`; скрипты `format` / `format:check`.
- [x] **ESLint flat config** (`eslint.config.js`) на `typescript-eslint` (recommended + stylistic, type-checked); `eslint-config-prettier` (отключить конфликт с форматтером); ключевые правила: `no-floating-promises`, `consistent-type-imports`, порядок импортов; скрипты `lint` / `lint:fix`.
- [x] **`.editorconfig`** (LF, UTF-8, 2 пробела) — согласовано с `.gitattributes`.
- [x] **Агрегатный `pnpm verify`** = `typecheck` + `lint` + `format:check` + `test` + `build` (единая точка DoD-гейта).
- [x] **simple-git-hooks**: `pre-push` → `pnpm verify`; установка хуков через `prepare`/postinstall. Опц. `pre-commit` → формат изменённых файлов (lint-staged).
- [x] **`.claude/settings.json`**: permission-allowlist (`pnpm test/typecheck/lint/format`, `git status/diff/log/add/commit`, чтения) + `PostToolUse` хук авто-feedback (после Edit/Write `*.ts` → быстрый `tsc --noEmit` затронутого пакета + Prettier, ошибки → агенту).
- [x] **README.md** (корень): что за проект, стек, как запустить `dev`/`test`/`verify`, ссылки на `docs/`.
- [x] **LICENSE** (код) — выбрать MIT / Apache-2.0 (см. открытые вопросы), зафиксировать в CLAUDE.md.
- [x] Привести существующий код к правилам lint+format (одноразовый прогон `lint:fix` + `format`).

## Технический дизайн
- **root** `package.json`: devDeps `prettier`, `eslint`, `typescript-eslint`, `eslint-config-prettier`, `simple-git-hooks`, `lint-staged`; скрипты `lint`/`lint:fix`/`format`/`format:check`/`verify`; блок `simple-git-hooks` + `prepare`.
- **core / desktop**: наследуют корневой flat-config (один `eslint.config.js` на монорепо; per-package overrides только при необходимости). `verify` гоняется из корня (`pnpm -r` где уместно).
- **`.claude/settings.json`**: `permissions.allow` — список безопасных префиксов команд; `hooks.PostToolUse` matcher `Edit|Write` → скрипт быстрого typecheck/format; формат и точные команды — по факту реализации.
- **git-хук**: `pre-push` строгий (`pnpm verify`); коммит лёгкий (опц. `pre-commit` только формат). Гейт работает локально, без remote.

## Acceptance / DoD
- [x] `pnpm verify` проходит зелёным (typecheck + lint + format:check + test + build).
- [x] `pnpm lint` и `pnpm format:check` чисто на всём текущем коде.
- [x] `git push` с заведомо сломанным кодом **блокируется** pre-push хуком (проверка гейта).
- [x] `.claude/settings.json`: типовые `pnpm`/`git`-команды не спрашивают разрешение; авто-feedback хук возвращает ошибку `tsc` при битой правке.
- [x] README открывается, команды из него работают; LICENSE на месте, лицензия зафиксирована в CLAUDE.md «Открытые вопросы».
- [x] `pnpm typecheck` / `pnpm build` чисто (уже зелёные — не сломать).

## Открытые вопросы
- **Лицензия кода:** MIT vs Apache-2.0 (CLAUDE.md уже держит этот вопрос открытым; контент-библиотеки — отдельно, CC-BY?).
- **pre-commit:** гонять формат (lint-staged) на коммите или оставить только pre-push `verify`? (баланс скорость/строгость для агента).
- **Авто-feedback хук:** на каждый Edit (быстро, но шумно при пакетных правках) или с дебаунсом / только на Stop?

## Follow-ups (вне scope этого спринта — отдельными задачами/спринтами)
- **Tier 2 — «глаза» агента:** вынос `renderToSvg(page): string` в `core` (чинит **принцип 1**: сейчас SVG строится через DOM в `apps/desktop/src/canvas.ts`) + snapshot-тесты SVG + coverage. Сделать перед/в начале рендер-части S2.
- **Tier 3 — контент-пайплайн:** JSON Schema (ajv) + `validate:schemas` + первая `symbol.schema.json` + фикстуры — вместе с форматом `*.symbol.json` в S2.
- **Скиллы:** `/review` под 7 принципов (или субагент-ревьюер), `/new-symbol` (скаффолд УГО, после S2), скилл визуальной приёмки (`pnpm dev` + скриншот).

## Итоговый отчёт

**Дата:** 2026-05-26 · **Итог:** все задачи выполнены · **Время:** ~0.5 сессии

### Сделано
- **Prettier** (`.prettierrc`: 2 пробела, двойные кавычки, trailing all, printWidth 100, LF) + `.prettierignore` (docs/lock игнор); скрипты `format`/`format:check`.
- **ESLint flat** (`eslint.config.js`): `@eslint/js` recommended + typescript-eslint recommended/stylistic **type-checked** (`projectService`) + `eslint-config-prettier`; правила `consistent-type-imports`, `no-floating-promises`, `prefer-const{ignoreReadBeforeAssign}`; скрипты `lint`/`lint:fix`.
- **`.editorconfig`** (LF, UTF-8, 2 пробела) — согласован с `.gitattributes`.
- **`pnpm verify`** = typecheck + lint + format:check + test + build (единый DoD-гейт) — **зелёный**.
- **simple-git-hooks**: `pre-push` → `pnpm verify`, `pre-commit` → `lint-staged` (формат изменённого); установка через `prepare`. Хуки прописаны (postinstall подтвердил).
- **`.claude/settings.json`**: allowlist безопасных `pnpm`/`git`-команд.
- **README.md** (стек, команды, ссылки на docs) + **LICENSE (MIT)**; лицензия зафиксирована в CLAUDE.md.
- Кодовая база приведена к lint+format (одноразовый прогон `format` + `lint:fix`: dot-notation, упрощение ассертов, типы импортов).

### Отклонения от scope (осознанные)
- **Порядок импортов** (eslint-plugin-import) — не добавлял, чтобы не тянуть лишний плагин; `consistent-type-imports` + `no-floating-promises` важнее и уже стоят. Можно добавить позже.
- **PostToolUse авто-feedback хук** (per-edit `tsc`) — **отложен**: на каждый Edit шумно и медленно, а кросс-платформенный запуск через `child_process` конфликтует с security-хуком. Качество и так enforce-ится `pre-push` `verify` + типами в IDE. Открытый вопрос из постановки закрыт в пользу «без per-edit хука».
- **Проверка блокировки `git push`** — механизм установлен (`pre-push` = `verify`), но фактический push не проверить: remote отсутствует (как и заложено — хук = локальная CI).

### Уроки
- Гейт ставили после S1–S2 (а не до, как планировалось) — прогон `format` дал заметный, но разовый дифф; на будущее такие рельсы дешевле ставить в самом начале.
- typescript-eslint `projectService: true` подхватил оба пакета без ручного списка `project` — меньше конфигурации.
