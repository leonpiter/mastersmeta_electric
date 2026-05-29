// Главный процесс Electron — нативная оболочка (S11).
// Принцип 7: UI не зависит от оболочки; здесь только окно, авто-обновление и
// открытие внешних ссылок. Файловый I/O пока через браузерные механизмы рендерера
// (download / <input type=file>), нативные диалоги — отдельной задачей.
const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** @type {BrowserWindow | null} */
let win = null;
/** Разрешён ли выход (после подтверждения несохранённых изменений в рендерере). */
let allowClose = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#1f2430",
    frame: false, // без нативной рамки — своя шапка (#titlebar) в рендерере
    title: "Мастермета Электро",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // внешние http(s)-ссылки — в системном браузере; прочее (blob: отчёты) — в новом окне
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  const distIndex = path.join(__dirname, "..", "dist", "index.html");
  if (app.isPackaged) {
    void win.loadFile(distIndex);
  } else if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL); // dev с HMR
  } else if (fs.existsSync(distIndex)) {
    void win.loadFile(distIndex); // локальная проверка собранного рендерера
  } else {
    void win.loadURL("http://localhost:5173");
  }

  // гард несохранённых изменений: перехватываем закрытие, спрашиваем рендерер
  win.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    win?.webContents.send("app:query-close");
  });
  win.on("closed", () => {
    win = null;
  });
}

// авто-обновление: модуль грузим ЛЕНИВО (после ready), иначе он обращается к
// app.getVersion() ещё до инициализации Electron и падает. Слушатели — один раз.
let updater = null;
function getUpdater() {
  if (updater) return updater;
  updater = require("electron-updater").autoUpdater;
  updater.on("update-available", (info) => {
    win?.webContents.send("update:available", info?.version ?? "");
  });
  updater.on("update-not-available", () => {
    win?.webContents.send("update:none", "");
  });
  updater.on("update-downloaded", (info) => {
    win?.webContents.send("update:downloaded", info?.version ?? "");
    if (Notification.isSupported()) {
      new Notification({
        title: "Мастермета Электро",
        body: `Обновление ${info?.version ?? ""} загружено — установится при выходе.`,
      }).show();
    }
  });
  updater.on("error", (err) => {
    win?.webContents.send("update:error", String(err));
  });
  return updater;
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // авто-проверка при старте (только в установленном приложении)
  if (app.isPackaged)
    getUpdater()
      .checkForUpdatesAndNotify()
      .catch((e) => console.error("updater:", e));
});

// ручная проверка обновлений (из окна «О программе»)
ipcMain.handle("update:check", () => {
  if (!app.isPackaged) {
    win?.webContents.send("update:none", "");
    return;
  }
  getUpdater()
    .checkForUpdates()
    .catch((e) => win?.webContents.send("update:error", String(e)));
});

// установить загруженное обновление (закрывает приложение, ставит новую версию)
ipcMain.on("update:install", () => {
  allowClose = true; // в обход гарда несохранённых — пользователь уже подтвердил
  getUpdater().quitAndInstall();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// версия приложения для рендерера (окно «О программе» и т.п.)
ipcMain.handle("app:version", () => app.getVersion());

// рендерер подтвердил выход (несохранённые изменения обработаны) — закрыть окно
ipcMain.on("app:close", () => {
  allowClose = true;
  win?.close();
});

// управление окном из своей шапки (frame: false)
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:toggle-maximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("win:close", () => win?.close());

// нативные файловые диалоги (Сохранить/Открыть) — заменяют браузерные в Electron
ipcMain.handle("file:save", async (_e, { defaultName, content }) => {
  const res = await dialog.showSaveDialog(win ?? undefined, {
    defaultPath: defaultName,
    filters: [{ name: "Схема Мастермета (*.esch)", extensions: ["esch"] }],
  });
  if (res.canceled || !res.filePath) return false;
  await fs.promises.writeFile(res.filePath, content, "utf8");
  return true;
});
ipcMain.handle("file:open", async (_e, { extensions }) => {
  const res = await dialog.showOpenDialog(win ?? undefined, {
    properties: ["openFile"],
    filters: [
      { name: "Схема Мастермета", extensions: extensions ?? ["esch"] },
      { name: "Все файлы", extensions: ["*"] },
    ],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const file = res.filePaths[0];
  const text = await fs.promises.readFile(file, "utf8");
  return { name: path.basename(file), text };
});

// ----- библиотека УГО в папке на диске (S30) -----
const libSymbolsDir = (dir) => path.join(dir, "symbols");
const safeName = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, "_");
const readJson = async (file) => {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch {
    return null;
  }
};

/** Папка библиотеки по умолчанию: …\Documents\Мастермета Электро\Библиотека УГО. */
ipcMain.handle("library:defaultDir", () =>
  path.join(app.getPath("documents"), "Мастермета Электро", "Библиотека УГО"),
);

/** Нативный выбор папки библиотеки. */
ipcMain.handle("library:pickDir", async () => {
  const res = await dialog.showOpenDialog(win ?? undefined, {
    properties: ["openDirectory", "createDirectory"],
  });
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
});

/** Прочитать всю библиотеку из папки (создаёт папку при отсутствии). */
ipcMain.handle("library:load", async (_e, { dir }) => {
  await fs.promises.mkdir(libSymbolsDir(dir), { recursive: true });
  const symbols = [];
  const files = await fs.promises.readdir(libSymbolsDir(dir)).catch(() => []);
  for (const f of files) {
    if (!f.endsWith(".symbol.json")) continue;
    const obj = await readJson(path.join(libSymbolsDir(dir), f));
    if (obj) symbols.push(obj);
  }
  const categories = (await readJson(path.join(dir, "categories.json"))) ?? [];
  const blocks = (await readJson(path.join(dir, "blocks.json"))) ?? [];
  return { symbols, categories, blocks };
});

ipcMain.handle("library:saveSymbol", async (_e, { dir, symbol }) => {
  await fs.promises.mkdir(libSymbolsDir(dir), { recursive: true });
  const file = path.join(libSymbolsDir(dir), `${safeName(symbol.id)}.symbol.json`);
  await fs.promises.writeFile(file, JSON.stringify(symbol, null, 2), "utf8");
});

ipcMain.handle("library:deleteSymbol", async (_e, { dir, id }) => {
  await fs.promises.rm(path.join(libSymbolsDir(dir), `${safeName(id)}.symbol.json`), {
    force: true,
  });
});

ipcMain.handle("library:saveCategories", async (_e, { dir, list }) => {
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "categories.json"), JSON.stringify(list, null, 2));
});

ipcMain.handle("library:saveBlocks", async (_e, { dir, list }) => {
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "blocks.json"), JSON.stringify(list, null, 2));
});

/** Открыть папку библиотеки в проводнике. */
ipcMain.handle("library:reveal", (_e, { dir }) => shell.openPath(dir));
