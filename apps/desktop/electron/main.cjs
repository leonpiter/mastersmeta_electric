// Главный процесс Electron — нативная оболочка (S11).
// Принцип 7: UI не зависит от оболочки; здесь только окно, авто-обновление и
// открытие внешних ссылок. Файловый I/O пока через браузерные механизмы рендерера
// (download / <input type=file>), нативные диалоги — отдельной задачей.
const { app, BrowserWindow, ipcMain, shell, Notification } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** @type {BrowserWindow | null} */
let win = null;

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

  win.on("closed", () => {
    win = null;
  });
}

// авто-обновление: модуль грузим ЛЕНИВО (после ready), иначе он обращается к
// app.getVersion() ещё до инициализации Electron и падает.
function setupAutoUpdates() {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.on("update-available", (info) => {
    win?.webContents.send("update:available", info?.version ?? "");
  });
  autoUpdater.on("update-downloaded", (info) => {
    win?.webContents.send("update:downloaded", info?.version ?? "");
    if (Notification.isSupported()) {
      new Notification({
        title: "Мастермета Электро",
        body: `Обновление ${info?.version ?? ""} загружено — установится при выходе.`,
      }).show();
    }
  });
  autoUpdater.on("error", (err) => {
    win?.webContents.send("update:error", String(err));
  });
  autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error("updater:", e));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  if (app.isPackaged) setupAutoUpdates(); // в dev обновлять нечего
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// версия приложения для рендерера (окно «О программе» и т.п.)
ipcMain.handle("app:version", () => app.getVersion());

// управление окном из своей шапки (frame: false)
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:toggle-maximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("win:close", () => win?.close());
