/**
 * Стабильные идентификаторы сущностей (CLAUDE принцип 7: uuid, не индексы массивов).
 * Используем глобальный crypto без зависимости от DOM-lib (Node 22 + браузеры).
 */
export type Id = string;

export function newId(): Id {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // запасной вариант, если randomUUID недоступен
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
