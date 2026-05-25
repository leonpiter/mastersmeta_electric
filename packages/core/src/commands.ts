/** Конкретные команды над моделью (обратимые). */
import type { Command } from "./command";
import { type Id, newId } from "./ids";
import type { Page, SchematicNode, SymbolInstance } from "./model";
import {
  type Rotation,
  type SymbolDef,
  nextDesignation,
} from "./symbol";

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
    if (this.after.designation !== undefined)
      this.inst.designation = this.after.designation;
    if (this.after.showLabels !== undefined)
      this.inst.showLabels = this.after.showLabels;
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
