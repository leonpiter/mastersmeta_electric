import { describe, it, expect } from "vitest";
import { CommandStack } from "./command";
import { createPage } from "./model";
import { AddNodeCommand } from "./commands";

describe("CommandStack undo/redo", () => {
  it("execute → undo → redo", () => {
    const page = createPage(5);
    const stack = new CommandStack();

    stack.execute(new AddNodeCommand(page, 10, 15));
    expect(page.nodes).toHaveLength(1);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);

    stack.undo();
    expect(page.nodes).toHaveLength(0);
    expect(stack.canRedo()).toBe(true);

    stack.redo();
    expect(page.nodes).toHaveLength(1);
    expect(page.nodes[0]).toMatchObject({ x: 10, y: 15 });
  });

  it("новая команда очищает redo-историю", () => {
    const page = createPage(5);
    const stack = new CommandStack();

    stack.execute(new AddNodeCommand(page, 0, 0));
    stack.undo();
    stack.execute(new AddNodeCommand(page, 5, 5));

    expect(stack.canRedo()).toBe(false);
    expect(page.nodes).toHaveLength(1);
  });

  it("уведомляет подписчиков", () => {
    const page = createPage(5);
    const stack = new CommandStack();
    let calls = 0;
    const unsub = stack.subscribe(() => calls++);

    stack.execute(new AddNodeCommand(page, 0, 0));
    stack.undo();
    expect(calls).toBe(2);

    unsub();
    stack.redo();
    expect(calls).toBe(2);
  });
});
