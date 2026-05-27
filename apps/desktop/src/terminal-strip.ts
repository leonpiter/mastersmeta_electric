/**
 * Графический клеммник (S8): рейка клемм как вертикальный стек блоков; слева/справа —
 * подключения к выводам (цепь + выводы устройств). Рисуется из `computeTerminalStrips`
 * (связность вычисляется, принцип 2). Чистый рендер в SVG — пригодно и для печати.
 */
import type { TerminalStrip } from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 760;
const BOX_X = 230;
const BOX_W = 56;
const BOX_H = 24;
const STUB = 36;
const TITLE_H = 24;
const STRIP_GAP = 16;
const PAD = 14;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  s: string,
  x: number,
  y: number,
  anchor: string,
  opts: Record<string, string | number> = {},
): SVGTextElement {
  const t = el("text", {
    x,
    y,
    "text-anchor": anchor,
    "dominant-baseline": "central",
    "font-family": "sans-serif",
    "font-size": 11,
    fill: "#1a1a1a",
    ...opts,
  });
  t.textContent = s;
  return t;
}

/** Построить SVG клеммников. Возвращает готовый элемент (для диалога/печати). */
export function renderTerminalStrips(strips: TerminalStrip[]): SVGSVGElement {
  const rowsTotal = strips.reduce((n, s) => n + s.rows.length, 0);
  const height = PAD * 2 + strips.length * (TITLE_H + STRIP_GAP) + rowsTotal * BOX_H;
  const svg = el("svg", { width: WIDTH, height, viewBox: `0 0 ${WIDTH} ${height}` });

  let y = PAD;
  for (const strip of strips) {
    svg.append(
      text(`Клеммник ${strip.name} · ${strip.rows.length} кл.`, PAD, y + TITLE_H / 2, "start", {
        "font-size": 13,
        "font-weight": "bold",
        fill: "#0f2a4a",
      }),
    );
    y += TITLE_H;

    for (const row of strip.rows) {
      const cy = y + BOX_H / 2;
      // блок клеммы
      svg.append(
        el("rect", {
          x: BOX_X,
          y,
          width: BOX_W,
          height: BOX_H,
          fill: "#fff",
          stroke: "#34506e",
          "stroke-width": 1,
        }),
      );
      svg.append(text(row.terminal, BOX_X + BOX_W / 2, cy, "middle", { "font-weight": "bold" }));

      // левый вывод (side1)
      if (row.side1 !== "—") {
        svg.append(
          el("line", {
            x1: BOX_X - STUB,
            y1: cy,
            x2: BOX_X,
            y2: cy,
            stroke: "#34506e",
            "stroke-width": 1,
          }),
        );
        svg.append(text(row.side1, BOX_X - STUB - 6, cy, "end", { fill: "#3a4a5c" }));
      }
      // правый вывод (side2)
      if (row.side2 !== "—") {
        svg.append(
          el("line", {
            x1: BOX_X + BOX_W,
            y1: cy,
            x2: BOX_X + BOX_W + STUB,
            y2: cy,
            stroke: "#34506e",
            "stroke-width": 1,
          }),
        );
        svg.append(text(row.side2, BOX_X + BOX_W + STUB + 6, cy, "start", { fill: "#3a4a5c" }));
      }
      y += BOX_H;
    }
    y += STRIP_GAP;
  }
  return svg;
}
