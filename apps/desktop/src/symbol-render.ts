/**
 * Рендер УГО (`SymbolDef`) в SVG. Координаты — локальные к символу (мм).
 * Инстанс позиционируется группой-обёрткой: translate(x y) rotate(deg) scale(mx,1)
 * — совпадает с `transformLocalPoint` в ядре (зеркало → поворот → сдвиг).
 */
import { symbolBounds, arcPath, type SymbolDef } from "@see/core";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export interface SymbolRenderOpts {
  stroke?: string;
  strokeWidth?: number;
  /** Рисовать маркеры выводов. */
  pins?: boolean;
  /** Прозрачность (для «призрака» при вставке). */
  opacity?: number;
}

/** Построить группу графики символа в локальных координатах. */
export function symbolToSvg(sym: SymbolDef, opts: SymbolRenderOpts = {}): SVGGElement {
  const stroke = opts.stroke ?? "#1a1a1a";
  const sw = opts.strokeWidth ?? 0.35;
  const g = el("g");
  if (opts.opacity !== undefined) g.setAttribute("opacity", String(opts.opacity));

  for (const prim of sym.graphics) {
    switch (prim.type) {
      case "line":
        g.append(
          el("line", {
            x1: prim.x1,
            y1: prim.y1,
            x2: prim.x2,
            y2: prim.y2,
            stroke,
            "stroke-width": sw,
            "stroke-linecap": "round",
          }),
        );
        break;
      case "rect":
        g.append(
          el("rect", {
            x: prim.x,
            y: prim.y,
            width: prim.w,
            height: prim.h,
            fill: "none",
            stroke,
            "stroke-width": sw,
          }),
        );
        break;
      case "circle":
        g.append(
          el("circle", {
            cx: prim.cx,
            cy: prim.cy,
            r: prim.r,
            fill: "none",
            stroke,
            "stroke-width": sw,
          }),
        );
        break;
      case "arc":
        g.append(
          el("path", {
            d: arcPath(prim.cx, prim.cy, prim.r, prim.a0, prim.a1),
            fill: "none",
            stroke,
            "stroke-width": sw,
            "stroke-linecap": "round",
          }),
        );
        break;
      case "text": {
        const t = el("text", {
          x: prim.x,
          y: prim.y,
          "font-size": prim.size ?? 3,
          fill: stroke,
          "text-anchor": prim.anchor ?? "middle",
          "dominant-baseline": "central",
          "font-family": "sans-serif",
        });
        t.textContent = prim.text;
        g.append(t);
        break;
      }
    }
  }

  if (opts.pins) {
    for (const p of sym.pins) {
      g.append(el("circle", { cx: p.x, cy: p.y, r: 0.7, fill: "#1b6fc4" }));
    }
  }
  return g;
}

/** Маленькая монохромная иконка символа для строки списка (вписана в w×h px). */
export function symbolIcon(sym: SymbolDef, w = 30, h = 22): SVGSVGElement {
  const b = symbolBounds(sym);
  const pad = 1.5;
  const vw = Math.max(b.w + pad * 2, 1);
  const vh = Math.max(b.h + pad * 2, 1);
  const svg = el("svg", {
    viewBox: `${b.x - pad} ${b.y - pad} ${vw} ${vh}`,
    width: w,
    height: h,
    preserveAspectRatio: "xMidYMid meet",
  });
  svg.append(symbolToSvg(sym, { strokeWidth: 0.5 }));
  return svg;
}
