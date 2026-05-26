import { describe, it, expect } from "vitest";
import { createPage, type Annotation, DEFAULT_ANNOTATION_STYLE } from "./model";
import { CommandStack } from "./command";
import {
  AddAnnotationCommand,
  RemoveAnnotationCommand,
  MoveAnnotationCommand,
  RestyleAnnotationCommand,
} from "./commands";
import { serializeProject, deserializeProject } from "./persistence";
import { createProject } from "./model";
import { newId } from "./ids";

function line(): Annotation {
  return {
    id: newId(),
    kind: "line",
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    arrowEnd: true,
    style: { ...DEFAULT_ANNOTATION_STYLE },
  };
}

describe("аннотации (оформление)", () => {
  it("add/remove обратимы", () => {
    const page = createPage();
    const stack = new CommandStack();
    const a = new AddAnnotationCommand(page, line());
    stack.execute(a);
    expect(page.annotations).toHaveLength(1);
    stack.execute(new RemoveAnnotationCommand(page, a.annotation));
    expect(page.annotations).toHaveLength(0);
    stack.undo();
    expect(page.annotations).toHaveLength(1);
    stack.undo();
    expect(page.annotations).toHaveLength(0);
  });

  it("move сдвигает все координаты и обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const a = new AddAnnotationCommand(page, line());
    a.do();
    stack.execute(new MoveAnnotationCommand(a.annotation, 5, 3));
    const moved = a.annotation;
    if (moved.kind !== "line") throw new Error("ожидалась линия");
    expect([moved.x1, moved.y1, moved.x2, moved.y2]).toEqual([5, 3, 15, 3]);
    stack.undo();
    expect([moved.x1, moved.y1, moved.x2, moved.y2]).toEqual([0, 0, 10, 0]);
  });

  it("restyle меняет цвет/толщину/тип и обратимо", () => {
    const page = createPage();
    const stack = new CommandStack();
    const a = new AddAnnotationCommand(page, line());
    a.do();
    stack.execute(new RestyleAnnotationCommand(a.annotation, { color: "#f00", dash: "dashed" }));
    expect(a.annotation.style.color).toBe("#f00");
    expect(a.annotation.style.dash).toBe("dashed");
    expect(a.annotation.style.width).toBe(DEFAULT_ANNOTATION_STYLE.width); // не тронуто
    stack.undo();
    expect(a.annotation.style.color).toBe(DEFAULT_ANNOTATION_STYLE.color);
    expect(a.annotation.style.dash).toBe("solid");
  });

  it("аннотации сохраняются в .esch (round-trip)", () => {
    const project = createProject();
    project.pages[0].annotations.push(line(), {
      id: newId(),
      kind: "text",
      x: 20,
      y: 30,
      text: "Примечание",
      size: 5,
      style: { ...DEFAULT_ANNOTATION_STYLE },
    });
    const restored = deserializeProject(serializeProject(project));
    expect(restored.pages[0].annotations).toHaveLength(2);
    const text = restored.pages[0].annotations.find((a) => a.kind === "text");
    expect(text?.kind === "text" && text.text).toBe("Примечание");
  });

  it("старый файл без annotations нормализуется в []", () => {
    const project = createProject();
    const raw = JSON.parse(serializeProject(project)) as {
      project: { pages: { annotations?: unknown }[] };
    };
    delete raw.project.pages[0].annotations;
    const restored = deserializeProject(JSON.stringify(raw));
    expect(restored.pages[0].annotations).toEqual([]);
  });
});
