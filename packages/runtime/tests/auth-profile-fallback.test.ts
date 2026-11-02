import { createOutputReporter } from "../src/output/reporter.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  Client,
  buildSettings,
  buildSources,
  defineCommand,
  makeAuthStore,
  makeConfigStore,
  resolveModelBaseUrl,
  writeConfigFile,
  type CommandPackManager,
  type LocalizedText,
  type SourceFlags,
} from "bailian-cli-core";
import { authStage, type RunContext } from "../src/middleware.ts";

const tempDirs: string[] = [];
const originalConfigDir = process.env.BAILIAN_CONFIG_DIR;

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  if (originalConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
  else process.env.BAILIAN_CONFIG_DIR = originalConfigDir;
});

function useTempConfigDir(): void {
  const configDir = mkdtempSync(join(tmpdir(), "bl-auth-fallback-"));
  tempDirs.push(configDir);
  process.env.BAILIAN_CONFIG_DIR = configDir;
}

function makeContext(
  path: string[],
  flags: Partial<SourceFlags> = { config: "company-plan" },
  env: NodeJS.ProcessEnv = {},
): RunContext {
  const sources = buildSources(flags);
  sources.env = env;
  const settings = { ...buildSettings(sources), quiet: true };
  const command = defineCommand({
    description: "test command",
    auth: "apiKey",
    async run() {},
  });
  return {
    identity: {
      binName: "bl",
      version: "test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli-test",
    },
    output: createOutputReporter({ settings }).output,
    path,
    command,
    flags: {},
    confirmed: false,
    localize: (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
    settings,
    sources,
    configStore: makeConfigStore(sources.configName),
    authStore: makeAuthStore(sources),
    commandPacks: {} as CommandPackManager,
    client: new Client({
      identity: {
        binName: "bl",
        version: "test",
        npmPackage: "bailian-cli",
        clientName: "bailian-cli-test",
      },
      settings,
      baseUrl: resolveModelBaseUrl(sources),
    }),
  };
}

async function runAuth(context: RunContext): Promise<void> {
  Object.assign(context, {
    output: createOutputReporter({
      settings: context.settings,
      localize: (text) =>
        typeof text === "string" ? text : text[context.sources.file.language ?? "en-US"],
    }).output,
  });
  await authStage(context, async () => {});
}

test.each([undefined, "https://default.example.com", "https://dashscope.aliyuncs.com"])(
  "service defaults follow the effective profile base URL after capability fallback: %s",
  async (defaultBaseUrl) => {
    useTempConfigDir();
    await writeConfigFile({ api_key: "sk-default", base_url: defaultBaseUrl });
    await writeConfigFile(
      {
        api_key: "sk-plan",
        base_url: "https://plan.example.com",
        api_key_capabilities: ["text.chat"],
      },
      "company-plan",
    );
    const context = makeContext(["sandbox", "list"]);
    await runAuth(context);
    expect(context.client.url("/service", () => "https://workspace.example.test")).toBe(
      `${defaultBaseUrl ?? "https://workspace.example.test"}/service`,
    );
    expect(context.client.exportApiCredential()?.token).toBe("sk-default");
  },
);

async function captureStderr(operation: () => Promise<void>): Promise<{
  output: string;
  error?: unknown;
}> {
  const chunks: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await operation();
    return { output: chunks.join("") };
  } catch (error) {
    return { output: chunks.join(""), error };
  } finally {
    process.stderr.write = originalWrite;
  }
}

test("authStage 为不支持的 capability 注入 default API Key，同时保留所选 Profile settings", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
  await writeConfigFile(
    {
      api_key: "sk-plan",
      base_url: "https://plan.example.com",
      default_text_model: "plan-text-model",
      api_key_capabilities: ["image.generate"],
    },
    "company-plan",
  );
  const context = makeContext(["text", "chat"]);

  await runAuth(context);

  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-default",
    baseUrl: "https://default.example.com",
    source: "config",
  });
  expect(context.settings).toMatchObject({
    configName: "company-plan",
    defaultTextModel: "plan-text-model",
  });
});

test("authStage 为支持的 capability 保留所选 Profile API Key", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default" });
  await writeConfigFile(
    { api_key: "sk-plan", api_key_capabilities: ["image.generate"] },
    "company-plan",
  );
  const context = makeContext(["image", "generate"]);

  await runAuth(context);

  expect(context.client.exportApiCredential()?.token).toBe("sk-plan");
});

test("authStage 不为缺少 capability 字段的旧 token-plan 注入内置 preset", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
  await writeConfigFile(
    { api_key: "sk-token-plan", base_url: "https://token-plan.example.com" },
    "token-plan",
  );

  const context = makeContext(["search", "web"], { config: "token-plan" });
  await runAuth(context);
  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-token-plan",
    baseUrl: "https://token-plan.example.com",
  });
});

test("authStage 在 --api-key 覆盖 Profile API Key 时跳过 capability fallback", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
  await writeConfigFile(
    {
      api_key: "sk-plan",
      base_url: "https://plan.example.com",
      api_key_capabilities: ["image.generate"],
    },
    "company-plan",
  );
  const context = makeContext(["text", "chat"], {
    config: "company-plan",
    apiKey: "sk-flag",
  });
  context.settings.quiet = false;

  const captured = await captureStderr(() => runAuth(context));

  expect(captured.error).toBeUndefined();
  // Cross-source warning expected; capability fallback must still be skipped.
  expect(captured.output).toContain("api_key and base_url are resolved from different sources");
  expect(captured.output).not.toContain("PROFILE_API_KEY_FALLBACK");
  expect(captured.output).not.toContain("does not support command");
  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-flag",
    baseUrl: "https://plan.example.com",
    source: "flag",
  });
});

test("authStage fallback 准确描述 Profile 文件层降级，--quiet 保留警告", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default" });
  await writeConfigFile(
    {
      language: "zh-CN",
      api_key: "sk-plan",
      api_key_capabilities: ["image.generate"],
    },
    "company-plan",
  );
  const visibleContext = makeContext(["text", "chat"]);
  visibleContext.settings.quiet = false;
  const visible = await captureStderr(() => runAuth(visibleContext));
  expect(visible.error).toBeUndefined();
  expect(visible.output).toContain(
    'Profile "company-plan" 不支持命令 "text chat"，本次将从 Profile "default" 读取 API Key 配置。',
  );
  expect(visible.output).not.toContain("正在使用");

  const quietContext = makeContext(["text", "chat"]);
  const quiet = await captureStderr(() => runAuth(quietContext));
  expect(quiet.error).toBeUndefined();
  expect(quiet.output).toContain("company-plan");
});

test("authStage 在 JSON 模式输出单行结构化 fallback warning", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default" });
  await writeConfigFile(
    {
      language: "zh-CN",
      api_key: "sk-plan",
      api_key_capabilities: ["image.generate"],
    },
    "company-plan",
  );
  const context = makeContext(["text", "chat"]);
  context.settings.output = "json";
  context.settings.quiet = false;

  const captured = await captureStderr(() => runAuth(context));

  expect(captured.error).toBeUndefined();
  expect(captured.output.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(captured.output.trim())).toEqual({
    warning: {
      code: "PROFILE_API_KEY_FALLBACK",
      message:
        'Profile "company-plan" 不支持命令 "text chat"，本次将从 Profile "default" 读取 API Key 配置。',
      details: {
        profile: "company-plan",
        command_path: ["text", "chat"],
        fallback_profile: "default",
        credential_fields: ["api_key", "base_url"],
      },
    },
  });
});

test("authStage 在 DASHSCOPE_API_KEY 覆盖 Profile API Key 时不降级，但跨源会告警", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
  await writeConfigFile(
    {
      api_key: "sk-plan",
      base_url: "https://plan.example.com",
      api_key_capabilities: ["image.generate"],
    },
    "company-plan",
  );
  const context = makeContext(
    ["text", "chat"],
    { config: "company-plan" },
    { DASHSCOPE_API_KEY: "sk-env" },
  );
  context.settings.quiet = false;

  const captured = await captureStderr(() => runAuth(context));

  expect(captured.error).toBeUndefined();
  expect(captured.output).toContain("api_key and base_url are resolved from different sources");
  expect(captured.output).not.toContain("PROFILE_API_KEY_FALLBACK");
  expect(captured.output).not.toContain("does not support command");
  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-env",
    source: "env",
    baseUrl: "https://plan.example.com",
  });
});

test.each([
  {
    name: "--base-url",
    flags: { config: "company-plan", baseUrl: "https://flag.example.com" },
    env: {},
    expectedBaseUrl: "https://flag.example.com",
  },
  {
    name: "DASHSCOPE_BASE_URL",
    flags: { config: "company-plan" },
    env: { DASHSCOPE_BASE_URL: "https://env.example.com" },
    expectedBaseUrl: "https://env.example.com",
  },
])("authStage 在只有 $name 时不降级，但跨源会告警", async ({ flags, env, expectedBaseUrl }) => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
  await writeConfigFile(
    {
      api_key: "sk-plan",
      base_url: "https://plan.example.com",
      api_key_capabilities: ["image.generate"],
    },
    "company-plan",
  );
  const context = makeContext(["text", "chat"], flags, env);
  context.settings.quiet = false;

  const captured = await captureStderr(() => runAuth(context));

  expect(captured.error).toBeUndefined();
  expect(captured.output).toContain("api_key and base_url are resolved from different sources");
  expect(captured.output).not.toContain("PROFILE_API_KEY_FALLBACK");
  expect(captured.output).not.toContain("does not support command");
  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-plan",
    source: "config",
    baseUrl: expectedBaseUrl,
  });
});

test("authStage 在 api_key 与 base_url 跨源时输出告警，quiet 保留警告", async () => {
  useTempConfigDir();
  await writeConfigFile({
    language: "zh-CN",
    api_key: "sk-file",
    base_url: "https://file.example.com",
  });
  const visibleContext = makeContext([], {}, { DASHSCOPE_API_KEY: "sk-env-key" });
  visibleContext.settings.quiet = false;
  const visible = await captureStderr(() => runAuth(visibleContext));
  expect(visible.error).toBeUndefined();
  expect(visible.output).toContain("警告:");
  expect(visible.output).toContain("api_key 和 base_url 来自不同配置源。");
  expect(visible.output).toContain("api_key ← 环境变量 (DASHSCOPE_API_KEY)");
  expect(visible.output).toContain("base_url ← 配置文件 (");
  expect(visible.output).toContain("bl config show");

  const quietContext = makeContext([], {}, { DASHSCOPE_API_KEY: "sk-env-key" });
  const quiet = await captureStderr(() => runAuth(quietContext));
  expect(quiet.error).toBeUndefined();
  expect(quiet.output).toContain("api_key 和 base_url 来自不同配置源。");
});

test.each([false, true])("authStage 在 JSON 模式输出跨源结构化 warning quiet=%s", async (quiet) => {
  useTempConfigDir();
  await writeConfigFile({
    language: "en-US",
    api_key: "sk-file",
    base_url: "https://file.example.com",
  });
  const context = makeContext([], {}, { DASHSCOPE_API_KEY: "sk-env-key" });
  context.settings.output = "json";
  context.settings.quiet = quiet;

  const captured = await captureStderr(() => runAuth(context));

  expect(captured.error).toBeUndefined();
  expect(captured.output.trim().split("\n")).toHaveLength(1);
  const parsed = JSON.parse(captured.output.trim()) as {
    warning: {
      code: string;
      details: { api_key_source: string; base_url_source: string };
      message: string;
    };
  };
  expect(parsed.warning.code).toBe("API_KEY_BASE_URL_SOURCE_MISMATCH");
  expect(parsed.warning.details.api_key_source).toBe("env");
  expect(parsed.warning.details.base_url_source).toBe("config");
  expect(parsed.warning.message).toContain("different sources");
  expect(parsed.warning.message).toContain("bl config show");
});

test("authStage 同源或仅 key 时不发出跨源告警", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-file", base_url: "https://file.example.com" });

  const sameSource = makeContext([], {});
  sameSource.settings.quiet = false;
  const same = await captureStderr(() => runAuth(sameSource));
  expect(same.error).toBeUndefined();
  expect(same.output).toBe("");

  await writeConfigFile({ api_key: "sk-file" });
  const keyOnlyFresh = makeContext([], {}, { DASHSCOPE_API_KEY: "sk-env-only" });
  keyOnlyFresh.settings.quiet = false;
  const onlyKey = await captureStderr(() => runAuth(keyOnlyFresh));
  expect(onlyKey.error).toBeUndefined();
  expect(onlyKey.output).not.toContain("different sources");
  expect(onlyKey.output).not.toContain("不同配置源");
});

test("authStage fallback 展示空格分隔的叶子命令路径", async () => {
  useTempConfigDir();
  await writeConfigFile({ api_key: "sk-default" });
  await writeConfigFile(
    { api_key: "sk-plan", api_key_capabilities: ["image.generate"] },
    "company-plan",
  );
  const context = makeContext(["speech", "synthesize"]);
  context.settings.quiet = false;

  const captured = await captureStderr(() => runAuth(context));

  expect(captured.error).toBeUndefined();
  expect(captured.output).toContain(
    'Profile "company-plan" does not support command "speech synthesize"; API Key settings will be read from Profile "default" for this run.',
  );
});

test("authStage fallback 后鉴权失败或 dry-run 时仍提供降级反馈", async () => {
  useTempConfigDir();
  await writeConfigFile({ base_url: "https://default.example.com" });
  await writeConfigFile(
    { api_key: "sk-plan", api_key_capabilities: ["image.generate"] },
    "company-plan",
  );

  const failedContext = makeContext(["text", "chat"]);
  failedContext.settings.quiet = false;
  const failed = await captureStderr(() => runAuth(failedContext));
  expect(String(failed.error)).toMatch(/No API key found/);
  expect(failed.output).toContain('command "text chat"');

  const dryRunContext = makeContext(["text", "chat"]);
  dryRunContext.settings.quiet = false;
  dryRunContext.settings.dryRun = true;
  const dryRun = await captureStderr(() => runAuth(dryRunContext));
  expect(dryRun.error).toBeUndefined();
  expect(dryRun.output).toContain('command "text chat"');
});
