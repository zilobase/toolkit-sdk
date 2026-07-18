import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const directory = await mkdtemp(resolve(tmpdir(), "notelab-toolkit-contract-"));
const candidate = resolve(directory, "api.ts");
const executable = resolve(
  "node_modules/.bin",
  process.platform === "win32" ? "openapi-typescript.cmd" : "openapi-typescript",
);

try {
  const generation = spawnSync(
    executable,
    ["openapi/toolkit-v1.json", "-o", candidate],
    { encoding: "utf8" },
  );

  if (generation.status !== 0) {
    process.stderr.write(generation.stderr || generation.stdout);
    process.exit(generation.status ?? 1);
  }

  const [expected, committed] = await Promise.all([
    readFile(candidate, "utf8"),
    readFile("packages/core/src/generated/api.ts", "utf8"),
  ]);

  if (expected !== committed) {
    throw new Error("Generated API types are stale. Run npm run contract:generate.");
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
