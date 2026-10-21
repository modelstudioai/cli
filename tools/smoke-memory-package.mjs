import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { buildIsolatedCliEnv } from "../packages/e2e/src/isolation.ts";

// Run with node --import tsx. Only the isolation helper is sourced from the repo;
// every tested command executes the installed tarball's bin from outside the repo.
const root = resolve(import.meta.dirname, "..");
const packDirectory = resolve(
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
    "test/output/memory-release-pack",
);
const live = process.argv.includes("--live");
const output = join(root, "test/output", `memory-package-smoke-${Date.now()}`);
mkdirSync(output, { recursive: true });
const installDirectory = realpathSync(mkdtempSync(join(tmpdir(), "memory-package-install-")));
const isolated = buildIsolatedCliEnv();
const environment = { ...isolated.env, NODE_OPTIONS: "" };
for (const key of Object.keys(environment)) {
  if (/^(DASHSCOPE_|BAILIAN_|ALIYUN_|ALIBABA_CLOUD_)/.test(key) && key !== "BAILIAN_CONFIG_DIR")
    delete environment[key];
}
const configured = existsSync(join(root, ".env"))
  ? parseEnv(readFileSync(join(root, ".env"), "utf8"))
  : {};
const key = process.env.DASHSCOPE_API_KEY ?? configured.DASHSCOPE_API_KEY;
const workspace = process.env.BAILIAN_WORKSPACE_ID ?? configured.BAILIAN_WORKSPACE_ID;
const packages = ["core", "runtime", "commands", "cli"].map((name) => {
  const manifest = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
  const path = join(packDirectory, `${manifest.name}-${manifest.version}.tgz`);
  assert(existsSync(path), `Pack first: ${path}`);
  return {
    name: manifest.name,
    version: manifest.version,
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
});
const checks = [];
const userId = `pack-${randomUUID()}`;
const nodes = new Set();
let eventId;
let uncertainWrite = false;
let cleanupComplete = !live;
const report = {
  status: "RUNNING",
  node: process.version,
  platform: process.platform,
  installDirectory,
  packages,
  userId,
  checks,
};
const flush = () =>
  writeFileSync(
    join(output, "report.json"),
    JSON.stringify(
      { ...report, eventId, nodes: [...nodes], uncertainWrite, cleanupComplete },
      null,
      2,
    ),
  );
function execute(args, env = environment) {
  const started = Date.now();
  let result;
  try {
    const stdout = execFileSync(join(installDirectory, "node_modules/.bin/bl"), args, {
      cwd: installDirectory,
      env,
      encoding: "utf8",
      timeout: 210000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    result = { status: 0, stdout };
  } catch (error) {
    result = {
      status: error.status,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
      error: error.code,
    };
  }
  checks.push({ args, durationMs: Date.now() - started, ...result });
  flush();
  return result;
}
function cli(args, expected = 0, env = environment) {
  const result = execute(args, env);
  assert.equal(result.status, expected, `${args.join(" ")}: ${result.stderr ?? result.stdout}`);
  return result.stdout;
}
const liveEnvironment = { ...environment, DASHSCOPE_API_KEY: key, BAILIAN_WORKSPACE_ID: workspace };
const memory = (args) =>
  JSON.parse(cli(["memory", ...args, "--output", "json", "--timeout", "30"], 0, liveEnvironment));
async function eventually(read, matches, label, timeout = 180000) {
  const deadline = Date.now() + timeout;
  do {
    const result = read();
    if (matches(result)) return result;
    await delay(2000);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
async function settle() {
  if (!eventId) return;
  const deadline = Date.now() + 180000;
  do {
    const response = await fetch(
      `https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) },
    );
    assert(response.ok, `Event HTTP ${response.status}`);
    const body = await response.json();
    for (const event of body.events ?? [])
      for (const item of event.result ?? [])
        if (item.memory_node_id) nodes.add(item.memory_node_id);
    flush();
    if (
      body.events?.length &&
      body.events.every((event) =>
        ["SUCCESS", "SUCCEEDED", "FAILED", "UNRECORDED"].includes(event.status),
      )
    )
      return;
    await delay(2000);
  } while (Date.now() < deadline);
  throw new Error("Cleanup cannot confirm write terminal state");
}
try {
  writeFileSync(
    join(installDirectory, "package.json"),
    JSON.stringify({ private: true, name: "memory-package-smoke", version: "1.0.0" }),
  );
  const installLog = execFileSync(
    "npm",
    ["install", "--no-audit", "--no-fund", ...packages.map((pkg) => pkg.path)],
    { cwd: installDirectory, env: environment, encoding: "utf8", timeout: 180000 },
  );
  writeFileSync(join(output, "install.log"), installLog);
  for (const pkg of packages) {
    const installed = join(installDirectory, "node_modules", pkg.name);
    assert(realpathSync(installed).startsWith(installDirectory));
    const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
    assert.equal(manifest.version, pkg.version);
    assert(!JSON.stringify(manifest.dependencies).includes("workspace:"));
  }
  cli(["--version"]);
  const paths = [
    "add",
    "search",
    "list",
    "update",
    "delete",
    "node show",
    "skill export",
    "profile create",
    "profile list",
    "profile show",
    "profile update",
    "profile delete",
    "profile get",
  ];
  for (const path of paths) cli(["memory", ...path.split(" "), "--help"]);
  cli(["memory", "add", "--dry-run"], 2);
  cli(["memory", "list", "--user-id", userId, "--workspace-id", "ws_smoke", "--output", "json"], 3);
  for (const args of [
    ["delete", "--node-id", "synthetic"],
    ["profile", "delete", "--schema-id", "synthetic"],
  ]) {
    cli(["memory", ...args, "--workspace-id", "ws_smoke", "--output", "json"], 7);
    const dry = JSON.parse(
      cli(["memory", ...args, "--workspace-id", "ws_smoke", "--dry-run", "--output", "json"]),
    );
    assert.equal(dry.method, "DELETE");
  }
  const dry = JSON.parse(
    cli([
      "memory",
      "add",
      "--user-id",
      userId,
      "--content",
      "synthetic",
      "--workspace-id",
      "ws_smoke",
      "--dry-run",
      "--output",
      "json",
    ]),
  );
  assert.equal(dry.request.user_id, userId);
  // Flag, env and config must all reject host-changing workspace input without fetching.
  for (const source of ["flag", "env", "config"]) {
    writeFileSync(
      join(environment.BAILIAN_CONFIG_DIR, "config.json"),
      JSON.stringify({
        language: "en-US",
        ...(source === "config" ? { workspace_id: "example.invalid/" } : {}),
      }),
    );
    cli(
      [
        "memory",
        "list",
        "--user-id",
        userId,
        "--dry-run",
        ...(source === "flag" ? ["--workspace-id", "example.invalid/"] : []),
      ],
      2,
      { ...environment, ...(source === "env" ? { BAILIAN_WORKSPACE_ID: "example.invalid/" } : {}) },
    );
  }
  writeFileSync(
    join(environment.BAILIAN_CONFIG_DIR, "config.json"),
    JSON.stringify({ language: "zh-CN" }),
  );
  cli(["memory", "delete", "--node-id", "synthetic", "--output", "json"], 7);
  writeFileSync(
    join(environment.BAILIAN_CONFIG_DIR, "config.json"),
    JSON.stringify({ language: "en-US" }),
  );
  if (live) {
    assert(key && workspace, "Live smoke requires API key/workspace");
    assert(/^[a-zA-Z0-9_-]+$/.test(workspace), "Invalid live workspace");
    uncertainWrite = true;
    flush();
    const result = execute(
      [
        "memory",
        "add",
        "--user-id",
        userId,
        "--content",
        "包装安装验收：我喜欢普洱茶。",
        "--wait",
        "180",
        "--output",
        "json",
        "--timeout",
        "30",
      ],
      liveEnvironment,
    );
    const added = result.stdout.trim() ? JSON.parse(result.stdout) : {};
    eventId = added.event_id;
    for (const event of added.events ?? [])
      for (const item of event.result ?? [])
        if (item.memory_node_id) nodes.add(item.memory_node_id);
    if (eventId) uncertainWrite = false;
    flush();
    assert.equal(result.status, 0, result.stderr);
    assert(
      added.events?.length &&
        added.events.every((event) => ["SUCCEEDED", "SUCCESS"].includes(event.status)),
    );
    assert(nodes.size > 0);
    const nodeId = [...nodes][0];
    const detail = memory(["node", "show", "--node-id", nodeId]);
    assert(detail.memory_node.content.includes("普洱"));
    await eventually(
      () => memory(["search", "--user-id", userId, "--query", "我喜欢什么茶", "--min-score", "0"]),
      (body) => body.memory_nodes?.some((node) => node.memory_node_id === nodeId),
      "installed search",
    );
    memory([
      "update",
      "--node-id",
      nodeId,
      "--content",
      "包装安装验收：我现在喜欢茉莉花茶。",
      "--meta-data",
      '{"package_smoke":"updated"}',
    ]);
    await eventually(
      () => memory(["node", "show", "--node-id", nodeId]),
      (body) =>
        body.memory_node?.content?.includes("茉莉") &&
        body.memory_node?.meta_data?.package_smoke === "updated",
      "installed update readback",
    );
  }
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  if (live && (uncertainWrite || eventId)) {
    try {
      await settle();
      const listed = memory(["list", "--user-id", userId, "--page-size", "100"]);
      for (const node of listed.memory_nodes ?? []) nodes.add(node.memory_node_id);
      for (const nodeId of nodes) memory(["delete", "--node-id", nodeId, "--yes"]);
      await eventually(
        () => memory(["list", "--user-id", userId]),
        (body) => body.memory_nodes?.length === 0,
        "installed delete readback",
      );
      assert(!uncertainWrite, "Receipt unavailable; late write reconciliation required");
      cleanupComplete = true;
    } catch (error) {
      report.status = "FAIL";
      report.cleanupError = error instanceof Error ? error.message : String(error);
    }
  }
  flush();
  isolated.dispose();
  console.log(`Package smoke ${report.status}: ${join(output, "report.json")}`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
