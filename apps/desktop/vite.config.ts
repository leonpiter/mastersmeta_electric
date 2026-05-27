import { defineConfig } from "vite";

export default defineConfig({
  // относительные пути к ассетам — чтобы рендерер грузился по file:// в Electron
  base: "./",
  server: { port: 5173 },
});
