import { expect, test } from "vite-plus/test";
import { parseConfigFile, type ConfigFile, type Settings } from "../src/config/schema.ts";
import { buildSettings, type ResolutionSources } from "../src/config/loader.ts";
import {
  resolveApiKey,
  resolveConsole,
  resolveModelBaseUrl,
  resolveOpenApi,
} from "../src/auth/resolver.ts";
import { getModelProfilePreset } from "../src/config/profile-presets.ts";

// 行为锁定:所有配置字段统一保持 flag>env>selected file>默认。`--config` 只选择
// file block,不提升该 block 的字段优先级。Profile 预设只在登录写入阶段使用。
// buildSettings 与 resolver 都是纯函数,sources 直接构造,无需环境隔离。

function src(s: {
  flags?: ResolutionSources["flags"];
  env?: Record<string, string>;
  file?: ConfigFile;
  configName?: string;
}): ResolutionSources {
  return {
    flags: s.flags ?? {},
    file: s.file ?? {},
    env: s.env ?? {},
    configName: s.configName,
  };
}

const resolve = (s: Parameters<typeof src>[0]): Settings => buildSettings(src(s));

test("token-plan Profile 预设保持固定", () => {
  expect(getModelProfilePreset("token-plan")).toEqual({
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com",
    defaultTextModel: "qwen3.8-max-preview",
    defaultVideoModel: "happyhorse-1.1-t2v",
    defaultImageToVideoModel: "happyhorse-1.1-i2v",
    defaultReferenceToVideoModel: "happyhorse-1.1-r2v",
    defaultImageModel: "wan2.7-image",
  });
});

test("baseUrl:flag > env > file > 默认，所有来源统一归一化", () => {
  const flags = { baseUrl: "https://flag.example.com/compatible-mode/v1?source=flag" };
  const env = { DASHSCOPE_BASE_URL: "https://env.example.com/apps/anthropic#env" };
  const file: ConfigFile = { base_url: "https://file.example.com/gateway/" };
  expect(resolveModelBaseUrl(src({ flags, env, file }))).toBe("https://flag.example.com");
  expect(resolveModelBaseUrl(src({ env, file }))).toBe("https://env.example.com");
  expect(resolveModelBaseUrl(src({ file }))).toBe("https://file.example.com");
  expect(resolveModelBaseUrl(src({}))).toBe("https://dashscope.aliyuncs.com");
});

test("baseUrl:非法 flag/env 在 resolver 边界报 usage error", () => {
  expect(() => resolveModelBaseUrl(src({ flags: { baseUrl: "not-a-url" } }))).toThrow(
    /Invalid model base URL/,
  );
  expect(() =>
    resolveModelBaseUrl(src({ env: { DASHSCOPE_BASE_URL: "file:///tmp/model" } })),
  ).toThrow(/Invalid model base URL/);
});

test("命名 config 仍保持 flag > env > selected file", () => {
  const env = {
    DASHSCOPE_BASE_URL: "https://env.example.com",
    DASHSCOPE_API_KEY: "sk-env",
  };
  const sources = src({
    configName: "token-plan",
    env,
    file: {
      api_key: "sk-token-plan",
      base_url: "https://profile.example.com",
      default_text_model: "custom-text",
      default_image_model: "custom-image",
    },
  });
  expect(resolveModelBaseUrl(sources)).toBe("https://env.example.com");
  expect(resolveApiKey(sources)).toMatchObject({
    token: "sk-env",
    baseUrl: "https://env.example.com",
    source: "env",
  });
  expect(buildSettings(sources)).toMatchObject({
    defaultTextModel: "custom-text",
    defaultImageModel: "custom-image",
  });
  expect(
    resolveApiKey(
      src({
        configName: "token-plan",
        flags: { apiKey: "sk-flag", baseUrl: "https://flag.example.com" },
        env,
        file: sources.file,
      }),
    ),
  ).toMatchObject({
    token: "sk-flag",
    baseUrl: "https://flag.example.com",
    source: "flag",
  });
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

test("openapi 凭证:按来源成对解析,flag > env > file;缺 id 或 secret 抛 AUTH", () => {
  const all = src({
    flags: { accessKeyId: "ak-flag", accessKeySecret: "secret-flag" },
    env: {
      ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-env",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-env",
    },
  });
  expect(resolveOpenApi(all)).toMatchObject({
    accessKeyId: "ak-flag",
    accessKeySecret: "secret-flag",
    source: "flag",
  });

  const envOnly = src({
    env: {
      ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-env",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-env",
    },
  });
  expect(resolveOpenApi(envOnly)).toMatchObject({
    accessKeyId: "ak-env",
    accessKeySecret: "secret-env",
    source: "env",
  });

  const fileOnly = src({
    file: {
      access_key_id: "ak-file",
      access_key_secret: "secret-file",
    },
  });
  expect(resolveOpenApi(fileOnly)).toMatchObject({
    accessKeyId: "ak-file",
    accessKeySecret: "secret-file",
    source: "config",
  });

  const legacyFileOnly = src({
    file: parseConfigFile({
      openapi_access_key_id: "ak-legacy-file",
      openapi_access_key_secret: "secret-legacy-file",
    }),
  });
  expect(resolveOpenApi(legacyFileOnly)).toMatchObject({
    accessKeyId: "ak-legacy-file",
    accessKeySecret: "secret-legacy-file",
    source: "config",
  });

  expect(() =>
    resolveOpenApi(
      src({
        flags: { accessKeyId: "ak-flag" },
        env: {
          ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-env",
          ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-env",
        },
        file: {
          access_key_id: "ak-file",
          access_key_secret: "secret-file",
        },
      }),
    ),
  ).toThrow(/Incomplete OpenAPI AK\/SK/);

  expect(() =>
    resolveOpenApi(
      src({
        env: { ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-env" },
        file: {
          access_key_id: "ak-file",
          access_key_secret: "secret-file",
        },
      }),
    ),
  ).toThrow(/Incomplete OpenAPI AK\/SK/);

  expect(() =>
    resolveOpenApi(
      src({
        file: {
          access_key_id: "ak-file",
        },
      }),
    ),
  ).toThrow(/Incomplete OpenAPI AK\/SK/);

  expect(() => resolveOpenApi(src({}))).toThrow(/No OpenAPI AK\/SK/);
  expect(() => resolveOpenApi(src({ env: { ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-env" } }))).toThrow(
    /Incomplete OpenAPI AK\/SK/,
  );
});

test("openapi 凭证:低优先级来源缺字段时不影响更高优先级成对凭证", () => {
  const completeFlagCred = src({
    flags: { accessKeyId: "ak-flag", accessKeySecret: "secret-flag" },
    env: { ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-env" },
  });
  expect(resolveOpenApi(completeFlagCred)).toMatchObject({
    accessKeyId: "ak-flag",
    accessKeySecret: "secret-flag",
    source: "flag",
  });

  const completeEnvCred = src({
    env: {
      ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-env",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-env",
    },
    file: { access_key_id: "ak-file" },
  });
  expect(resolveOpenApi(completeEnvCred)).toMatchObject({
    accessKeyId: "ak-env",
    accessKeySecret: "secret-env",
    source: "env",
  });
});

test("default*Model / outputDir:仅 file 源", () => {
  const c = resolve({
    file: parseConfigFile({
      default_text_model: "qwen-max",
      default_video_model: "wan-t2v",
      default_image_to_video_model: "wan-i2v",
      default_reference_to_video_model: "wan-r2v",
      output_dir: "/tmp/out",
    }),
  });
  expect(c.defaultTextModel).toBe("qwen-max");
  expect(c.defaultVideoModel).toBe("wan-t2v");
  expect(c.defaultImageToVideoModel).toBe("wan-i2v");
  expect(c.defaultReferenceToVideoModel).toBe("wan-r2v");
  expect(c.outputDir).toBe("/tmp/out");
  expect(resolve({}).defaultTextModel).toBeUndefined();
});

test("quiet/dryRun:仅 flag 源,直通", () => {
  const on = resolve({
    flags: { quiet: true, dryRun: true },
  });
  expect(on).toMatchObject({
    quiet: true,
    dryRun: true,
  });
  const off = resolve({});
  expect(off).toMatchObject({
    quiet: false,
    dryRun: false,
  });
});
