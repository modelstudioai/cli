#!/usr/bin/env node
/**
 * Asset-center command integration test runner.
 * Read-only commands: real API. Write commands: --dry-run only.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(root, "packages/cli");
const mainTs = join(cliDir, "src/main.ts");
const workspaceId = process.env.BAILIAN_WORKSPACE_ID ?? "llm-0xvms4kqhbqjlg8s";

function runBl(args, { timeout = 120_000 } = {}) {
  const start = Date.now();
  try {
    const stdout = execFileSync("pnpm", ["exec", "tsx", mainTs, ...args], {
      cwd: cliDir,
      encoding: "utf8",
      timeout,
      env: { ...process.env, BAILIAN_WORKSPACE_ID: workspaceId },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: "",
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: (error.stdout ?? "").trim(),
      stderr: (error.stderr ?? "").trim(),
      durationMs: Date.now() - start,
    };
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeOutput(result) {
  const json = parseJson(result.stdout);
  if (json) {
    if (json.api) return `dry-run → ${json.api.split(".").pop()}`;
    if (json.items?.length !== undefined)
      return `${json.items.length} item(s)${json.next_token != null ? `, next=${json.next_token}` : ""}`;
    if (json.item) return `asset=${json.item.asset_id ?? json.item.assetId ?? "?"}`;
    if (json.total_count != null) return `total=${json.total_count}`;
    if (json.used_bytes != null)
      return `used=${json.used_bytes} / quota=${json.quota_bytes ?? "?"}`;
    if (json.policy_id ?? json.policyId) return `policy=${json.policy_id ?? json.policyId}`;
    if (json.authorized != null) return `authorized=${json.authorized}`;
    if (json.saved) return `saved=${json.saved}`;
    const keys = Object.keys(json).slice(0, 4).join(", ");
    return keys ? `{${keys}}` : "json ok";
  }
  const lines = result.stdout.split("\n").filter(Boolean);
  if (lines.length === 0 && result.stderr) {
    const errLine = result.stderr
      .split("\n")
      .find((line) => line.includes("Error") || line.includes("error"));
    return errLine?.slice(0, 80) ?? result.stderr.slice(0, 80);
  }
  if (lines.length <= 3) return lines.join(" | ").slice(0, 100);
  return `${lines.length} lines, first: ${lines[0].slice(0, 60)}`;
}

function status(exitCode, expected = 0) {
  if (exitCode === expected) return "✅ PASS";
  return "❌ FAIL";
}

// Fetch sample asset ID
const listResult = runBl([
  "asset-center",
  "list",
  "--page-size",
  "1",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const listJson = parseJson(listResult.stdout);
const sampleAssetId = listJson?.items?.[0]?.asset_id ?? "asset_df026105d2274ff9b8c824058fa23d60";

const cases = [
  // --- Read-only (real API) ---
  {
    category: "查询",
    command: "asset-center list",
    mode: "真实调用",
    args: [
      "asset-center",
      "list",
      "--page-size",
      "3",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "查询",
    command: "asset-center list --type IMAGE",
    mode: "真实调用",
    args: [
      "asset-center",
      "list",
      "--type",
      "IMAGE",
      "--page-size",
      "2",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "查询",
    command: "asset-center get",
    mode: "真实调用",
    args: [
      "asset-center",
      "get",
      "--asset-id",
      sampleAssetId,
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "统计",
    command: "asset-center stats",
    mode: "真实调用",
    args: ["asset-center", "stats", "--output", "json", "--workspace-id", workspaceId],
    expect: 0,
  },
  {
    category: "统计",
    command: "asset-center storage",
    mode: "真实调用",
    args: ["asset-center", "storage", "--output", "json", "--workspace-id", workspaceId],
    expect: 0,
  },
  {
    category: "转存",
    command: "asset-center transfer list",
    mode: "真实调用",
    args: [
      "asset-center",
      "transfer",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "OSS",
    command: "asset-center oss show",
    mode: "真实调用",
    args: ["asset-center", "oss", "show", "--output", "json", "--workspace-id", workspaceId],
    expect: 0,
  },

  // --- Dry-run (write / side-effect) ---
  {
    category: "查询",
    command: "asset-center list --dry-run",
    mode: "dry-run",
    args: ["asset-center", "list", "--dry-run", "--output", "json", "--workspace-id", workspaceId],
    expect: 0,
  },
  {
    category: "查询",
    command: "asset-center get --dry-run",
    mode: "dry-run",
    args: [
      "asset-center",
      "get",
      "--asset-id",
      sampleAssetId,
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "收藏",
    command: "asset-center favorite",
    mode: "dry-run",
    args: [
      "asset-center",
      "favorite",
      "--id",
      sampleAssetId,
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "收藏",
    command: "asset-center unfavorite",
    mode: "dry-run",
    args: [
      "asset-center",
      "unfavorite",
      "--id",
      sampleAssetId,
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "删除",
    command: "asset-center delete",
    mode: "dry-run",
    args: [
      "asset-center",
      "delete",
      "--id",
      sampleAssetId,
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "下载",
    command: "asset-center download",
    mode: "dry-run",
    args: [
      "asset-center",
      "download",
      "--id",
      sampleAssetId,
      "--out",
      "/tmp/asset-test-download.mp4",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "统计",
    command: "asset-center stats --dry-run",
    mode: "dry-run",
    args: ["asset-center", "stats", "--dry-run", "--output", "json", "--workspace-id", workspaceId],
    expect: 0,
  },
  {
    category: "统计",
    command: "asset-center storage --dry-run",
    mode: "dry-run",
    args: [
      "asset-center",
      "storage",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "OSS",
    command: "asset-center oss slr authorize",
    mode: "dry-run",
    args: [
      "asset-center",
      "oss",
      "slr",
      "authorize",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "OSS",
    command: "asset-center oss bind",
    mode: "dry-run",
    args: [
      "asset-center",
      "oss",
      "bind",
      "--bucket",
      "test-bucket",
      "--region",
      "cn-hangzhou",
      "--path-prefix",
      "assets/",
      "--policy",
      "ALL",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "OSS",
    command: "asset-center oss update",
    mode: "dry-run",
    args: [
      "asset-center",
      "oss",
      "update",
      "--policy-id",
      "policy-test-001",
      "--bucket",
      "test-bucket",
      "--region",
      "cn-hangzhou",
      "--path-prefix",
      "assets/",
      "--policy",
      "BEFORE_DAYS",
      "--before-days",
      "30",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },
  {
    category: "OSS",
    command: "asset-center oss unbind",
    mode: "dry-run",
    args: [
      "asset-center",
      "oss",
      "unbind",
      "--policy-id",
      "policy-test-001",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      workspaceId,
    ],
    expect: 0,
  },

  // --- Validation (expect usage error) ---
  {
    category: "校验",
    command: "asset-center get (缺 asset-id)",
    mode: "参数校验",
    args: ["asset-center", "get", "--quiet", "--workspace-id", workspaceId],
    expect: 2,
  },
  {
    category: "校验",
    command: "asset-center favorite (缺 --id)",
    mode: "参数校验",
    args: ["asset-center", "favorite", "--quiet", "--workspace-id", workspaceId],
    expect: 2,
  },
  {
    category: "校验",
    command: "asset-center download (缺 --out)",
    mode: "参数校验",
    args: [
      "asset-center",
      "download",
      "--id",
      sampleAssetId,
      "--quiet",
      "--workspace-id",
      workspaceId,
    ],
    expect: 2,
  },
  {
    category: "校验",
    command: "asset-center oss bind (BEFORE_DAYS 缺 before-days)",
    mode: "参数校验",
    args: [
      "asset-center",
      "oss",
      "bind",
      "--bucket",
      "b",
      "--region",
      "cn-hangzhou",
      "--path-prefix",
      "p/",
      "--policy",
      "BEFORE_DAYS",
      "--workspace-id",
      workspaceId,
    ],
    expect: 2,
  },
];

console.log(`\n🔍 Asset Center 命令调试 — workspace: ${workspaceId}`);
console.log(`📦 样本 asset-id: ${sampleAssetId}\n`);

const results = [];
for (const testCase of cases) {
  process.stdout.write(`  running: ${testCase.command} ... `);
  const result = runBl(testCase.args);
  const pass = result.exitCode === testCase.expect;
  console.log(pass ? "ok" : `FAIL (exit ${result.exitCode})`);
  results.push({ ...testCase, ...result, pass });
}

const passed = results.filter((row) => row.pass).length;
const failed = results.filter((row) => !row.pass).length;

// Markdown report
const lines = [
  `# Asset Center 命令测试报告`,
  ``,
  `- **测试时间**: ${new Date().toISOString().replace("T", " ").slice(0, 19)} (UTC)`,
  `- **Workspace**: \`${workspaceId}\``,
  `- **样本 Asset ID**: \`${sampleAssetId}\``,
  `- **策略**: 只读命令真实调用；写操作/下载/OSS 变更一律 \`--dry-run\``,
  `- **汇总**: ${passed} 通过 / ${failed} 失败 / ${results.length} 总计`,
  ``,
  `## 测试结果`,
  ``,
  `| # | 分类 | 命令 | 模式 | 状态 | Exit | 耗时 | 结果摘要 |`,
  `|---|------|------|------|------|------|------|----------|`,
];

results.forEach((row, index) => {
  lines.push(
    `| ${index + 1} | ${row.category} | \`${row.command}\` | ${row.mode} | ${status(row.exitCode, row.expect)} | ${row.exitCode} | ${row.durationMs}ms | ${summarizeOutput(row).replace(/\|/g, "\\|")} |`,
  );
});

if (failed > 0) {
  lines.push(``, `## 失败详情`, ``);
  for (const row of results.filter((row) => !row.pass)) {
    lines.push(`### ${row.command}`, ``);
    lines.push(`**stderr:**`, `\`\`\``, row.stderr || "(empty)", `\`\`\``, ``);
    lines.push(`**stdout:**`, `\`\`\``, row.stdout.slice(0, 500) || "(empty)", `\`\`\``, ``);
  }
}

lines.push(
  ``,
  `## 模式说明`,
  ``,
  `| 模式 | 说明 |`,
  `|------|------|`,
  `| 真实调用 | 只读 API，不修改数据 |`,
  `| dry-run | 输出 \`{ api, data, gateway }\` 请求体，不发起写操作 |`,
  `| 参数校验 | 预期 exit code 2（用法错误） |`,
);

const reportPath = join(root, "packages/commands/src/commands/asset-center/TEST-REPORT.md");
writeFileSync(reportPath, lines.join("\n"));
console.log(`\n📄 Report written: ${reportPath}`);
console.log(`✅ ${passed} passed, ❌ ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
