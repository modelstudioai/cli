import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { runCommandE2e, runCommandInProcess } from "./helpers.ts";
import {
  CONFIG_ROUTES,
  KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES,
  MANAGED_AGENT_MEMORY_ROUTES,
  QUOTA_ROUTES,
} from "./topic-routes.ts";

const captureEnvironment = {
  NODE_OPTIONS: undefined,
  HTTP_PROXY: undefined,
  HTTPS_PROXY: undefined,
  http_proxy: undefined,
  https_proxy: undefined,
};

const cases = [
  { name: "group help", routes: QUOTA_ROUTES, args: ["quota", "--help"] },
  {
    name: "supplied flag usage error",
    routes: QUOTA_ROUTES,
    args: ["quota", "list", "--unsupported", "--output", "json"],
  },
  {
    name: "required flag usage error",
    routes: CONFIG_ROUTES,
    args: ["config", "set", "--quiet", "--output", "json"],
  },
  {
    name: "config dry-run",
    routes: CONFIG_ROUTES,
    args: [
      "config",
      "set",
      "--key",
      "watermark",
      "--value",
      "false",
      "--dry-run",
      "--output",
      "json",
    ],
  },
  {
    name: "command validation",
    routes: KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES,
    args: [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "fixture",
      "--content",
      "hello",
      "--field",
      "column=1",
      "--workspace-id",
      "fixture",
      "--dry-run",
      "--output",
      "json",
    ],
  },
];

test.each(cases)(
  "in-process $name matches the real CLI subprocess exactly",
  async ({ routes, args }) => {
    const directory = mkdtempSync(join(tmpdir(), "bl-command-parity-"));
    try {
      const environment = {
        ...captureEnvironment,
        BAILIAN_CONFIG_DIR: directory,
        DASHSCOPE_API_KEY: "",
        BAILIAN_E2E: "0",
      };
      const subprocess = await runCommandE2e(routes, args, environment);
      const inProcess = await runCommandInProcess(routes, args, environment);
      expect(inProcess).toEqual(subprocess);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("profile-language errors match in-process and subprocess output", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bl-command-locale-parity-"));
  try {
    writeFileSync(
      join(directory, "config.json"),
      JSON.stringify({ language: "en-US", work: { language: "zh-CN" } }),
    );
    const args = ["--config", "work", "quota", "list", "--unsupported", "--output", "json"];
    const environment = { ...captureEnvironment, BAILIAN_CONFIG_DIR: directory };
    const result = await runCommandInProcess(QUOTA_ROUTES, args, environment);
    expect(result).toEqual(await runCommandE2e(QUOTA_ROUTES, args, environment));
    expect(result.stderr).toContain("未知参数");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each(["in-process", "subprocess", "preload fallback"])(
  "%s resolves content files from the supplied cwd and restores the caller",
  async (mode) => {
    const directory = mkdtempSync(join(tmpdir(), "bl-command-cwd-"));
    const originalCwd = process.cwd();
    const originalEnvironment = { ...process.env };
    try {
      writeFileSync(join(directory, "notes.txt"), "relative memory content");
      const environment = {
        ...captureEnvironment,
        NODE_OPTIONS: mode === "preload fallback" ? "--no-warnings" : undefined,
        NODE_USE_ENV_PROXY: "0",
        BAILIAN_CONFIG_DIR: directory,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
        BAILIAN_API_KEY: "",
        BAILIAN_BASE_URL: "",
        BAILIAN_E2E: "0",
      };
      const runner = mode === "subprocess" ? runCommandE2e : runCommandInProcess;
      const result = await runner(
        MANAGED_AGENT_MEMORY_ROUTES,
        [
          "managed-agent",
          "memory-store",
          "memories",
          "update",
          "--store-id",
          "store-test",
          "--memory-id",
          "memory-test",
          "--content-file",
          "./notes.txt",
          "--workspace-id",
          "workspace-test",
          "--dry-run",
          "--output",
          "json",
        ],
        environment,
        { cwd: directory },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        request: { content: "relative memory content" },
      });
      expect(process.cwd()).toBe(originalCwd);
      expect(process.env).toEqual(originalEnvironment);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("Node preloads retain the real subprocess contract", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bl-command-preload-"));
  // esbuild workers also inherit NODE_OPTIONS on cache misses; only the CLI main thread marks startup.
  const preload =
    'import { isMainThread } from "node:worker_threads"; if (isMainThread) process.stdout.write("preload marker\\n");';
  try {
    for (const disableCache of [undefined, "1"]) {
      const result = await runCommandInProcess(QUOTA_ROUTES, ["quota", "--help"], {
        BAILIAN_CONFIG_DIR: directory,
        TSX_DISABLE_CACHE: disableCache,
        NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(preload)}`,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("preload marker\n");
      expect(result.stderr).toContain("Usage: bl quota");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
