/**
 * Мост к нативной оболочке (Electron, S11). В вебе `window.desktop` отсутствует —
 * функции просто ничего не делают. В Electron окно без рамки (frame:false), поэтому
 * кнопки своей шапки (#tb-min/#tb-max/#tb-close) управляют окном через IPC.
 */
interface DesktopBridge {
  isElectron: boolean;
  version: () => Promise<string>;
  win: { minimize: () => void; toggleMaximize: () => void; close: () => void };
  onUpdate: (
    cb: (e: { type: "available" | "downloaded" | "error"; payload: string }) => void,
  ) => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** Включить интеграцию с десктоп-оболочкой (вызывать один раз при старте). */
export function initDesktopShell(): void {
  const d = window.desktop;
  if (!d?.isElectron) return; // веб-версия — оставляем как есть
  document.body.classList.add("is-electron");

  const bind = (id: string, fn: () => void): void => {
    document.getElementById(id)?.addEventListener("click", fn);
  };
  bind("tb-min", () => d.win.minimize());
  bind("tb-max", () => d.win.toggleMaximize());
  bind("tb-close", () => d.win.close());
}
