// Preload — безопасный мост рендерер↔главный процесс (contextIsolation).
// Минимальный API: признак Electron, версия, подписка на события обновления.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  version: () => ipcRenderer.invoke("app:version"),
  // управление окном (своя шапка вместо нативной рамки)
  win: {
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
    close: () => ipcRenderer.send("win:close"),
  },
  // нативные файловые диалоги
  fs: {
    save: (defaultName, content) => ipcRenderer.invoke("file:save", { defaultName, content }),
    open: (extensions) => ipcRenderer.invoke("file:open", { extensions }),
  },
  // библиотека УГО в папке на диске (S30)
  library: {
    defaultDir: () => ipcRenderer.invoke("library:defaultDir"),
    pickDir: () => ipcRenderer.invoke("library:pickDir"),
    load: (dir) => ipcRenderer.invoke("library:load", { dir }),
    saveSymbol: (dir, symbol) => ipcRenderer.invoke("library:saveSymbol", { dir, symbol }),
    deleteSymbol: (dir, id) => ipcRenderer.invoke("library:deleteSymbol", { dir, id }),
    saveCategories: (dir, list) => ipcRenderer.invoke("library:saveCategories", { dir, list }),
    saveBlocks: (dir, list) => ipcRenderer.invoke("library:saveBlocks", { dir, list }),
    reveal: (dir) => ipcRenderer.invoke("library:reveal", { dir }),
  },
  /** @param {(e: { type: "available" | "downloaded" | "error"; payload: string }) => void} cb */
  onUpdate: (cb) => {
    ipcRenderer.on("update:available", (_e, v) => cb({ type: "available", payload: v }));
    ipcRenderer.on("update:downloaded", (_e, v) => cb({ type: "downloaded", payload: v }));
    ipcRenderer.on("update:error", (_e, v) => cb({ type: "error", payload: v }));
  },
});
