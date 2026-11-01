import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import pkg from "../../package.json" with { type: "json" };
import { runCli } from "./helpers.ts";

const [majorVersion, minorVersion] = pkg.version
  .split(".")
  .map((part) => Number.parseInt(part, 10));
const latestVersion = `${majorVersion}.${minorVersion! + 1}.0`;

test.each(["text", "json"] as const)(
  "config list retains cached update warnings in %s, including the next process with quiet",
  async (format) => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-update-notice-"));
    try {
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ language: "en-US", telemetry: false }),
      );
      writeFileSync(
        join(configDir, "update-state.json"),
        JSON.stringify({
          lastChecked: Date.now(),
          latestVersion,
        }),
      );
      for (const quiet of [false, true]) {
        const result = await runCli(
          ["config", "list", "--output", format, ...(quiet ? ["--quiet"] : [])],
          {
            BAILIAN_CONFIG_DIR: configDir,
            DO_NOT_TRACK: "1",
            DASHSCOPE_OUTPUT: "",
            DASHSCOPE_QUIET: "0",
            DASHSCOPE_VERBOSE: "0",
            // Do not permit real installations even if update thresholds change in the future.
            BAILIAN_INSTALL_METHOD: "brew",
            HTTP_PROXY: "",
            HTTPS_PROXY: "",
            ALL_PROXY: "",
          },
        );
        expect(result.exitCode, result.stderr).toBe(0);
        if (format === "json") {
          expect(JSON.parse(result.stdout)).toMatchObject({
            active_config: "default",
            profiles: ["default"],
          });
          const records = result.stderr
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
          expect(records).toEqual([
            {
              warning: {
                code: "UPDATE_AVAILABLE",
                message: expect.stringContaining("Update available"),
                details: {
                  current_version: pkg.version,
                  latest_version: latestVersion,
                  upgrade_command: "bl update",
                },
              },
            },
          ]);
        } else {
          expect(result.stdout).toContain("default");
          expect(result.stderr).toContain("Update available");
          expect(result.stderr).toContain(`${pkg.version} → ${latestVersion}`);
          expect(result.stderr).toContain("bl update");
        }
      }
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  },
);
