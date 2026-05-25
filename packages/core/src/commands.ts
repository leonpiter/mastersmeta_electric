/** Конкретные команды над моделью (обратимые). */
import type { Command } from "./command";
import { type Id, newId } from "./ids";
import type { Page, SchematicNode } from "./model";

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
