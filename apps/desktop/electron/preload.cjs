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
  /** @param {(e: { type: "available" | "downloaded" | "error"; payload: string }) => void} cb */
  onUpdate: (cb) => {
    ipcRenderer.on("update:available", (_e, v) => cb({ type: "available", payload: v }));
    ipcRenderer.on("update:downloaded", (_e, v) => cb({ type: "downloaded", payload: v }));
    ipcRenderer.on("update:error", (_e, v) => cb({ type: "error", payload: v }));
  },
});
