import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { makeE2eOutputDir, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { VISION_ROUTES } from "./topic-routes.ts";

describe("e2e: vision describe", () => {
  test("Token Plan 默认使用支持视觉理解的文本模型", async () => {
    const configDir = makeE2eOutputDir("vision-describe-token-plan-default");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_text_model: "qwen3.8-max",
        },
      }),
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      VISION_ROUTES,
      [
        "vision",
        "describe",
        "--config",
        "token-plan",
        "--image",
        "https://example.com/image.png",
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
    const data = parseStdoutJson<{ request?: { model?: string } }>(stdout);
    expect(data.request?.model).toBe("qwen3.8-max");
  });
});
