// Stop-хук: гейт качества в конце хода агента — замена мёртвому pre-push (remote нет).
// Гоняет typecheck → lint → test. Падение → exit 2 (Claude вернёт stderr агенту как причину).
// fail-open при инфра-ошибке (не запустилось/таймаут/нет pnpm). Анти-реентранси по stop_hook_active.
// Обход: SEE_SKIP_TURN_GATE=1. build не гоняем (медленный) — он в `pnpm verify`.
import { spawnSync } from "node:child_process";

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => resolve(s));
    setTimeout(() => resolve(s), 2000);
  });
}

let data = {};
try {
  data = JSON.parse((await readStdin()) || "{}");
} catch {
  /* пустой/битый stdin — продолжаем */
}

// уже в стоп-цикле (хук сам заблокировал прошлый стоп) → не зацикливаться
if (data.stop_hook_active) process.exit(0);
if (process.env.SEE_SKIP_TURN_GATE === "1") process.exit(0);

const steps = [
  ["typecheck", "pnpm typecheck"],
  ["lint", "pnpm lint"],
  ["test", "pnpm test"],
];

for (const [name, cmd] of steps) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", timeout: 120000 });
  // инфра-проблема (не запустилось / таймаут / нет pnpm) → fail-open, не блокируем
  if (r.error || r.status === null || r.status === 127) {
    process.stderr.write(
      `[turn-gate] ${name}: пропуск (инфра: ${r.error?.message ?? "status " + r.status})\n`,
    );
    process.exit(0);
  }
  if (r.status !== 0) {
    const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").slice(-100).join("\n");
    process.stderr.write(
      `\n[turn-gate] ❌ ${name} НЕ ПРОШЁЛ — исправь перед завершением хода ` +
        `(обход: SEE_SKIP_TURN_GATE=1).\n${tail}\n`,
    );
    process.exit(2);
  }
}
process.exit(0);
