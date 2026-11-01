import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** Check job results and actual file coverage before accepting a sharded run. */
export function verifyShardReports({
  root = process.cwd(),
  reportsDirectory,
  inventoryPath,
  shardCount,
  qualityResult,
  testResult,
}) {
  if (qualityResult !== "success" || testResult !== "success") {
    throw new Error(`Required jobs did not succeed: quality=${qualityResult}, test=${testResult}`);
  }
  if (!Number.isInteger(shardCount) || shardCount < 1) throw new Error("Invalid shard count");
  function fileKey(filename) {
    if (typeof filename !== "string" || !filename) throw new Error("Missing test file name");
    const absolute = isAbsolute(filename) ? filename : resolve(root, filename);
    const key = relative(root, absolute).replaceAll("\\", "/");
    if (!key || key === ".." || key.startsWith("../")) {
      throw new Error(`Test file is outside the repository: ${filename}`);
    }
    return key;
  }
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (!Array.isArray(inventory) || !inventory.length) throw new Error("Empty test inventory");
  const expectedFiles = new Set(inventory.map((entry) => fileKey(entry.file)));
  if (expectedFiles.size !== inventory.length) throw new Error("Duplicate test inventory entries");
  const reportNames = Array.from(
    { length: shardCount },
    (_entry, index) => `shard-${index + 1}.json`,
  );
  for (const format of ["blob", "json"]) {
    const directory = join(reportsDirectory, format);
    const actual = readdirSync(directory).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...reportNames].sort())) {
      throw new Error(`Expected ${shardCount} ${format} reports; found: ${actual.join(", ")}`);
    }
    for (const name of reportNames) {
      const stats = statSync(join(directory, name));
      if (!stats.isFile() || !stats.size)
        throw new Error(`Empty or invalid ${format} report: ${name}`);
    }
  }
  const seenFiles = new Set();
  let tests = 0;
  let skipped = 0;
  for (const name of reportNames) {
    const report = JSON.parse(readFileSync(join(reportsDirectory, "json", name), "utf8"));
    if (
      report.success !== true ||
      report.numFailedTests !== 0 ||
      !Array.isArray(report.testResults)
    ) {
      throw new Error(`Unsuccessful or malformed test report: ${name}`);
    }
    let shardTests = 0;
    for (const suite of report.testResults) {
      const key = fileKey(suite.name);
      if (!expectedFiles.has(key)) throw new Error(`Unexpected test file: ${key}`);
      if (seenFiles.has(key)) throw new Error(`Test file ran more than once: ${key}`);
      if (suite.status === "failed" || !Array.isArray(suite.assertionResults)) {
        throw new Error(`Failed or malformed test file: ${key}`);
      }
      seenFiles.add(key);
      for (const assertion of suite.assertionResults) {
        if (!["passed", "pending", "skipped", "todo"].includes(assertion.status)) {
          throw new Error(`Failed or invalid test in ${key}: ${assertion.fullName}`);
        }
        shardTests++;
        if (assertion.status !== "passed") skipped++;
      }
    }
    if (shardTests !== report.numTotalTests) throw new Error(`Inconsistent test count: ${name}`);
    tests += shardTests;
  }
  const missing = [...expectedFiles].filter((filename) => !seenFiles.has(filename));
  if (missing.length) throw new Error(`Test files did not run: ${missing.join(", ")}`);
  return { shards: shardCount, files: seenFiles.size, tests, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        reports: { type: "string" },
        inventory: { type: "string" },
        shards: { type: "string" },
      },
    });
    const summary = verifyShardReports({
      reportsDirectory: values.reports,
      inventoryPath: values.inventory,
      shardCount: Number(values.shards),
      qualityResult: process.env.QUALITY_RESULT,
      testResult: process.env.TEST_RESULT,
    });
    console.log(`Verified sharded test run: ${JSON.stringify(summary)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
