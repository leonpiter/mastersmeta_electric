/**
 * Пользовательская библиотека УГО (S9/S30). Реализация — в `library-store.ts`
 * (кэш + backend: папка на диске в Electron, localStorage в web). Здесь — ре-экспорт
 * для совместимости импортов.
 */
export {
  loadUserSymbols,
  upsertUserSymbol,
  removeUserSymbol,
  userSymbolIds,
} from "./library-store";
