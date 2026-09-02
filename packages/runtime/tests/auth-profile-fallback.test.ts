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
  await authStage(context, async () => {});
}

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
  expect(captured.output).toBe("");
  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-flag",
    baseUrl: "https://plan.example.com",
    source: "flag",
  });
});

test("authStage fallback 准确描述 Profile 文件层降级，--quiet 可抑制提示", async () => {
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
  expect(quiet.output).toBe("");
});

test("authStage 在 JSON 模式输出多行结构化 fallback warning", async () => {
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
  expect(captured.output).toMatch(/^\{\n {2}"warning": \{\n/);
  expect(JSON.parse(captured.output.trim())).toEqual({
    warning: {
      code: "PROFILE_API_KEY_FALLBACK",
      message:
        'Profile "company-plan" 不支持命令 "text chat"，本次将从 Profile "default" 读取 API Key 配置。',
      profile: "company-plan",
      command_path: ["text", "chat"],
      fallback_profile: "default",
      credential_fields: ["api_key", "base_url"],
    },
  });
});

test("authStage 在 DASHSCOPE_API_KEY 覆盖 Profile API Key 时不降级也不提示", async () => {
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
  expect(captured.output).toBe("");
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
])("authStage 在只有 $name 时不降级也不提示", async ({ flags, env, expectedBaseUrl }) => {
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
  expect(captured.output).toBe("");
  expect(context.client.exportApiCredential()).toMatchObject({
    token: "sk-plan",
    source: "config",
    baseUrl: expectedBaseUrl,
  });
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
