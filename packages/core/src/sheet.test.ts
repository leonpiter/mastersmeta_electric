import { describe, it, expect } from "vitest";
import { FORMATS, frameRect, zoneGrid, TITLE_BLOCK_SIZE } from "./sheet";

describe("рамка (ГОСТ 2.301)", () => {
  it("A3: поля 20/5/5/5", () => {
    expect(frameRect(FORMATS.A3)).toEqual({ x: 20, y: 5, w: 395, h: 287 });
  });
  it("A4: 297×210", () => {
    expect(frameRect(FORMATS.A4)).toEqual({ x: 20, y: 5, w: 272, h: 200 });
  });
});

describe("зонная сетка (ГОСТ 2.104)", () => {
  it("A3 ~50мм → 8×6", () => {
    const zg = zoneGrid(FORMATS.A3);
    expect(zg.cols).toBe(8);
    expect(zg.rows).toBe(6);
    expect(zg.colX).toHaveLength(9);
    expect(zg.rowY).toHaveLength(7);
    expect(zg.colX[0]).toBe(20);
    expect(zg.colX[zg.cols]).toBeCloseTo(415);
  });
});

describe("основная надпись", () => {
  it("Форма 1 = 185×55", () => {
    expect(TITLE_BLOCK_SIZE).toEqual({ width: 185, height: 55 });
  });
});
