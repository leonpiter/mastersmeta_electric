// Проверка: зеркало контактов под катушкой (M·НО·НЗ + адреса).
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto("http://localhost:5174/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await page.click("#es-new");
await page.waitForTimeout(300);

const box = await page.locator("#canvas").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await page.locator(".lib-fname", { hasText: /^Реле$/ }).click();
await page.waitForTimeout(150);

async function place(rowText, x, y, desig) {
  await page.locator(".lib-row", { hasText: rowText }).click();
  await page.mouse.click(x, y);
  await page.waitForTimeout(220);
  await page.fill("#desig-input", desig);
  await page.click("#desig-dialog button[value=ok]");
  await page.waitForTimeout(220);
}
await place("Катушка реле", cx - 120, cy, "K1");
await place("Контакт реле (НО)", cx + 60, cy - 40, "K1");
await place("Контакт реле (НЗ)", cx + 60, cy + 40, "K1");

const texts = await page.evaluate(() =>
  [...document.querySelectorAll("#canvas text")].map((t) => t.textContent),
);
console.log("заголовки зеркала НО:", texts.includes("НО"), "| НЗ:", texts.includes("НЗ"));
console.log(
  "адресов в зеркале (N.зона):",
  texts.filter((t) => t && /^\d+\.\d+[A-Z]$/.test(t)),
);
await page.screenshot({ path: "scripts/_mirror.png" });
await browser.close();
