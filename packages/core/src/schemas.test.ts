import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import symbolSchema from "../../../schemas/symbol.schema.json";
import partSchema from "../../../schemas/part.schema.json";
import { GOST_SYMBOLS } from "./symbols-gost";
import { BUILTIN_PARTS } from "./catalog-builtin";
import { SYMBOL_KINDS } from "./symbol";

const ajv = new Ajv({ allErrors: true, strict: false });

describe("JSON Schema открытых форматов (S12)", () => {
  const symbolValid = ajv.compile(symbolSchema as object);
  const partValid = ajv.compile(partSchema as object);

  it("все встроенные ГОСТ-символы соответствуют symbol.schema.json", () => {
    for (const s of GOST_SYMBOLS) {
      const ok = symbolValid(s);
      expect(ok, `${s.id}: ${ajv.errorsText(symbolValid.errors)}`).toBe(true);
    }
  });

  it("все встроенные изделия соответствуют part.schema.json", () => {
    for (const p of BUILTIN_PARTS) {
      const ok = partValid(p);
      expect(ok, `${p.code}: ${ajv.errorsText(partValid.errors)}`).toBe(true);
    }
  });

  it("отклоняет битый символ (плохой kind, неполный примитив)", () => {
    expect(symbolValid({ id: "x", kind: "wrong", pins: [], graphics: [] })).toBe(false);
    expect(symbolValid({ ...GOST_SYMBOLS[0], graphics: [{ type: "line", x1: 0 }] })).toBe(false);
  });

  it("kind-enum схемы совпадает с SYMBOL_KINDS (защита от рассинхрона)", () => {
    expect([...symbolSchema.properties.kind.enum].sort()).toEqual([...SYMBOL_KINDS].sort());
  });
});
