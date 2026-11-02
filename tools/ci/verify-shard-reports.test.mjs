import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterEach, expect, test } from "vite-plus/test";
import { verifyShardReports } from "./verify-shard-reports.mjs";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bl-shard-reports-"));
  directories.push(root);
  const reportsDirectory = join(root, "reports");
  for (const format of ["blob", "json"])
    mkdirSync(join(reportsDirectory, format), { recursive: true });
  const files = Array.from({ length: 8 }, (_entry, index) => join(root, `test-${index}.test.ts`));
  const inventoryPath = join(root, "inventory.json");
  writeFileSync(inventoryPath, JSON.stringify(files.map((file) => ({ file }))));
  function writeReport(index, overrides = {}) {
    const report = {
      success: true,
      numFailedTests: 0,
      numTotalTests: 2,
      testResults: files.slice((index - 1) * 2, index * 2).map((name) => ({
        name,
        status: "passed",
        assertionResults: [{ fullName: "same parameterized title", status: "passed" }],
      })),
      ...overrides,
    };
    writeFileSync(join(reportsDirectory, "json", `shard-${index}.json`), JSON.stringify(report));
    writeFileSync(
      join(reportsDirectory, "blob", `shard-${index}.json`),
      "blob validated by Vitest merge",
    );
    return report;
  }
  for (let shardIndex = 1; shardIndex <= 4; shardIndex++) writeReport(shardIndex);
  return {
    root,
    files,
    reportsDirectory,
    inventoryPath,
    writeReport,
    options: {
      root,
      reportsDirectory,
      inventoryPath,
      shardCount: 4,
      qualityResult: "success",
      testResult: "success",
    },
  };
}

test("accepts complete disjoint files, including existing pending cases and duplicate titles", () => {
  const current = fixture();
  const report = current.writeReport(1);
  report.testResults[0].assertionResults.push({
    fullName: "same parameterized title",
    status: "pending",
  });
  current.writeReport(1, { testResults: report.testResults, numTotalTests: 3 });
  expect(verifyShardReports(current.options)).toEqual({
    shards: 4,
    files: 8,
    tests: 9,
    skipped: 1,
  });
});

test.each(["qualityResult", "testResult"])("rejects every unsuccessful %s state", (resultKey) => {
  const current = fixture();
  for (const state of ["failure", "cancelled", "skipped", undefined]) {
    expect(() => verifyShardReports({ ...current.options, [resultKey]: state })).toThrow(
      "Required jobs did not succeed",
    );
  }
});

test.each(["blob", "json"])("rejects missing, extra and empty %s artifacts", (format) => {
  const current = fixture();
  const path = join(current.reportsDirectory, format, "shard-4.json");
  const original = readFileSync(path, "utf8");
  unlinkSync(path);
  expect(() => verifyShardReports(current.options)).toThrow("Expected 4");
  writeFileSync(path, "");
  expect(() => verifyShardReports(current.options)).toThrow("Empty or invalid");
  writeFileSync(path, original);
  writeFileSync(join(current.reportsDirectory, format, "unexpected.json"), "{}");
  expect(() => verifyShardReports(current.options)).toThrow("Expected 4");
});

test("rejects missing coverage even when all four reports claim success", () => {
  const current = fixture();
  current.writeReport(4, { testResults: [], numTotalTests: 0 });
  expect(() => verifyShardReports(current.options)).toThrow("Test files did not run");
});

test("rejects duplicate coverage despite unchanged file and test totals", () => {
  const current = fixture();
  const report = current.writeReport(4);
  report.testResults[0].name = current.files[0];
  current.writeReport(4, { testResults: report.testResults });
  expect(() => verifyShardReports(current.options)).toThrow("ran more than once");
});

test.each(["not-discovered.test.ts", "../outside.test.ts"])(
  "rejects unexpected file %s",
  (name) => {
    const current = fixture();
    const report = current.writeReport(1);
    report.testResults[0].name = name;
    current.writeReport(1, { testResults: report.testResults });
    expect(() => verifyShardReports(current.options)).toThrow(
      /Unexpected test file|outside the repository/,
    );
  },
);

test.each([
  { success: false },
  { numFailedTests: 1 },
  { testResults: null },
  { numTotalTests: 99 },
])("rejects failed or corrupt summary %j", (overrides) => {
  const current = fixture();
  current.writeReport(1, overrides);
  expect(() => verifyShardReports(current.options)).toThrow(/Unsuccessful|Inconsistent/);
});

test.each(["failed suite", "failed assertion", "missing assertions"])(
  "rejects %s hidden by success metadata",
  (mode) => {
    const current = fixture();
    const report = current.writeReport(1);
    if (mode === "failed suite") report.testResults[0].status = "failed";
    else if (mode === "failed assertion")
      report.testResults[0].assertionResults[0].status = "failed";
    else delete report.testResults[0].assertionResults;
    current.writeReport(1, { testResults: report.testResults });
    expect(() => verifyShardReports(current.options)).toThrow(/Failed or/);
  },
);

test("workflow keeps the required check, complete four-way matrix, and failure-safe report merge", () => {
  const workflow = parse(
    readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  expect(workflow.jobs.check.name).toBe("lint + typecheck + test");
  expect(workflow.jobs.check.if).toBe("${{ always() }}");
  expect(workflow.jobs.check.needs).toEqual(["quality", "test"]);
  expect(workflow.jobs.test.strategy.matrix.shard).toEqual([1, 2, 3, 4]);
  expect(workflow.jobs.test.strategy["fail-fast"]).toBe(false);
  expect(workflow.jobs.test["continue-on-error"]).not.toBe(true);
  expect(workflow.jobs.check["continue-on-error"]).not.toBe(true);
  const bun = workflow.jobs.test.steps.find((step) => step.uses?.startsWith("oven-sh/setup-bun@"));
  expect(bun.with["bun-version"]).toBe("1.3.14");
  const qualityCommands = workflow.jobs.quality.steps.map((step) => step.run).filter(Boolean);
  expect(qualityCommands).toContain("pnpm run check");
  expect(qualityCommands).toContain('pnpm -r --filter "./packages/*" build');
  const run = workflow.jobs.test.steps.find((step) => step.name === "Run test shard");
  expect(run.run).toContain("--shard=${{ matrix.shard }}/4");
  expect(run.run).toContain("--reporter=blob");
  expect(run.run).toContain("--reporter=json");
  expect(run.run).not.toMatch(/--(?:exclude|testNamePattern|passWithNoTests|no-isolate)/);
  const verify = workflow.jobs.check.steps.find(
    (step) => step.name === "Verify complete shard coverage",
  );
  expect(verify.if).toBe("${{ always() }}");
  expect(verify.env.QUALITY_RESULT).toBe("${{ needs.quality.result }}");
  expect(verify.env.TEST_RESULT).toBe("${{ needs.test.result }}");
  expect(verify["continue-on-error"]).not.toBe(true);
  const merge = workflow.jobs.check.steps.find((step) => step.name === "Merge test reports");
  expect(merge.if).toContain("always()");
  expect(merge.run).toContain("--mergeReports=.ci-test-results/blob");
  expect(merge["continue-on-error"]).not.toBe(true);
  const upload = workflow.jobs.test.steps.find((step) => step.name === "Upload shard reports");
  expect(upload.if).toBe("${{ always() }}");
  expect(upload.with["include-hidden-files"]).toBe(true);
  expect(upload.with.name).toBe("test-shard-${{ matrix.shard }}");
});
