import { spawnSync } from "node:child_process";

const workspaces = ["@zilobase/toolkit"];
const rootFiles = new Set(["package.json", "README.md", "LICENSE"]);
const privatePath = /(?:^|\/)(?:src|server|database|db|drizzle|migrations?|providers?|connector-runtime|ui|credentials?|cloudflare|wrangler)(?:\/|\.|$)/i;

for (const workspace of workspaces) {
  const pack = spawnSync(
    "npm",
    ["pack", "--workspace", workspace, "--json", "--dry-run"],
    { encoding: "utf8" },
  );

  if (pack.status !== 0) {
    process.stderr.write(pack.stderr || pack.stdout);
    process.exit(pack.status ?? 1);
  }

  const reports = JSON.parse(pack.stdout);
  const files = reports.flatMap((report) => report.files ?? []).map((file) => file.path);
  const unexpected = files.filter(
    (file) => !rootFiles.has(file) && !file.startsWith("dist/"),
  );
  const privateFiles = files.filter((file) => privatePath.test(file));
  const rejected = [...new Set([...unexpected, ...privateFiles])];

  if (rejected.length > 0) {
    throw new Error(
      `${workspace} contains unexpected package files: ${rejected.join(", ")}`,
    );
  }
}
