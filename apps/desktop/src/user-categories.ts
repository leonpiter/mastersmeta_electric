/**
 * Пользовательские категории оборудования (S27/S30). Реализация — в `library-store.ts`.
 * Здесь — ре-экспорт для совместимости импортов.
 */
export {
  loadUserCategories,
  upsertUserCategory,
  removeUserCategory,
  userCategoryNames,
} from "./library-store";
