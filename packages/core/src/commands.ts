/** Конкретные команды над моделью (обратимые). */
import type { Command } from "./command";
import { type Id, newId } from "./ids";
import type { Point } from "./geometry";
import {
  createPage,
  type Page,
  type Project,
  type SchematicNode,
  type SymbolInstance,
  type Wire,
} from "./model";
import { type Rotation, type SymbolDef, nextDesignation } from "./symbol";

/** Поставить узел на листе (координаты уже привязаны к сетке вызывающим кодом). */
export class AddNodeCommand implements Command {
  readonly type = "add-node";
  private readonly node: SchematicNode;

  constructor(
    private readonly page: Page,
    x: number,
    y: number,
    id: Id = newId(),
  ) {
    this.node = { id, x, y };
  }

  do(): void {
    this.page.nodes.push(this.node);
  }

  undo(): void {
    const i = this.page.nodes.findIndex((n) => n.id === this.node.id);
    if (i >= 0) this.page.nodes.splice(i, 1);
  }
}

export interface PlaceOptions {
  rotation?: Rotation;
  mirror?: boolean;
  id?: Id;
}

/** Поставить символ на лист с авто-позобозначением (ГОСТ 2.710). */
export class AddSymbolInstanceCommand implements Command {
  readonly type = "add-symbol-instance";
  private readonly inst: SymbolInstance;

  constructor(
    private readonly page: Page,
    sym: SymbolDef,
    x: number,
    y: number,
    opts: PlaceOptions = {},
  ) {
    const designation = nextDesignation(
      page.instances.map((i) => i.designation),
      sym.componentCode,
    );
    this.inst = {
      id: opts.id ?? newId(),
      symbolId: sym.id,
      designation,
      componentCode: sym.componentCode,
      x,
      y,
      rotation: opts.rotation ?? 0,
      mirror: opts.mirror ?? false,
      showLabels: true,
    };
  }

  /** Созданный инстанс (для выделения в UI сразу после постановки). */
  get instance(): SymbolInstance {
    return this.inst;
  }

  do(): void {
    this.page.instances.push(this.inst);
  }

  undo(): void {
    const i = this.page.instances.findIndex((n) => n.id === this.inst.id);
    if (i >= 0) this.page.instances.splice(i, 1);
  }
}

/** Переместить инстанс (координаты уже привязаны к сетке вызывающим кодом). */
export class MoveInstanceCommand implements Command {
  readonly type = "move-instance";

  constructor(
    private readonly inst: SymbolInstance,
    private readonly fromX: number,
    private readonly fromY: number,
    private readonly toX: number,
    private readonly toY: number,
  ) {}

  do(): void {
    this.inst.x = this.toX;
    this.inst.y = this.toY;
  }

  undo(): void {
    this.inst.x = this.fromX;
    this.inst.y = this.fromY;
  }
}

/** Изменить свойства инстанса (позобозначение, видимость подписи). */
export class EditInstanceCommand implements Command {
  readonly type = "edit-instance";
  private readonly before: { designation: string; showLabels: boolean };

  constructor(
    private readonly inst: SymbolInstance,
    private readonly after: { designation?: string; showLabels?: boolean },
  ) {
    this.before = { designation: inst.designation, showLabels: inst.showLabels };
  }

  do(): void {
    if (this.after.designation !== undefined) this.inst.designation = this.after.designation;
    if (this.after.showLabels !== undefined) this.inst.showLabels = this.after.showLabels;
  }

  undo(): void {
    this.inst.designation = this.before.designation;
    this.inst.showLabels = this.before.showLabels;
  }
}

/** Повернуть инстанс на +90° (по часовой). */
export class RotateInstanceCommand implements Command {
  readonly type = "rotate-instance";
  private readonly prev: Rotation;
  private readonly next: Rotation;

  constructor(private readonly inst: SymbolInstance) {
    this.prev = inst.rotation;
    this.next = ((inst.rotation + 90) % 360) as Rotation;
  }

  do(): void {
    this.inst.rotation = this.next;
  }

  undo(): void {
    this.inst.rotation = this.prev;
  }
}

/** Отразить инстанс по горизонтали (toggle). */
export class MirrorInstanceCommand implements Command {
  readonly type = "mirror-instance";

  constructor(private readonly inst: SymbolInstance) {}

  do(): void {
    this.inst.mirror = !this.inst.mirror;
  }

  undo(): void {
    this.inst.mirror = !this.inst.mirror;
  }
}

/** Удалить инстанс с листа (восстанавливается на прежней позиции в списке). */
export class RemoveInstanceCommand implements Command {
  readonly type = "remove-instance";
  private index = -1;

  constructor(
    private readonly page: Page,
    private readonly inst: SymbolInstance,
  ) {}

  do(): void {
    this.index = this.page.instances.indexOf(this.inst);
    if (this.index >= 0) this.page.instances.splice(this.index, 1);
  }

  undo(): void {
    if (this.index >= 0) this.page.instances.splice(this.index, 0, this.inst);
  }
}

/** Добавить лист в проект (в формате активного) и сделать его активным. */
export class AddPageCommand implements Command {
  readonly type = "add-page";
  private readonly page: Page;
  private prevActive: Id = "";

  constructor(private readonly project: Project) {
    const active = project.pages.find((p) => p.id === project.activePageId);
    this.page = createPage({ format: active?.format, gridStep: active?.gridStep });
  }

  /** Созданный лист (для переключения вида сразу после добавления). */
  get newPage(): Page {
    return this.page;
  }

  do(): void {
    this.prevActive = this.project.activePageId;
    this.project.pages.push(this.page);
    this.project.activePageId = this.page.id;
  }

  undo(): void {
    const i = this.project.pages.findIndex((p) => p.id === this.page.id);
    if (i >= 0) this.project.pages.splice(i, 1);
    this.project.activePageId = this.prevActive;
  }
}

/** Удалить лист (нельзя удалить последний). Активным становится соседний. */
export class RemovePageCommand implements Command {
  readonly type = "remove-page";
  private index = -1;
  private removed: Page | null = null;
  private prevActive: Id = "";

  constructor(
    private readonly project: Project,
    private readonly pageId: Id,
  ) {}

  do(): void {
    if (this.project.pages.length <= 1) return; // минимум один лист
    this.index = this.project.pages.findIndex((p) => p.id === this.pageId);
    if (this.index < 0) return;
    this.removed = this.project.pages[this.index]!;
    this.prevActive = this.project.activePageId;
    this.project.pages.splice(this.index, 1);
    if (this.project.activePageId === this.pageId) {
      const neighbor = this.project.pages[Math.min(this.index, this.project.pages.length - 1)];
      this.project.activePageId = neighbor.id;
    }
  }

  undo(): void {
    if (!this.removed) return;
    this.project.pages.splice(this.index, 0, this.removed);
    this.project.activePageId = this.prevActive;
  }
}

/** Нарисовать провод (точки уже привязаны к сетке вызывающим кодом). */
export class AddWireCommand implements Command {
  readonly type = "add-wire";
  private readonly wire: Wire;

  constructor(
    private readonly page: Page,
    points: Point[],
    type: Wire["type"] = "power",
    id: Id = newId(),
  ) {
    this.wire = { id, points: points.map((p) => ({ x: p.x, y: p.y })), type };
  }

  /** Созданный провод. */
  get created(): Wire {
    return this.wire;
  }

  do(): void {
    this.page.wires.push(this.wire);
  }

  undo(): void {
    const i = this.page.wires.findIndex((w) => w.id === this.wire.id);
    if (i >= 0) this.page.wires.splice(i, 1);
  }
}

/** Добавить несколько проводов одной командой (для 3-полюсного провода). */
export class AddWiresCommand implements Command {
  readonly type = "add-wires";
  private readonly wires: Wire[];

  constructor(
    private readonly page: Page,
    polylines: Point[][],
    type: Wire["type"] = "power",
  ) {
    this.wires = polylines.map((pts) => ({
      id: newId(),
      points: pts.map((p) => ({ x: p.x, y: p.y })),
      type,
    }));
  }

  do(): void {
    this.page.wires.push(...this.wires);
  }

  undo(): void {
    for (const w of this.wires) {
      const i = this.page.wires.indexOf(w);
      if (i >= 0) this.page.wires.splice(i, 1);
    }
  }
}

/** Изменить свойства провода (тип, сечение, цвет). */
export class EditWireCommand implements Command {
  readonly type = "edit-wire";
  private readonly before: { type: Wire["type"]; section?: string; color?: string };

  constructor(
    private readonly wire: Wire,
    private readonly after: { type?: Wire["type"]; section?: string; color?: string },
  ) {
    this.before = { type: wire.type, section: wire.section, color: wire.color };
  }

  do(): void {
    if (this.after.type !== undefined) this.wire.type = this.after.type;
    this.wire.section = this.after.section;
    this.wire.color = this.after.color;
  }

  undo(): void {
    this.wire.type = this.before.type;
    this.wire.section = this.before.section;
    this.wire.color = this.before.color;
  }
}

/** Удалить провод (восстанавливается на прежней позиции). */
export class RemoveWireCommand implements Command {
  readonly type = "remove-wire";
  private index = -1;

  constructor(
    private readonly page: Page,
    private readonly wire: Wire,
  ) {}

  do(): void {
    this.index = this.page.wires.indexOf(this.wire);
    if (this.index >= 0) this.page.wires.splice(this.index, 1);
  }

  undo(): void {
    if (this.index >= 0) this.page.wires.splice(this.index, 0, this.wire);
  }
}
