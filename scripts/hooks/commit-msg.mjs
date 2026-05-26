// git commit-msg хук: проверка Conventional Commits. Путь к файлу сообщения — в argv[2].
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) process.exit(0);

let msg = "";
try {
  msg = readFileSync(file, "utf8");
} catch {
  process.exit(0); // не нашли файл — не мешаем
}

const first = msg.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";

// служебные сообщения git — пропускаем
if (/^(Merge|Revert|fixup!|squash!)/.test(first)) process.exit(0);

const re = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: .+/;
if (!re.test(first)) {
  process.stderr.write(
    `\n[commit-msg] Сообщение не по Conventional Commits:\n  "${first}"\n` +
      `Формат: type(scope): описание\n` +
      `type ∈ feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert\n`,
  );
  process.exit(1);
}
process.exit(0);
