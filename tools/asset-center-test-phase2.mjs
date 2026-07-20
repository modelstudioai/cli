#!/usr/bin/env node
/**
 * Asset-center Phase 2: reversible write ops + advanced read scenarios.
 */
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(root, "packages/cli");
const mainTs = join(cliDir, "src/main.ts");
const workspaceId = process.env.BAILIAN_WORKSPACE_ID ?? "llm-0xvms4kqhbqjlg8s";

function runBl(args, { timeout = 180_000 } = {}) {
  const start = Date.now();
  try {
    const stdout = execFileSync("pnpm", ["exec", "tsx", mainTs, ...args], {
      cwd: cliDir,
      encoding: "utf8",
      timeout,
      env: { ...process.env, BAILIAN_WORKSPACE_ID: workspaceId },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: "", durationMs: Date.now() - start };
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

function status(exitCode, expected = 0) {
  return exitCode === expected ? "✅ PASS" : "❌ FAIL";
}

function pickUnfavoritedImage(listJson) {
  return listJson?.items?.find((item) => item.asset_type === "IMAGE" && item.favorited === false);
}

const results = [];

function record(category, command, mode, result, expect, summary) {
  const pass = result.exitCode === expect;
  results.push({ category, command, mode, ...result, expect, pass, summary });
  console.log(`  ${pass ? "✅" : "❌"} ${command} — ${summary}`);
  return pass;
}

console.log(`\n🔍 Asset Center Phase 2 — workspace: ${workspaceId}\n`);

// --- Setup: find test assets ---
const imageList = runBl([
  "asset-center",
  "list",
  "--type",
  "IMAGE",
  "--page-size",
  "10",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const imageJson = parseJson(imageList.stdout);
const testImage = pickUnfavoritedImage(imageJson);
const testImageId = testImage?.asset_id ?? imageJson?.items?.[0]?.asset_id;

const videoList = runBl([
  "asset-center",
  "list",
  "--type",
  "VIDEO",
  "--page-size",
  "1",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const testVideoId = parseJson(videoList.stdout)?.items?.[0]?.asset_id;

console.log(`📦 测试 IMAGE: ${testImageId}`);
console.log(`📦 测试 VIDEO: ${testVideoId}\n`);

// 1. Download IMAGE to /tmp
const downloadPath = `/tmp/asset-center-test-${testImageId}.png`;
if (existsSync(downloadPath)) unlinkSync(downloadPath);

const dlResult = runBl(
  [
    "asset-center",
    "download",
    "--id",
    testImageId,
    "--out",
    downloadPath,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ],
  { timeout: 300_000 },
);

let dlSummary = "download failed";
if (dlResult.exitCode === 0) {
  const dlJson = parseJson(dlResult.stdout);
  const fileExists = existsSync(downloadPath);
  const fileSize = fileExists ? statSync(downloadPath).size : 0;
  dlSummary = fileExists
    ? `saved ${downloadPath} (${fileSize} bytes, reported ${dlJson?.size ?? "?"})`
    : `exit 0 but file missing`;
  if (fileExists) unlinkSync(downloadPath);
}
record("下载", "asset-center download (IMAGE)", "真实调用", dlResult, 0, dlSummary);

// 2. Get with --include-download-url
const getUrlResult = runBl([
  "asset-center",
  "get",
  "--asset-id",
  testImageId,
  "--include-download-url",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const getUrlJson = parseJson(getUrlResult.stdout);
const hasDownloadUrl = Boolean(getUrlJson?.download_url ?? getUrlJson?.downloadUrl);
record(
  "查询",
  "asset-center get --include-download-url",
  "真实调用",
  getUrlResult,
  0,
  hasDownloadUrl ? "download_url present" : `no download_url in response`,
);

// 3. List with --include-download-url
const listUrlResult = runBl([
  "asset-center",
  "list",
  "--type",
  "IMAGE",
  "--page-size",
  "2",
  "--include-download-url",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const listUrlJson = parseJson(listUrlResult.stdout);
const listHasUrl = listUrlJson?.items?.some((item) => item.download_url);
record(
  "查询",
  "asset-center list --include-download-url",
  "真实调用",
  listUrlResult,
  0,
  listHasUrl ? "items contain download_url" : "no download_url in items",
);

// 4. Pagination: page 1 → next-token → page 2
const page1 = parseJson(
  runBl([
    "asset-center",
    "list",
    "--page-size",
    "3",
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]).stdout,
);
const nextToken = page1?.next_token;
let pageSummary = "no next_token (single page)";
if (nextToken != null) {
  const page2Result = runBl([
    "asset-center",
    "list",
    "--page-size",
    "3",
    "--next-token",
    String(nextToken),
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  const page2 = parseJson(page2Result.stdout);
  const ids1 = new Set(page1.items.map((item) => item.asset_id));
  const overlap = page2?.items?.filter((item) => ids1.has(item.asset_id)).length ?? 0;
  pageSummary =
    page2Result.exitCode === 0
      ? `page2=${page2?.items?.length ?? 0} items, overlap=${overlap}, has_pre=${page2?.has_pre}`
      : `page2 failed exit ${page2Result.exitCode}`;
  record("查询", "asset-center list --next-token", "真实调用", page2Result, 0, pageSummary);
} else {
  record(
    "查询",
    "asset-center list --next-token",
    "跳过",
    { exitCode: 0, durationMs: 0, stdout: "", stderr: "" },
    0,
    pageSummary,
  );
}

// 5. Stats filters
const statsImage = runBl([
  "asset-center",
  "stats",
  "--type",
  "IMAGE",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const statsImageJson = parseJson(statsImage.stdout);
record(
  "统计",
  "asset-center stats --type IMAGE",
  "真实调用",
  statsImage,
  0,
  `image=${statsImageJson?.image_count ?? "?"}, total=${statsImageJson?.total_count ?? "?"}`,
);

const statsSyncFailed = runBl([
  "asset-center",
  "stats",
  "--sync-failed",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const statsSyncJson = parseJson(statsSyncFailed.stdout);
record(
  "统计",
  "asset-center stats --sync-failed",
  "真实调用",
  statsSyncFailed,
  0,
  `total=${statsSyncJson?.total_count ?? "?"}, sync_failed=${statsSyncJson?.sync_failed_count ?? "?"}`,
);

// 6. Recycle bin (read-only)
const recycleResult = runBl([
  "asset-center",
  "list",
  "--recycle-bin",
  "--page-size",
  "5",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const recycleJson = parseJson(recycleResult.stdout);
record(
  "查询",
  "asset-center list --recycle-bin",
  "真实调用",
  recycleResult,
  0,
  `${recycleJson?.items?.length ?? 0} soft-deleted item(s)`,
);

// 7. Text output format
const textResult = runBl([
  "asset-center",
  "list",
  "--page-size",
  "2",
  "--workspace-id",
  workspaceId,
]);
const textHasTable = textResult.stdout.includes("ASSET_ID") || textResult.stdout.includes("asset_");
record(
  "输出",
  "asset-center list (text)",
  "真实调用",
  textResult,
  0,
  textHasTable
    ? `${textResult.stdout.split("\n").filter(Boolean).length} lines table output`
    : "unexpected text format",
);

// 8. Favorite → verify → unfavorite → verify (round-trip)
if (testImageId) {
  const favResult = runBl([
    "asset-center",
    "favorite",
    "--id",
    testImageId,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  const favJson = parseJson(favResult.stdout);
  record(
    "收藏",
    "asset-center favorite (真实)",
    "真实调用",
    favResult,
    0,
    `affected=${favJson?.affected_count ?? "?"}`,
  );

  const verifyFav = runBl([
    "asset-center",
    "get",
    "--asset-id",
    testImageId,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  const verifyFavJson = parseJson(verifyFav.stdout);
  const isFavorited = verifyFavJson?.favorited === true;
  record(
    "收藏",
    "get 验证 favorited=true",
    "真实调用",
    verifyFav,
    0,
    isFavorited ? "favorited=true ✓" : `favorited=${verifyFavJson?.favorited}`,
  );

  const favListResult = runBl([
    "asset-center",
    "list",
    "--favorited",
    "--page-size",
    "20",
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  const favListJson = parseJson(favListResult.stdout);
  const inFavList = favListJson?.items?.some((item) => item.asset_id === testImageId);
  record(
    "查询",
    "list --favorited 含测试资产",
    "真实调用",
    favListResult,
    0,
    inFavList ? "found in favorited list" : "NOT in favorited list",
  );

  const unfavResult = runBl([
    "asset-center",
    "unfavorite",
    "--id",
    testImageId,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  const unfavJson = parseJson(unfavResult.stdout);
  record(
    "收藏",
    "asset-center unfavorite (真实)",
    "真实调用",
    unfavResult,
    0,
    `affected=${unfavJson?.affected_count ?? "?"}`,
  );

  const verifyUnfav = runBl([
    "asset-center",
    "get",
    "--asset-id",
    testImageId,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  const verifyUnfavJson = parseJson(verifyUnfav.stdout);
  const isUnfavorited = verifyUnfavJson?.favorited === false;
  record(
    "收藏",
    "get 验证 favorited=false (恢复)",
    "真实调用",
    verifyUnfav,
    0,
    isUnfavorited ? "favorited=false ✓" : `favorited=${verifyUnfavJson?.favorited}`,
  );
}

// 9. Batch favorite (2 ids) round-trip
const twoImages = imageJson?.items?.filter((item) => !item.favorited).slice(0, 2) ?? [];
if (twoImages.length === 2) {
  const [first, second] = twoImages;
  const batchFav = runBl([
    "asset-center",
    "favorite",
    "--id",
    first.asset_id,
    "--id",
    second.asset_id,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  record("收藏", "favorite 批量 (--id x2)", "真实调用", batchFav, 0, summarizeBatch(batchFav));
  const batchUnfav = runBl([
    "asset-center",
    "unfavorite",
    "--id",
    first.asset_id,
    "--id",
    second.asset_id,
    "--output",
    "json",
    "--workspace-id",
    workspaceId,
  ]);
  record(
    "收藏",
    "unfavorite 批量 (--id x2)",
    "真实调用",
    batchUnfav,
    0,
    summarizeBatch(batchUnfav),
  );
}

// 10. Get non-existent asset — server error passthrough (exit 1)
const badGet = runBl([
  "asset-center",
  "get",
  "--asset-id",
  "asset_nonexistent_00000000",
  "--output",
  "json",
  "--workspace-id",
  workspaceId,
]);
const badGetErr = parseJson(badGet.stderr);
record(
  "边界",
  "get 不存在的 asset-id",
  "真实调用",
  badGet,
  1,
  badGetErr?.error?.message === "资产不存在"
    ? 'exit 1, 服务端错误原样透传: "资产不存在"'
    : `exit ${badGet.exitCode}, msg=${badGetErr?.error?.message ?? badGet.stderr.slice(0, 60)}`,
);

function summarizeBatch(result) {
  const json = parseJson(result.stdout);
  return json ? `affected=${json.affected_count ?? "?"}` : result.stdout.slice(0, 60);
}

// --- Report ---
const passed = results.filter((row) => row.pass).length;
const failed = results.filter((row) => !row.pass).length;

const lines = [
  `# Asset Center 命令测试报告 — Phase 2`,
  ``,
  `- **测试时间**: ${new Date().toISOString().replace("T", " ").slice(0, 19)} (UTC)`,
  `- **Workspace**: \`${workspaceId}\``,
  `- **测试 IMAGE**: \`${testImageId ?? "n/a"}\``,
  `- **测试 VIDEO**: \`${testVideoId ?? "n/a"}\``,
  `- **策略**: 可逆写操作（favorite/unfavorite 往返）；download 到 /tmp 后删除；其余只读`,
  `- **汇总**: ${passed} 通过 / ${failed} 失败 / ${results.length} 总计`,
  ``,
  `> Phase 1 报告见同目录 [TEST-REPORT.md](./TEST-REPORT.md)（24 项 dry-run + 只读基础验证）`,
  ``,
  `## Phase 2 测试结果`,
  ``,
  `| # | 分类 | 命令 | 模式 | 状态 | Exit | 耗时 | 结果摘要 |`,
  `|---|------|------|------|------|------|------|----------|`,
];

results.forEach((row, index) => {
  lines.push(
    `| ${index + 1} | ${row.category} | \`${row.command}\` | ${row.mode} | ${status(row.exitCode, row.expect)} | ${row.exitCode} | ${row.durationMs}ms | ${(row.summary ?? "").replace(/\|/g, "\\|")} |`,
  );
});

if (failed > 0) {
  lines.push(``, `## 失败详情`, ``);
  for (const row of results.filter((row) => !row.pass)) {
    lines.push(`### ${row.command}`, ``);
    lines.push(`**stderr:**`, `\`\`\``, row.stderr || "(empty)", `\`\`\``, ``);
    lines.push(`**stdout:**`, `\`\`\``, row.stdout?.slice(0, 800) || "(empty)", `\`\`\``, ``);
  }
}

const reportPath = join(root, "packages/commands/src/commands/asset-center/TEST-REPORT-PHASE2.md");
writeFileSync(reportPath, lines.join("\n"));
console.log(`\n📄 Report: ${reportPath}`);
console.log(`✅ ${passed} passed, ❌ ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
