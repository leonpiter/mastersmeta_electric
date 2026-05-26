// Flat ESLint config (монорепо). Type-checked правила typescript-eslint + Prettier.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      // допускаем `let`, читаемый в замыкании до присваивания (циклические ссылки UI)
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
  {
    // конфиг-файлы (.js) — без type-checked правил
    files: ["**/*.js", "**/*.config.*"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
