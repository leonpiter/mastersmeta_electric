// Flat ESLint config (монорепо). Type-checked правила typescript-eslint + Prettier.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "scripts/**",
      "apps/desktop/electron/**", // glue Electron (.cjs, Node API) — вне типизированного проекта
      "apps/desktop/release/**",
    ],
  },
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
    // страж принципа 1: ядро без DOM (рендер/ввод — только в apps/desktop)
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "document", message: "core без DOM (принцип 1): рендер/ввод — в apps/desktop" },
        { name: "window", message: "core без DOM (принцип 1)" },
      ],
    },
  },
  {
    // конфиг-файлы (.js) — без type-checked правил
    files: ["**/*.js", "**/*.config.*"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
