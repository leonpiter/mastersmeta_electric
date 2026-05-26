// Снимок UI через Playwright для визуальной приёмки.
// Запуск (dev-сервер должен быть поднят): node scripts/screenshot.mjs [url] [out]
import { chromium } from "playwright";

const url = process.argv[2] ?? process.env.URL ?? "http://localhost:5174/";
const out = process.argv[3] ?? "scripts/_shot.png"; // _*.png — в .gitignore

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
await browser.close();
console.log(`Снимок сохранён: ${out}`);
