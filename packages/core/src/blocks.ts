/**
 * Составные блоки (S27 Ф4) — «макрос-группа»: шаблон относительных размещений УГО.
 * Блок не отдельная сущность схемы: при вставке РАСКРЫВАЕТСЯ в обычные инстансы
 * (один `InsertBlockCommand`), с последовательной авто-перенумерацией одинаковых кодов.
 * Плоская модель / master-slave / отчёты работают без изменений.
 *
 * v1 — только символы (клеммы внутри блока «просто работают» как обычные XT-инстансы).
 * Провода в блоке и поворот при вставке — отложено (S12+).
 */
import type { Command } from "./command";
import { newId } from "./ids";
import type { Page, SymbolInstance } from "./model";
import { type Rotation, type SymbolLibrary, nextDesignation } from "./symbol";

/** Член блока: ссылка на символ + относительное (от origin блока) размещение. */
export interface BlockMember {
  symbolId: string;
  dx: number;
  dy: number;
  rotation: Rotation;
  mirror: boolean;
}

/** Определение блока (шаблон макрос-группы). */
export interface BlockDef {
  id: string;
  name: string;
  members: BlockMember[];
}

/**
 * Собрать блок из выбранных инстансов листа. Origin = левый-верхний угол по (x,y);
 * `dx/dy` — относительные. Порядок — как в списке инстансов листа (стабильно).
 */
export function captureBlock(name: string, page: Page, instanceIds: Iterable<string>): BlockDef {
  const ids = new Set(instanceIds);
  const insts = page.instances.filter((i) => ids.has(i.id));
  const ox = Math.min(...insts.map((i) => i.x));
  const oy = Math.min(...insts.map((i) => i.y));
  return {
    id: `block.${Date.now().toString(36)}.${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    members: insts.map((i) => ({
      symbolId: i.symbolId,
      dx: i.x - ox,
      dy: i.y - oy,
      rotation: i.rotation,
      mirror: i.mirror,
    })),
  };
}

/** Результат валидации блока. */
export type BlockValidation = { ok: true; block: BlockDef } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Структурная валидация `BlockDef` (для загрузки пользовательских блоков). */
export function validateBlock(input: unknown): BlockValidation {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["block must be an object"] };
  for (const f of ["id", "name"] as const) {
    if (!isStr(input[f]) || input[f].length === 0) errors.push(`"${f}" must be a non-empty string`);
  }
  if (!Array.isArray(input.members) || input.members.length === 0) {
    errors.push(`"members" must be a non-empty array`);
  } else {
    input.members.forEach((m, i) => {
      if (!isObj(m) || !isStr(m.symbolId) || !isNum(m.dx) || !isNum(m.dy))
        errors.push(`members[${i}]: requires { symbolId, dx, dy }`);
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, block: input as unknown as BlockDef };
}

/**
 * Вставить блок на лист в точке (dropX, dropY): раскрыть члены в обычные инстансы
 * (новые id, последовательная авто-перенумерация по коду). Неизвестные символы
 * пропускаются. Атомарно и обратимо.
 */
export class InsertBlockCommand implements Command {
  readonly type = "insert-block";
  private readonly created: SymbolInstance[] = [];

  constructor(
    private readonly page: Page,
    block: BlockDef,
    library: SymbolLibrary,
    dropX: number,
    dropY: number,
  ) {
    const existing = page.instances.map((i) => i.designation);
    for (const m of block.members) {
      const sym = library.get(m.symbolId);
      if (!sym) continue;
      const designation = nextDesignation(existing, sym.componentCode);
      existing.push(designation);
      this.created.push({
        id: newId(),
        symbolId: sym.id,
        designation,
        componentCode: sym.componentCode,
        x: dropX + m.dx,
        y: dropY + m.dy,
        rotation: m.rotation,
        mirror: m.mirror,
        showLabels: true,
      });
    }
  }

  /** Созданные инстансы (для выделения сразу после вставки). */
  get instances(): SymbolInstance[] {
    return this.created;
  }

  do(): void {
    this.page.instances.push(...this.created);
  }

  undo(): void {
    for (const inst of this.created) {
      const i = this.page.instances.indexOf(inst);
      if (i >= 0) this.page.instances.splice(i, 1);
    }
  }
}
