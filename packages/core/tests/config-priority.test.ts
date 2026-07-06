import { expect, test } from "vite-plus/test";
import type { ConfigFile, Settings } from "../src/config/schema.ts";
import { buildSettings, type ResolutionSources } from "../src/config/loader.ts";
import { resolveApiKey, resolveConsole, resolveModelBaseUrl } from "../src/auth/resolver.ts";

// 行为锁定:锁住各字段的 flag/env/file 优先级链,统一为 flag>env>file>默认
// (baseUrl 原为 flag>file>env,2026-07 前置 commit 翻转)。buildSettings 与
// resolver 都是纯函数,sources 直接构造,无需环境隔离。

function src(s: {
  flags?: ResolutionSources["flags"];
  env?: Record<string, string>;
  file?: ConfigFile;
}): ResolutionSources {
  return { flags: s.flags ?? {}, file: s.file ?? {}, env: s.env ?? {} };
}

const resolve = (s: Parameters<typeof src>[0]): Settings => buildSettings(src(s));

test("baseUrl:flag > env > file > 默认(原为 flag>file>env,已归一)", () => {
  const flags = { baseUrl: "https://flag.example.com" };
  const env = { DASHSCOPE_BASE_URL: "https://env.example.com" };
  const file: ConfigFile = { base_url: "https://file.example.com" };
  expect(resolveModelBaseUrl(src({ flags, env, file }))).toBe("https://flag.example.com");
  expect(resolveModelBaseUrl(src({ env, file }))).toBe("https://env.example.com");
  expect(resolveModelBaseUrl(src({ file }))).toBe("https://file.example.com");
  expect(resolveModelBaseUrl(src({}))).toBe("https://dashscope.aliyuncs.com");
});

test("output:flag > env > file > text", () => {
  const env = { DASHSCOPE_OUTPUT: "json" };
  const file: ConfigFile = { output: "json" };
  expect(resolve({ flags: { output: "text" }, env, file }).output).toBe("text");
  expect(resolve({ env, file: { output: "text" } }).output).toBe("json");
  expect(resolve({ file }).output).toBe("json");
  expect(resolve({}).output).toBe("text");
});

test("timeout:flag > 合法 env > file > 300;非法 env 被跳过;非法 flag 抛错", () => {
  const file: ConfigFile = { timeout: 30 };
  expect(resolve({ flags: { timeout: 10 }, env: { DASHSCOPE_TIMEOUT: "20" }, file }).timeout).toBe(
    10,
  );
  expect(resolve({ env: { DASHSCOPE_TIMEOUT: "20" }, file }).timeout).toBe(20);
  expect(resolve({ env: { DASHSCOPE_TIMEOUT: "abc" }, file }).timeout).toBe(30);
  expect(resolve({ env: { DASHSCOPE_TIMEOUT: "-5" }, file }).timeout).toBe(30);
  expect(resolve({}).timeout).toBe(300);
  expect(() => resolve({ flags: { timeout: -1 } })).toThrow(/Timeout/);
});

test("workspaceId:flag > env > file(console 域 flag)", () => {
  const file: ConfigFile = { workspace_id: "ws-file" };
  const env = { BAILIAN_WORKSPACE_ID: "ws-env" };
  expect(resolve({ flags: { workspaceId: "ws-flag" }, env, file }).workspaceId).toBe("ws-flag");
  expect(resolve({ env, file }).workspaceId).toBe("ws-env");
  expect(resolve({ file }).workspaceId).toBe("ws-file");
  expect(resolve({}).workspaceId).toBeUndefined();
});

test("console 三元组:flag > file,无兜底(默认值由 gateway 层兜)", () => {
  const file: ConfigFile = {
    console_region: "cn-shanghai",
    console_site: "international",
    console_switch_agent: 111,
  };
  const fromFlags = resolve({
    flags: { consoleRegion: "ap-southeast-1", consoleSite: "domestic", consoleSwitchAgent: 222 },
    file,
  });
  expect(fromFlags.consoleRegion).toBe("ap-southeast-1");
  expect(fromFlags.consoleSite).toBe("domestic");
  expect(fromFlags.consoleSwitchAgent).toBe(222);
  const fromFile = resolve({ file });
  expect(fromFile.consoleRegion).toBe("cn-shanghai");
  expect(fromFile.consoleSite).toBe("international");
  expect(fromFile.consoleSwitchAgent).toBe(111);
  expect(resolve({}).consoleRegion).toBeUndefined();
  expect(resolve({}).consoleSite).toBeUndefined();
});

test("verbose:flag 或 DASHSCOPE_VERBOSE=1(无 file 源;env 非 1 不生效)", () => {
  expect(resolve({ flags: { verbose: true } }).verbose).toBe(true);
  expect(resolve({ env: { DASHSCOPE_VERBOSE: "1" } }).verbose).toBe(true);
  expect(resolve({ env: { DASHSCOPE_VERBOSE: "0" } }).verbose).toBe(false);
  expect(resolve({}).verbose).toBe(false);
});

test("telemetry:DO_NOT_TRACK=1 一票否决 > file > 默认 true", () => {
  expect(resolve({ env: { DO_NOT_TRACK: "1" }, file: { telemetry: true } }).telemetry).toBe(false);
  expect(resolve({ file: { telemetry: false } }).telemetry).toBe(false);
  expect(resolve({}).telemetry).toBe(true);
});

test("noColor:NO_COLOR 只看存在性(空串也算);非 TTY 下恒为 true", () => {
  expect(resolve({ env: { NO_COLOR: "" } }).noColor).toBe(true);
  if (!process.stdout.isTTY) expect(resolve({}).noColor).toBe(true);
});

test("apiKey 凭证:flag > env > file,source 字段随之;无 key 抛 AUTH", () => {
  const all = src({
    flags: { apiKey: "sk-flag" },
    env: { DASHSCOPE_API_KEY: "sk-env" },
    file: { api_key: "sk-file" },
  });
  expect(resolveApiKey(all)).toMatchObject({ token: "sk-flag", source: "flag" });
  const envFile = src({ env: { DASHSCOPE_API_KEY: "sk-env" }, file: { api_key: "sk-file" } });
  expect(resolveApiKey(envFile)).toMatchObject({ token: "sk-env", source: "env" });
  const fileOnly = src({ file: { api_key: "sk-file" } });
  expect(resolveApiKey(fileOnly)).toMatchObject({ token: "sk-file", source: "config" });
  expect(() => resolveApiKey(src({}))).toThrow(/No API key/);
});

test("console 凭证:token 仅 file 源;目标 flag > file > 默认;无 token 抛 AUTH", () => {
  const cred = resolveConsole(
    src({
      flags: { consoleRegion: "ap-southeast-1" },
      file: { access_token: "tok", console_site: "international", console_switch_agent: 7 },
    }),
  );
  expect(cred).toMatchObject({
    token: "tok",
    region: "ap-southeast-1",
    site: "international",
    switchAgent: 7,
  });
  expect(resolveConsole(src({ file: { access_token: "tok" } }))).toMatchObject({
    region: "cn-beijing",
    site: "domestic",
  });
  expect(() => resolveConsole(src({}))).toThrow(/console access token/);
});

test("default*Model / outputDir:仅 file 源", () => {
  const c = resolve({
    file: { default_text_model: "qwen-max", default_video_model: "wan-x", output_dir: "/tmp/out" },
  });
  expect(c.defaultTextModel).toBe("qwen-max");
  expect(c.defaultVideoModel).toBe("wan-x");
  expect(c.outputDir).toBe("/tmp/out");
  expect(resolve({}).defaultTextModel).toBeUndefined();
});

test("buildSettings:concurrent 仅 flag 源", () => {
  expect(resolve({ flags: { concurrent: 4 } }).concurrent).toBe(4);
  expect(resolve({}).concurrent).toBeUndefined();
});

test("quiet/yes/dryRun/async/nonInteractive:仅 flag 源,直通", () => {
  const on = resolve({
    flags: { quiet: true, yes: true, dryRun: true, async: true, nonInteractive: true },
  });
  expect(on).toMatchObject({
    quiet: true,
    yes: true,
    dryRun: true,
    async: true,
    nonInteractive: true,
  });
  const off = resolve({});
  expect(off).toMatchObject({
    quiet: false,
    yes: false,
    dryRun: false,
    async: false,
    nonInteractive: false,
  });
});
