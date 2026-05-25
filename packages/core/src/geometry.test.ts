import { describe, it, expect } from "vitest";
import { snap, snapPoint, distance } from "./geometry";

describe("snap к сетке", () => {
  it("привязывает к ближайшему узлу", () => {
    expect(snap(12, 5)).toBe(10);
    expect(snap(13, 5)).toBe(15);
    expect(snap(2, 5)).toBe(0);
    expect(snap(-3, 5)).toBe(-5);
  });

  it("snapPoint по обеим осям", () => {
    expect(snapPoint({ x: 12, y: 13 }, 5)).toEqual({ x: 10, y: 15 });
  });
});

describe("distance", () => {
  it("3-4-5", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
