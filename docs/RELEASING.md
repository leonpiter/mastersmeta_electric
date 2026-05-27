# Сборка и выпуск обновлений (Мастермета Электро)

Десктоп-приложение — **Electron**; авто-обновление — через **GitHub Releases**
(`leonpiter/mastersmeta_electric`). Принцип 7: UI не зависит от оболочки, нативный слой —
в `apps/desktop/electron/` (главный процесс + preload), упаковка — `electron-builder.yml`.

## Как это работает

- В установленном приложении при старте `autoUpdater.checkForUpdatesAndNotify()` опрашивает
  **последний опубликованный** релиз репозитория, сравнивает версию (semver из `package.json`),
  при наличии новой — фоном скачивает и **устанавливает при выходе** (нативное уведомление).
- Проверка целостности — по `latest.yml` (sha512), подпись кода не требуется (Windows).

## Разовая настройка (уже сделано)

- Репозиторий `leonpiter/mastersmeta_electric`, фид публикации задан в `electron-builder.yml`.
- CI `.github/workflows/release.yml` собирает на `windows-latest` по тегу `v*`.
- `.npmrc` → `node-linker=hoisted` (надёжная упаковка prod-зависимостей в pnpm-монорепо).

## Выпуск новой версии (обычный путь — через CI)

1. Поднять версию приложения:
   ```bash
   # отредактировать "version" в apps/desktop/package.json (например 0.1.0 → 0.1.1)
   git commit -am "release: v0.1.1"
   ```
2. Поставить тег и запушить:
   ```bash
   git tag v0.1.1
   git push origin main --tags
   ```
3. GitHub Actions соберёт инсталлятор и зальёт в **черновик релиза** `v0.1.1`
   (`MastermetaElectro-Setup-0.1.1.exe` + `latest.yml`).
4. На GitHub → **Releases** → открыть черновик, добавить описание и нажать **Publish release**.
   После публикации установленные приложения увидят обновление при следующем запуске.

> Тег `v1.2.3` и `version` в `package.json` должны совпадать по номеру.

## Локальная сборка инсталлятора (без публикации)

```bash
pnpm --filter @see/desktop run dist
# → apps/desktop/release/MastermetaElectro-Setup-<version>.exe
```

Локальная публикация вручную (нужен токен с правом `repo`):

```bash
# PowerShell:  $env:GH_TOKEN = "ghp_..."
pnpm --filter @see/desktop run dist:publish
```

## Запуск оболочки локально (для проверки)

```bash
pnpm --filter @see/desktop run build       # собрать рендерер в dist/
pnpm --filter @see/desktop run electron     # открыть в окне Electron (грузит dist/)
```

UI-разработка по-прежнему удобнее в браузере: `pnpm dev`.

## На будущее (вне текущего объёма)

- Нативные диалоги «Сохранить/Открыть `.esch`» через Platform-порт (сейчас — браузерные
  download / `<input type=file>`, работают и в Electron).
- Иконка приложения (`build/icon.ico`), подпись кода (убрать предупреждение SmartScreen),
  сборки под macOS/Linux.
