// Генерация иконок приложения из векторного источника apps/desktop/build/icon.svg.
// Растеризация — headless Chromium (playwright); Windows .ico собираем сами (PNG-в-ICO).
// Источник правды — SVG; бинарники (icon.ico/icon.png/favicon.png) коммитятся.
//   Запуск:  node scripts/gen-icon.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SVG_PATH = "apps/desktop/build/icon.svg";
const svg = readFileSync(SVG_PATH, "utf8");

/** Растеризовать SVG в PNG-буфер заданного размера (точный clip, scale 1). */
async function renderPng(browser, size) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const sized = svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0;background:transparent">${sized}</body></html>`,
    { waitUntil: "load" },
  );
  const buf = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await page.close();
  return buf;
}

/** Собрать .ico из набора PNG-буферов (Windows Vista+ читает PNG внутри ICO). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  for (let i = 0; i < images.length; i++) {
    const { size, buf } = images[i];
    const e = i * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, e + 0); // width (0 = 256)
    entries.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
    entries.writeUInt8(0, e + 2); // палитра не используется
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // color planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(buf.length, e + 8); // размер данных
    entries.writeUInt32LE(offset, e + 12); // смещение
    offset += buf.length;
  }
  return Buffer.concat([header, entries, ...images.map((i) => i.buf)]);
}

const browser = await chromium.launch();
try {
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of icoSizes) images.push({ size, buf: await renderPng(browser, size) });

  // Windows .ico (иконка EXE/инсталлятора/панели задач) — buildResources electron-builder
  writeFileSync("apps/desktop/build/icon.ico", buildIco(images));
  // PNG 512 — кросс-платформенный фолбэк для electron-builder
  writeFileSync("apps/desktop/build/icon.png", await renderPng(browser, 512));
  // favicon 256 — вкладка/окно рендерера (Vite копирует public/ в dist/)
  mkdirSync("apps/desktop/public", { recursive: true });
  writeFileSync("apps/desktop/public/favicon.png", images.find((i) => i.size === 256).buf);

  console.log("готово: build/icon.ico, build/icon.png, public/favicon.png");
} finally {
  await browser.close();
}
