import { describe, it, expect } from "vitest";
import { createProject, activePage } from "./model";
import { CommandStack } from "./command";
import { AddPageCommand, RemovePageCommand } from "./commands";

describe("проект и листы", () => {
  it("createProject — один лист, он активен", () => {
    const proj = createProject();
    expect(proj.pages).toHaveLength(1);
    expect(proj.activePageId).toBe(proj.pages[0].id);
    expect(activePage(proj)).toBe(proj.pages[0]);
  });

  it("добавление листа обратимо, новый становится активным", () => {
    const proj = createProject();
    const stack = new CommandStack();
    const first = proj.pages[0].id;

    const add = new AddPageCommand(proj);
    stack.execute(add);
    expect(proj.pages).toHaveLength(2);
    expect(proj.activePageId).toBe(add.newPage.id);

    stack.undo();
    expect(proj.pages).toHaveLength(1);
    expect(proj.activePageId).toBe(first);

    stack.redo();
    expect(proj.pages).toHaveLength(2);
    expect(proj.activePageId).toBe(add.newPage.id);
  });

  it("удаление листа: активным становится соседний, обратимо", () => {
    const proj = createProject();
    const stack = new CommandStack();
    const p1 = proj.pages[0].id;
    const add = new AddPageCommand(proj);
    stack.execute(add);
    const p2 = add.newPage.id;
    expect(proj.activePageId).toBe(p2);

    stack.execute(new RemovePageCommand(proj, p2));
    expect(proj.pages).toHaveLength(1);
    expect(proj.activePageId).toBe(p1);

    stack.undo();
    expect(proj.pages).toHaveLength(2);
    expect(proj.activePageId).toBe(p2); // активным восстановлен лист, бывший активным перед удалением
  });

  it("последний лист удалить нельзя", () => {
    const proj = createProject();
    const stack = new CommandStack();
    stack.execute(new RemovePageCommand(proj, proj.pages[0].id));
    expect(proj.pages).toHaveLength(1);
  });
});
