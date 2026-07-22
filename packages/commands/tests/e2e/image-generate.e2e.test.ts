import { describe, expect, test } from "vite-plus/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  e2eLabelFromMetaUrl,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { IMAGE_ROUTES } from "./topic-routes.ts";

/**
 * Image generate：先做 help / 分组等常规检测（不依赖密钥、不调生成接口）。
 * 需 DashScope + 媒体 E2E 的缺参、dry-run 与真实生成放在 skip 块内；
 * 真实生成用例保持原逻辑与顺序，放在块内最后。
 */

describe("e2e: image generate", () => {
  test("image generate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, ["image", "generate", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/generate|--prompt|--model/i);
  });

  test("Token Plan 默认使用 wan2.7-image 同步接口", async () => {
    const configDir = makeE2eOutputDir("image-generate-token-plan-default");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_image_model: "wan2.7-image",
        },
      }),
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      IMAGE_ROUTES,
      [
        "image",
        "generate",
        "--config",
        "token-plan",
        "--prompt",
        "一只猫",
        "--dry-run",
        "--output",
        "json",
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ mode?: string; request?: { model?: string } }>(stdout);
    expect(data.mode).toBe("sync");
    expect(data.request?.model).toBe("wan2.7-image");
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: image generate",
  () => {
    test("image generate 缺少 --prompt 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
        "image",
        "generate",
        "--model",
        "qwen-image-2.0",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("【qwen-image-2.0】图片生成", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const { stdout, stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
        "image",
        "generate",
        "--model",
        "qwen-image-2.0",
        "--prompt",
        "一只简笔画小猫，白底",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-gen",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ saved?: string[] }>(stdout);
      expect(data.saved?.length ?? 0).toBeGreaterThan(0);
      expect(data.saved?.[0]).toContain("e2e-gen");
    }, 300_000);
  },
);
