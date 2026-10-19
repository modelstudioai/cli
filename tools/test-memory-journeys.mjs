import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { missingCloudEnvironment, summarizeSuite } from "./memory-journey-report.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const layerIndex = process.argv.indexOf("--layer");
const layer = layerIndex < 0 ? "all" : process.argv[layerIndex + 1];
if (!["all", "cli", "plugin"].includes(layer))
  throw new Error("--layer must be all, cli, or plugin");
const environment = {
  ...process.env,
  ...(existsSync(join(root, ".env")) ? parseEnv(readFileSync(join(root, ".env"), "utf8")) : {}),
  BAILIAN_MEMORY_JOURNEYS: "1",
  BAILIAN_E2E: "1",
};
const reportDirectory = resolve(
  root,
  "test/output",
  `memory-acceptance-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
mkdirSync(reportDirectory, { recursive: true });
const results = [];
const blockers = [];
const missing = missingCloudEnvironment(environment);
if (missing.length) blockers.push(`Cloud prerequisites missing: ${missing.join(", ")}`);

const suites = [
  {
    layer: "cli",
    path: "packages/commands/tests/e2e/memory/journeys",
    ids: ["J1", "J2", "J3", "J4", "J5"],
  },
  { layer: "plugin", path: "packages/bailian-memo-dsh/tests/journeys", ids: ["J6", "J7", "J8"] },
].filter((suite) => layer === "all" || layer === suite.layer);
for (const suite of suites) {
  if (missing.length) {
    results.push(
      ...suite.ids.map((id) => ({ id, layer: suite.layer, status: "BLOCKED", checks: [] })),
    );
    continue;
  }
  const outputFile = join(reportDirectory, `${suite.layer}.json`);
  const run = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "exec",
      "vp",
      "test",
      suite.path,
      "--maxWorkers=1",
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${outputFile}`,
    ],
    { cwd: root, env: environment, stdio: "inherit" },
  );
  const report = existsSync(outputFile) ? JSON.parse(readFileSync(outputFile, "utf8")) : {};
  results.push(
    ...summarizeSuite(report, suite.ids).map((result) => ({
      ...result,
      layer: suite.layer === "plugin" ? "real-cloud-controlled-host" : "real-cloud-cli",
    })),
  );
  if (run.error || run.status !== 0)
    blockers.push(
      `${suite.layer} test process did not pass (exit ${run.status ?? "unknown"}); see ${outputFile}`,
    );
}

// Actual dsh/Skill sessions are outside this repository acceptance scope.
const summary = {
  generatedAt: new Date().toISOString(),
  scope: layer,
  results,
  blockers,
  status: results.some((result) => result.status === "FAIL")
    ? "FAIL"
    : blockers.length || results.some((result) => result.status !== "PASS")
      ? "BLOCKED"
      : "PASS",
};
writeFileSync(join(reportDirectory, "summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(
  join(reportDirectory, "summary.md"),
  [
    "# Memory live acceptance",
    "",
    `Status: ${summary.status}; scope: ${layer}`,
    "",
    "| Journey | Layer | Result |",
    "| --- | --- | --- |",
    ...results.map((result) => `| ${result.id} | ${result.layer} | ${result.status} |`),
    "",
    ...blockers.map((blocker) => `- ${blocker}`),
    "",
  ].join("\n"),
);
console.log(`Memory acceptance: ${summary.status}\nReport: ${join(reportDirectory, "summary.md")}`);
process.exitCode = summary.status === "PASS" ? 0 : summary.status === "FAIL" ? 1 : 2;
