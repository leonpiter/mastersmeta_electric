/**
 * Мост к нативной оболочке (Electron, S11). В вебе `window.desktop` отсутствует —
 * функции просто ничего не делают. В Electron окно без рамки (frame:false), поэтому
 * кнопки своей шапки (#tb-min/#tb-max/#tb-close) управляют окном через IPC.
 */
interface DesktopBridge {
  isElectron: boolean;
  version: () => Promise<string>;
  win: { minimize: () => void; toggleMaximize: () => void; close: () => void };
  /** Нативные файловые диалоги (вместо браузерных download / input[type=file]). */
  fs: {
    save: (defaultName: string, content: string) => Promise<boolean>;
    open: (extensions: string[]) => Promise<{ name: string; text: string } | null>;
  };
  onUpdate: (
    cb: (e: { type: "available" | "downloaded" | "error"; payload: string }) => void,
  ) => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** Десктоп-мост, если запущены в Electron (иначе undefined → веб-поведение). */
export function desktop(): DesktopBridge | undefined {
  return window.desktop?.isElectron ? window.desktop : undefined;
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
