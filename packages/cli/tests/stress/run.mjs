#!/usr/bin/env node
/**
 * 批量压测统一入口：按 target 路由到 `targets/*.mjs`。
 *
 * 用法（在 monorepo 根）:
 *   pnpm run test:stress                    # 执行全部用例 + 套件总报告
 *   pnpm run test:stress -- list
 *   pnpm run test:stress -- text -- --count 10 -c 2
 *   pnpm run test:stress -- all -- --count 5 -c 2
 *   pnpm run test:stress -- video-edit --reuse-fixtures --setup-only
 */

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStressSuite } from "./lib/run-suite.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {string[]} argv
 */
function partitionStressArgv(argv) {
  /** @type {{ reuseFixtures?: boolean, setupOnly?: boolean, fixturesDir?: string, stressConfigPath?: string }} */
  const globals = {};
  const filtered = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reuse-fixtures") {
      globals.reuseFixtures = true;
      continue;
    }
    if (a === "--setup-only") {
      globals.setupOnly = true;
      continue;
    }
    if (a === "--fixtures-dir") {
      globals.fixturesDir = argv[++i];
      continue;
    }
    if (a.startsWith("--fixtures-dir=")) {
      globals.fixturesDir = a.slice("--fixtures-dir=".length);
      continue;
    }
    if (a === "--stress-config") {
      globals.stressConfigPath = argv[++i];
      continue;
    }
    if (a.startsWith("--stress-config=")) {
      globals.stressConfigPath = a.slice("--stress-config=".length);
      continue;
    }
    filtered.push(a);
  }

  const cleaned = filtered.filter((a) => a !== "--");

  const rawTarget = cleaned.shift();
  return { globals, target: rawTarget, forwarded: cleaned };
}

/** @type {Record<string, { file: string, canonical: string }>} */
const ROUTES = {
  all: { file: "__suite__", canonical: "all" },
  "run-all": { file: "__suite__", canonical: "all" },
  // 文本
  text: { file: "text-chat.mjs", canonical: "text" },
  "text-chat": { file: "text-chat.mjs", canonical: "text" },
  // 语音
  "speech-tts": { file: "speech-synthesize.mjs", canonical: "speech-tts" },
  "speech-synthesize": { file: "speech-synthesize.mjs", canonical: "speech-tts" },
  "speech-asr": { file: "speech-recognize.mjs", canonical: "speech-asr" },
  "speech-recognize": { file: "speech-recognize.mjs", canonical: "speech-asr" },
  // 图像
  "image-generate": { file: "image-generate.mjs", canonical: "image-generate" },
  "image-edit": { file: "image-edit.mjs", canonical: "image-edit" },
  // 视频
  "video-t2v": { file: "video-t2v.mjs", canonical: "video-t2v" },
  "video-generate": { file: "video-t2v.mjs", canonical: "video-t2v" },
  "video-i2v": { file: "video-i2v.mjs", canonical: "video-i2v" },
  "video-ref": { file: "video-ref.mjs", canonical: "video-ref" },
  "video-edit": { file: "video-edit.mjs", canonical: "video-edit" },
};

function printTargets() {
  console.log(`
压测目标（第一参数，省略或 all 表示跑全部用例并生成套件总报告）
--------------------------    ----------------------------------------
（无 / all）                  顺序执行全部 9 个用例 → SUITE_REPORT.md
text                         bl text chat
speech-tts                   bl speech synthesize
speech-asr                   bl speech recognize（需前置音频）
image-generate               bl image generate
image-edit                   bl image edit（需前置图）
video-t2v / video-generate   bl video generate 文生视频
video-i2v                    bl video generate --image（需前置图）
video-ref                    bl video ref（需前置图）
video-edit                   bl video edit（需前置短视频）

全局选项（可出现在任意顺序，会与 target 参数分离）：
  --reuse-fixtures           若当前批次 fixtures/prerequisites.json 已存在则跳过生成
  --setup-only               仅生成前置资源（适用于带 fixtures 的目标；套件模式不可用）
  --fixtures-dir <path>       使用已有目录下的 prerequisites.json（不复制）
  --stress-config <path>      压测 count/concurrency 配置文件（默认 stress.defaults.json）

示例：
  pnpm run test:stress
  pnpm run test:stress -- list
  pnpm run test:stress -- all -- --count 5 -c 2
  pnpm run test:stress -- image-generate -- --count 5 -c 1
  pnpm run test:stress -- video-edit --setup-only
`);
}

async function main() {
  const { globals, target, forwarded } = partitionStressArgv(process.argv);

  const t = target?.trim();

  if (t === "list" || t === "--help" || t === "-h") {
    printTargets();
    process.exit(0);
  }

  if (!t || t === "all" || t === "run-all") {
    await runStressSuite({ globals, forwarded });
    return;
  }

  const route = ROUTES[t];
  if (!route) {
    console.error(`未知 target: "${t}". 运行 pnpm run test:stress -- list 查看列表。`);
    process.exit(1);
  }

  if (route.file === "__suite__") {
    await runStressSuite({ globals, forwarded });
    return;
  }

  const modHref = pathToFileURL(join(__dirname, "targets", route.file)).href;
  const mod = await import(modHref);

  /** @type {(a: string[], c: object) => Promise<void>} */
  const runStress = mod.runStress;
  if (typeof runStress !== "function") {
    console.error(`${route.file} 未导出 runStress`);
    process.exit(1);
  }

  await runStress(forwarded, {
    canonicalTarget: route.canonical,
    globals,
    alias: t,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
