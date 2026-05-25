import { describe, it, expect } from "vitest";
import { mmToPx, pxToMm } from "./units";

describe("units (мм ↔ px)", () => {
  it("25.4 мм = 96 px (96 dpi)", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96);
  });

  it("round-trip mm → px → mm", () => {
    expect(pxToMm(mmToPx(42))).toBeCloseTo(42);
  });
});
