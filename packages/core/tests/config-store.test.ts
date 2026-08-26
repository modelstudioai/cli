import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, test } from "vite-plus/test";
import { makeConfigStore } from "../src/config/store.ts";
import { makeAuthStore } from "../src/auth/store.ts";
import { resolveApiKey } from "../src/auth/resolver.ts";
import { refreshAccessToken } from "../src/auth/refresh-token.ts";
import {
  buildSettings,
  buildSources,
  normalizeConfigName,
  readConfigFile,
  writeConfigFile,
  readConfigProfiles,
  activateConfigProfile,
  deleteConfigProfile,
  selectApiKeyResolutionSources,
} from "../src/config/loader.ts";
import { getConfigPath } from "../src/config/paths.ts";
import { getModelProfilePreset } from "../src/config/profile-presets.ts";

/** 在隔离的临时配置目录里执行,结束后恢复环境。 */
async function inTempConfigDir(fn: () => Promise<void>): Promise<void> {
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "bl-store-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("ConfigStore:write 合并写入,undefined 键删除,unset 删键", async () => {
  await inTempConfigDir(async () => {
    const store = makeConfigStore();
    await store.write({ output: "json", timeout: 60, workspace_id: "ws-1" });
    expect(store.read()).toMatchObject({ output: "json", timeout: 60, workspace_id: "ws-1" });

    await store.write({ output: "text", timeout: undefined });
    const after = store.read();
    expect(after.output).toBe("text");
    expect(after.timeout).toBeUndefined();

    await store.unset(["workspace_id"]);
    expect(store.read().workspace_id).toBeUndefined();
    expect(store.path.endsWith("config.json")).toBe(true);
  });
});

test("ConfigStore/AuthStore 写入前归一化 model Base URL", async () => {
  await inTempConfigDir(async () => {
    const configStore = makeConfigStore();
    await configStore.write({
      base_url: "https://proxy.example.com/bailian/compatible-mode/v1/?query=one#fragment",
    });
    expect(readConfigFile().base_url).toBe("https://proxy.example.com");
    expect(JSON.parse(readFileSync(getConfigPath(), "utf8")).base_url).toBe(
      "https://proxy.example.com",
    );

    const authStore = makeAuthStore(buildSources({}));
    await authStore.login({ base_url: "https://token.example.com/apps/anthropic/" });
    expect(readConfigFile().base_url).toBe("https://token.example.com");
    expect(JSON.parse(readFileSync(getConfigPath(), "utf8")).base_url).toBe(
      "https://token.example.com",
    );
  });
});

test("AuthStore:login 合并落盘,logout 按域清理并报告变更", async () => {
  await inTempConfigDir(async () => {
    const store = makeAuthStore({ flags: {}, file: {}, env: {} });
    await store.login({
      api_key: "sk-1",
      base_url: "https://model.example.com/compatible-mode/v1",
      access_token: "tok-1",
      access_key_id: "ak-1",
      access_key_secret: "secret-1",
      security_token: "sts-1",
      workspace_id: "ws-1",
      console_site: "international",
    });
    expect(makeConfigStore().read()).toMatchObject({
      api_key: "sk-1",
      base_url: "https://model.example.com",
      access_token: "tok-1",
      workspace_id: "ws-1",
      console_site: "international",
    });

    expect(await store.logout("console")).toBe(true);
    expect(makeConfigStore().read().access_token).toBeUndefined();
    expect(makeConfigStore().read().api_key).toBe("sk-1");
    expect(makeConfigStore().read().base_url).toBe("https://model.example.com");

    expect(await store.logout("openapi")).toBe(true);
    expect(makeConfigStore().read()).toMatchObject({ api_key: "sk-1" });
    expect(makeConfigStore().read().base_url).toBe("https://model.example.com");
    expect(makeConfigStore().read().access_key_id).toBeUndefined();
    expect(makeConfigStore().read().access_key_secret).toBeUndefined();
    expect(makeConfigStore().read().security_token).toBeUndefined();

    expect(await store.logout("all")).toBe(true);
    expect(makeConfigStore().read().api_key).toBeUndefined();
    expect(makeConfigStore().read().base_url).toBeUndefined();
    expect(await store.logout("all")).toBe(false);

    // 非凭证键不受 logout 影响
    expect(makeConfigStore().read().workspace_id).toBe("ws-1");
  });
});

test("AuthStore:未传 --config 时写当前激活项，显式配置在登录成功后创建并激活", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await writeConfigFile({ access_token: "tok-dev" }, "dev");
    await activateConfigProfile("dev");

    const activeStore = makeAuthStore(buildSources({}));
    await activeStore.login({ access_token: "tok-dev-updated", workspace_id: "ws-dev" });
    expect(readConfigFile("dev")).toMatchObject({
      access_token: "tok-dev-updated",
      workspace_id: "ws-dev",
    });
    expect(readConfigFile().api_key).toBe("sk-default");
    expect(readConfigFile().access_token).toBeUndefined();

    const newStore = makeAuthStore(buildSources({ config: "new-profile" }));
    await newStore.login({ access_token: "tok-new" });
    expect(readConfigFile("new-profile").access_token).toBe("tok-new");
    expect(readConfigProfiles().active).toBe("new-profile");

    const defaultStore = makeAuthStore(buildSources({ config: "default" }));
    await defaultStore.login({ api_key: "sk-default-updated" });
    expect(readConfigFile().api_key).toBe("sk-default-updated");
    expect(readConfigProfiles().active).toBe("default");

    expect(await activeStore.logout("console")).toBe(true);
    expect(readConfigFile("dev").access_token).toBeUndefined();
    expect(readConfigFile("new-profile").access_token).toBe("tok-new");
  });
});

test("Console access token 自动刷新只读取当前选中 Config 的 AK/SK", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({
      access_key_id: "ak-default",
      access_key_secret: "secret-default",
    });
    await writeConfigFile({ access_token: "expired-dev" }, "dev");
    await activateConfigProfile("dev");

    const sources = buildSources({});
    const refreshed = await refreshAccessToken({
      identity: {
        binName: "bl",
        version: "0.0.0-test",
        npmPackage: "bailian-cli",
        clientName: "bailian-cli-test",
      },
      settings: buildSettings(sources),
      baseUrl: "https://dashscope.aliyuncs.com",
    });

    expect(refreshed).toBeNull();
    expect(readConfigFile("dev").access_token).toBe("expired-dev");
  });
});

test("Console access token 自动刷新写回当前选中 Config", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ access_token: "tok-default" });
    await writeConfigFile(
      {
        access_token: "expired-dev",
        access_key_id: "ak-dev",
        access_key_secret: "secret-dev",
      },
      "dev",
    );
    await activateConfigProfile("dev");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ cliAccessToken: "refreshed-dev" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const sources = buildSources({});
      const refreshed = await refreshAccessToken({
        identity: {
          binName: "bl",
          version: "0.0.0-test",
          npmPackage: "bailian-cli",
          clientName: "bailian-cli-test",
        },
        settings: buildSettings(sources),
        baseUrl: "https://dashscope.aliyuncs.com",
      });

      expect(refreshed).toBe("refreshed-dev");
      expect(readConfigFile("dev").access_token).toBe("refreshed-dev");
      expect(readConfigFile().access_token).toBe("tok-default");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("ConfigStore:命名 config 与默认配置隔离且写入保留其它 block", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", output: "json" });
    await writeConfigFile({ api_key: "sk-prod", output: "text" }, "prod");

    const dev = makeConfigStore("dev");
    await dev.write({ api_key: "sk-dev", timeout: 120 });

    expect(makeConfigStore().read()).toMatchObject({ api_key: "sk-default", output: "json" });
    expect(dev.read()).toMatchObject({ api_key: "sk-dev", timeout: 120 });
    expect(makeConfigStore("prod").read()).toMatchObject({ api_key: "sk-prod", output: "text" });
    expect(readConfigFile("dev")).not.toMatchObject({ output: "json" });
    expect(dev.path).toBe(getConfigPath());
  });
});

test("AuthStore:login/logout 只影响当前命名 config", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", access_token: "tok-default" });
    const sources = buildSources({ config: "dev" });
    const store = makeAuthStore(sources);

    await store.login({ api_key: "sk-dev", access_token: "tok-dev", workspace_id: "ws-dev" });
    expect(makeConfigStore().read()).toMatchObject({
      api_key: "sk-default",
      access_token: "tok-default",
    });
    expect(makeConfigStore("dev").read()).toMatchObject({
      api_key: "sk-dev",
      access_token: "tok-dev",
      workspace_id: "ws-dev",
    });

    expect(await store.logout("console")).toBe(true);
    expect(makeConfigStore("dev").read().access_token).toBeUndefined();
    expect(makeConfigStore().read().access_token).toBe("tok-default");
  });
});

test("config name 校验拒绝路径穿越和 ConfigFile 字段冲突", () => {
  expect(normalizeConfigName("dev_1")).toBe("dev_1");
  expect(normalizeConfigName("default")).toBeUndefined();
  expect(() => normalizeConfigName("../evil")).toThrow(/Invalid config name/);
  expect(() => normalizeConfigName("api_key")).toThrow(/conflicts with a config key/);
  expect(() => normalizeConfigName("active_config")).toThrow(/conflicts with a config key/);
});

test("readConfigProfiles 分离 default 与 named,deleteConfigProfile 只删指定 block", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", output: "json" });
    await writeConfigFile({ api_key: "sk-prod" }, "prod");
    await writeConfigFile({ access_token: "tok-dev" }, "dev");

    const profiles = readConfigProfiles();
    expect(profiles.active).toBe("default");
    expect(profiles.default).toMatchObject({ api_key: "sk-default", output: "json" });
    expect(Object.keys(profiles.named).sort()).toEqual(["dev", "prod"]);
    expect(profiles.named.prod).toMatchObject({ api_key: "sk-prod" });
    expect(profiles.named.dev).toMatchObject({ access_token: "tok-dev" });

    expect(await deleteConfigProfile("prod")).toBe(true);
    const after = readConfigProfiles();
    expect(after.named.prod).toBeUndefined();
    expect(after.named.dev).toMatchObject({ access_token: "tok-dev" });
    expect(after.default).toMatchObject({ api_key: "sk-default" });
    // 再次删除不存在的 block 返回 false
    expect(await deleteConfigProfile("prod")).toBe(false);
    await expect(deleteConfigProfile("default")).rejects.toThrow(/Cannot delete the default/);
    await expect(deleteConfigProfile("api_key")).rejects.toThrow(/conflicts with a config key/);
    expect(readConfigFile().api_key).toBe("sk-default");
  });
});

test("active_config:未配置时使用 default，激活命名 Profile 后无 flag 自动选择", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await writeConfigFile({ api_key: "sk-token", default_text_model: "qwen3.7-max" }, "token-plan");

    expect(buildSources({}).configName).toBeUndefined();
    expect(await activateConfigProfile("token-plan")).toBe("token-plan");

    const activeSources = buildSources({});
    expect(activeSources.configName).toBe("token-plan");
    expect(activeSources.file.api_key).toBe("sk-token");
    expect(readConfigProfiles().active).toBe("token-plan");
  });
});

test("显式 --config 优先于 active_config，--config default 可绕过激活项", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await writeConfigFile({ api_key: "sk-active" }, "active");
    await writeConfigFile({ api_key: "sk-other" }, "other");
    await activateConfigProfile("active");

    const explicitDefault = buildSources({ config: "default" });
    expect(explicitDefault.configName).toBeUndefined();
    expect(explicitDefault.file.api_key).toBe("sk-default");

    const explicitActive = buildSources({ config: "active" });
    expect(explicitActive.configName).toBe("active");

    const explicitOther = buildSources({ config: "other" });
    expect(explicitOther.configName).toBe("other");
    expect(explicitOther.file.api_key).toBe("sk-other");
    expect(readConfigProfiles().active).toBe("active");
  });
});

test("激活不存在 Profile 不写盘；悬空 active_config 不静默回退", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await expect(activateConfigProfile("missing")).rejects.toThrow(/does not exist/);
    expect(readConfigProfiles().active).toBe("default");

    const configPath = getConfigPath();
    writeFileSync(
      configPath,
      JSON.stringify({ api_key: "sk-default", active_config: "missing" }, null, 2) + "\n",
    );
    expect(() => buildSources({})).toThrow(/Active config "missing" does not exist/);

    const explicitDefault = buildSources({ config: "default" });
    expect(explicitDefault.file.api_key).toBe("sk-default");
    expect(JSON.parse(readFileSync(configPath, "utf8")).active_config).toBe("missing");
  });
});

test("删除当前激活 Profile 时原子切回 default", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-dev" }, "dev");
    await activateConfigProfile("dev");

    expect(await deleteConfigProfile("dev")).toBe(true);
    expect(readConfigProfiles()).toMatchObject({ active: "default", named: {} });
    expect(buildSources({}).configName).toBeUndefined();
  });
});

test("buildSources 暴露命名 config 且 default 等价顶层", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", output: "json" });
    await writeConfigFile({ access_token: "tok-dev" }, "dev");

    const defaultSources = buildSources({ config: "default" });
    expect(defaultSources.configName).toBeUndefined();
    expect(defaultSources.file.api_key).toBe("sk-default");

    const devSources = buildSources({ config: "dev" });
    expect(devSources.configName).toBe("dev");
    expect(devSources.configPath).toBe(getConfigPath());
    expect(devSources.file.access_token).toBe("tok-dev");
    expect(devSources.file.api_key).toBeUndefined();
  });
});

test("API Key capability 白名单支持任意命名 Profile，并只替换 fallback 的 file 层", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
    await writeConfigFile(
      {
        api_key: "sk-company-plan",
        base_url: "https://plan.example.com",
        api_key_capabilities: ["image.generate"],
      },
      "company-plan",
    );

    const selectedSources = { ...buildSources({ config: "company-plan" }), env: {} };
    const supported = selectApiKeyResolutionSources(selectedSources, "image.generate");
    expect(supported).toMatchObject({ sources: { configName: "company-plan" } });
    expect(supported.sources.file.api_key).toBe("sk-company-plan");

    const fallback = selectApiKeyResolutionSources(selectedSources, "text.chat");
    expect(fallback.fallbackFrom).toBe("company-plan");
    expect(fallback.sources.configName).toBeUndefined();
    expect(fallback.sources.file).toMatchObject({
      api_key: "sk-default",
      base_url: "https://default.example.com",
    });
  });
});

test("API Key capability policy 缺失时保持原 Profile，空白名单对任意叶子路由 fail closed", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await writeConfigFile({ api_key: "sk-ordinary" }, "ordinary");
    await writeConfigFile({ api_key: "sk-closed", api_key_capabilities: [] }, "closed-plan");

    const ordinary = selectApiKeyResolutionSources(
      { ...buildSources({ config: "ordinary" }), env: {} },
      "text.chat",
    );
    expect(ordinary.fallbackFrom).toBeUndefined();
    expect(ordinary.sources.file.api_key).toBe("sk-ordinary");

    const closed = selectApiKeyResolutionSources(
      { ...buildSources({ config: "closed-plan" }), env: {} },
      "speech.synthesize",
    );
    expect(closed.fallbackFrom).toBe("closed-plan");
    expect(closed.sources.file.api_key).toBe("sk-default");
  });
});

test("显式 API Key 跳过 capability fallback，其他字段仍按既有优先级解析", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", base_url: "https://default.example.com" });
    await writeConfigFile(
      {
        api_key: "sk-plan",
        base_url: "https://plan.example.com",
        api_key_capabilities: ["image.generate"],
      },
      "company-plan",
    );

    const selectedSources = buildSources({
      config: "company-plan",
      apiKey: "sk-flag",
    });
    selectedSources.env = { DASHSCOPE_BASE_URL: "https://env.example.com" };
    const selected = selectApiKeyResolutionSources(selectedSources, "text.chat");

    expect(selected.fallbackFrom).toBeUndefined();
    expect(selected.sources.file.api_key).toBe("sk-plan");
    expect(resolveApiKey(selected.sources)).toMatchObject({
      token: "sk-flag",
      baseUrl: "https://env.example.com",
      source: "flag",
    });
  });
});

test("旧 token-plan Profile 缺少持久化字段时使用内置 capability 预设", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await writeConfigFile({ api_key: "sk-token-plan" }, "token-plan");
    const selectedSources = { ...buildSources({ config: "token-plan" }), env: {} };
    const presetCapabilities = getModelProfilePreset("token-plan")?.apiKeyCapabilities;

    const supported = selectApiKeyResolutionSources(
      selectedSources,
      "video.generate",
      presetCapabilities,
    );
    expect(supported.sources.file.api_key).toBe("sk-token-plan");

    const fallback = selectApiKeyResolutionSources(
      selectedSources,
      "search.web",
      presetCapabilities,
    );
    expect(fallback.fallbackFrom).toBe("token-plan");
    expect(fallback.sources.file.api_key).toBe("sk-default");
  });
});

test("token-plan 显式空 capability 白名单覆盖内置预设", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default" });
    await writeConfigFile({ api_key: "sk-token-plan", api_key_capabilities: [] }, "token-plan");
    const selectedSources = { ...buildSources({ config: "token-plan" }), env: {} };
    const presetCapabilities = getModelProfilePreset("token-plan")?.apiKeyCapabilities;

    const fallback = selectApiKeyResolutionSources(
      selectedSources,
      "video.generate",
      presetCapabilities,
    );
    expect(fallback.fallbackFrom).toBe("token-plan");
    expect(fallback.sources.file.api_key).toBe("sk-default");
  });
});

test("default 配置不对自身应用 capability fallback", async () => {
  await inTempConfigDir(async () => {
    await writeConfigFile({ api_key: "sk-default", api_key_capabilities: [] });
    const defaultSources = { ...buildSources({ config: "default" }), env: {} };

    const selected = selectApiKeyResolutionSources(defaultSources, "text.chat");
    expect(selected.fallbackFrom).toBeUndefined();
    expect(selected.sources.file.api_key).toBe("sk-default");
  });
});
