import { describe, it, expect } from "vitest";
import { GOST_LETTER_CODES, GOST_CODE_SET, findLetterCode, groupByFirstLetter } from "./gost-codes";

describe("справочник буквенных кодов (ГОСТ 2.710)", () => {
  it("непустой и без дубликатов кодов", () => {
    expect(GOST_LETTER_CODES.length).toBeGreaterThan(70);
    const codes = GOST_LETTER_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("firstLetter = первая буква кода; имена непустые", () => {
    for (const c of GOST_LETTER_CODES) {
      expect(c.firstLetter).toBe(c.code[0]);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("содержит ключевые коды (KM, QF, PA) и доп. из методички (SQ, SK, EL, KK)", () => {
    for (const code of ["KM", "QF", "PA", "SQ", "SK", "EL", "KK"]) {
      expect(GOST_CODE_SET.has(code)).toBe(true);
    }
  });

  it("findLetterCode — точное совпадение", () => {
    expect(findLetterCode("KM")?.name).toContain("онтактор");
    expect(findLetterCode("нет")).toBeUndefined();
  });

  it("groupByFirstLetter группирует по алфавиту, суммарно = всем кодам", () => {
    const groups = groupByFirstLetter();
    const letters = [...groups.keys()];
    expect(letters).toEqual([...letters].sort((a, b) => a.localeCompare(b)));
    const total = [...groups.values()].reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(GOST_LETTER_CODES.length);
  });
});
