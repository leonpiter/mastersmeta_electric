/**
 * Сериализация проекта в файл `.seeproj` (принцип 7: детерминированно, с версией схемы).
 * Сейчас формат — JSON `{ schemaVersion, project }`. Символы хранятся ссылкой по `id`
 * (резолвятся из встроенной библиотеки). Zip-упаковка со встроенными кастомными УГО — позже (S11/S12).
 */
import { newId } from "./ids";
import { type Project, DEFAULT_WIRE_WIDTH_POWER, DEFAULT_WIRE_WIDTH_CONTROL } from "./model";

/** Версия схемы файла проекта (для миграций). */
export const PROJECT_SCHEMA_VERSION = 1;

interface ProjectFile {
  schemaVersion: number;
  project: Project;
}

/** Сериализовать проект в текст `.seeproj` (JSON). */
export function serializeProject(project: Project): string {
  const file: ProjectFile = { schemaVersion: PROJECT_SCHEMA_VERSION, project };
  return JSON.stringify(file, null, 2);
}

/** Разобрать текст `.seeproj` в проект (с проверкой версии и нормализацией полей). */
export function deserializeProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("файл не является корректным JSON");
  }
  if (typeof data !== "object" || data === null) throw new Error("неверный формат файла");

  const file = data as Partial<ProjectFile>;
  const version = typeof file.schemaVersion === "number" ? file.schemaVersion : 0;
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error(`файл новее (схема ${version}) — обновите приложение`);
  }
  // место для миграций прошлых версий (сейчас идентичность)

  const p = file.project;
  if (!p || !Array.isArray(p.pages) || p.pages.length === 0) {
    throw new Error("в файле нет листов проекта");
  }

  // нормализация полей (устойчивость к старым/частичным файлам)
  for (const page of p.pages) {
    page.nodes ??= [];
    page.instances ??= [];
    page.wires ??= [];
  }

  return {
    id: p.id ?? newId(),
    name: p.name ?? "Без имени",
    pages: p.pages,
    activePageId: p.activePageId ?? p.pages[0].id,
    wireWidthPower: p.wireWidthPower ?? DEFAULT_WIRE_WIDTH_POWER,
    wireWidthControl: p.wireWidthControl ?? DEFAULT_WIRE_WIDTH_CONTROL,
  };
}
