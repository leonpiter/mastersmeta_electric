// PostToolUse-хук: форматирует только что отредактированный файл через Prettier (Node API —
// без spawn, кросс-платформенно). Читает JSON из stdin (tool_input.file_path). Всегда exit 0.
import { readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";

const EXT = /\.(ts|tsx|js|mjs|cjs|json|css|html)$/;

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => resolve(s));
    setTimeout(() => resolve(s), 2000); // не висеть, если stdin пуст
  });
}

try {
  const data = JSON.parse((await readStdin()) || "{}");
  const file = data?.tool_input?.file_path;
  if (file && EXT.test(file)) {
    const source = await readFile(file, "utf8");
    const cfg = await prettier.resolveConfig(file);
    const out = await prettier.format(source, { ...cfg, filepath: file });
    if (out !== source) await writeFile(file, out, "utf8");
  }
} catch {
  // хук не должен мешать работе — молча выходим
}
process.exit(0);
