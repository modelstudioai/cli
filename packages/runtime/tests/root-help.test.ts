import { readFileSync } from "fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import { createCli } from "../src/create-cli.ts";

// Count actual disk reads; config parsing and credential resolution remain real.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const scenarios: {
  label: string;
  config: Record<string, unknown>;
  args: string[];
  envKey?: string;
  authenticated: boolean;
}[] = [
  { label: "bare CLI without credentials", config: {}, args: [], authenticated: false },
  {
    label: "default API key",
    config: { api_key: "fixture-profile-key" },
    args: ["--help"],
    authenticated: true,
  },
  {
    label: "console-only credentials",
    config: { access_token: "fixture-console-token" },
    args: ["--help"],
    authenticated: true,
  },
  {
    label: "environment API key",
    config: {},
    args: ["--help"],
    envKey: "fixture-env-key",
    authenticated: true,
  },
  {
    label: "active named profile",
    config: { active_config: "work", work: { api_key: "fixture-work-key" } },
    args: ["--help"],
    authenticated: true,
  },
  {
    label: "explicit empty profile overrides default credentials",
    config: { api_key: "fixture-default-key", work: {} },
    args: ["--help", "--config", "work"],
    authenticated: false,
  },
  {
    label: "explicit default overrides active profile credentials",
    config: { active_config: "work", work: { api_key: "fixture-work-key" } },
    args: ["--config=default", "--help"],
    authenticated: false,
  },
];

for (const language of ["en-US", "zh-CN"] as const) {
  test.each(scenarios)(
    `root help reads config once and preserves ${language} $label`,
    async (scenario) => {
      const directory = await mkdtemp(join(tmpdir(), "root-help-"));
      const configPath = join(directory, "config.json");
      const profile = scenario.config.work as Record<string, unknown> | undefined;
      await writeFile(
        configPath,
        JSON.stringify({
          ...scenario.config,
          language,
          ...(profile ? { work: { ...profile, language } } : {}),
        }),
      );
      const isolated = buildIsolatedCliEnv({
        overrides: {
          BAILIAN_CONFIG_DIR: directory,
          DASHSCOPE_API_KEY: scenario.envKey ?? "",
          DASHSCOPE_BASE_URL: "",
          DASHSCOPE_OUTPUT: undefined,
          DASHSCOPE_QUIET: "0",
          DASHSCOPE_VERBOSE: "0",
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          NO_PROXY: "",
          http_proxy: "",
          https_proxy: "",
          all_proxy: "",
          no_proxy: "",
          NODE_USE_ENV_PROXY: "0",
          DO_NOT_TRACK: "1",
        },
      });
      const command = defineCommand({
        description: { "en-US": "Help fixture", "zh-CN": "帮助测试" },
        auth: "none",
        async run() {
          throw new Error("Help must not execute business code.");
        },
      });
      vi.mocked(readFileSync).mockClear();
      try {
        const result = await runInProcess(
          () =>
            createCli(
              { fixture: command },
              {
                binName: "test-cli",
                version: "0.0.0",
                clientName: "fixture",
                npmPackage: "fixture",
                quickStartTasks: ["示例任务\nFixture task"],
              },
            ).run(scenario.args),
          scenario.args,
          { env: isolated.env },
        );
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(language === "en-US" ? "Help fixture" : "帮助测试");
        expect(result.stderr.includes("Fixture task")).toBe(scenario.authenticated);
        expect(result.stderr.includes("test-cli auth login --console")).toBe(
          !scenario.authenticated,
        );
        expect(result.stderr).not.toContain("fixture-profile-key");
        const configReads = vi
          .mocked(readFileSync)
          .mock.calls.filter(([path]) => path === configPath);
        expect(configReads).toHaveLength(1);
      } finally {
        isolated.dispose();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
