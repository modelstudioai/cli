import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { IMAGE_ROUTES, VIDEO_ROUTES, type E2eRouteExports } from "./topic-routes.ts";

interface WatermarkScenario {
  name: string;
  routes: E2eRouteExports;
  args: string[];
}

const scenarios: WatermarkScenario[] = [
  {
    name: "image generate",
    routes: IMAGE_ROUTES,
    args: ["image", "generate", "--prompt", "A cat"],
  },
  {
    name: "image edit",
    routes: IMAGE_ROUTES,
    args: [
      "image",
      "edit",
      "--image",
      "https://example.com/input.png",
      "--prompt",
      "Blue background",
    ],
  },
  {
    name: "video generate",
    routes: VIDEO_ROUTES,
    args: ["video", "generate", "--prompt", "A cat waves"],
  },
  {
    name: "video edit",
    routes: VIDEO_ROUTES,
    args: ["video", "edit", "--video", "https://example.com/input.mp4", "--prompt", "Warm colors"],
  },
  {
    name: "video ref",
    routes: VIDEO_ROUTES,
    args: [
      "video",
      "ref",
      "--image",
      "https://example.com/person.png",
      "--prompt",
      "Image 1 waves",
    ],
  },
];

describe("e2e: global watermark config", () => {
  for (const scenario of scenarios) {
    test(`${scenario.name} uses watermark=false from the selected Profile`, async () => {
      const configDir = mkdtempSync(join(tmpdir(), "bl-watermark-profile-"));
      try {
        writeFileSync(
          join(configDir, "config.json"),
          JSON.stringify({ media: { watermark: false } }, null, 2) + "\n",
        );
        const { stdout, stderr, exitCode } = await runCommandE2e(
          scenario.routes,
          [...scenario.args, "--config", "media", "--dry-run", "--output", "json"],
          { BAILIAN_CONFIG_DIR: configDir },
        );
        expect(exitCode, stderr).toBe(0);
        const data = parseStdoutJson<{
          request?: { parameters?: { watermark?: boolean } };
        }>(stdout);
        expect(data.request?.parameters?.watermark).toBe(false);
      } finally {
        rmSync(configDir, { recursive: true, force: true });
      }
    });
  }
});
