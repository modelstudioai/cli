import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, test } from "vite-plus/test";
import { bridgeBailianCredentials } from "../src/commands/managed-agent/_engine/credentials.ts";

/**
 * bridgeBailianCredentials 把 ~/.bailian/config.json 的 api_key / agentstudio_base_url
 * / workspace_id 作为最低优先级兜底填入 DASHSCOPE_API_KEY / BAILIAN_BASE_URL /
 * BAILIAN_WORKSPACE_ID。用临时 config dir + env 保存恢复隔离,验证优先级与不抛错语义。
 */
async function inScenario(
  scenario: {
    config?: {
      api_key?: string;
      workspace_id?: string;
      agentstudio_base_url?: string;
    };
    env?: {
      DASHSCOPE_API_KEY?: string;
      BAILIAN_WORKSPACE_ID?: string;
      BAILIAN_BASE_URL?: string;
    };
  },
  assert: () => void,
): Promise<void> {
  const savedConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const savedApiKey = process.env.DASHSCOPE_API_KEY;
  const savedWorkspace = process.env.BAILIAN_WORKSPACE_ID;
  const savedBaseUrl = process.env.BAILIAN_BASE_URL;

  const dir = mkdtempSync(join(tmpdir(), "bl-cred-bridge-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  if (scenario.config) {
    writeFileSync(join(dir, "config.json"), JSON.stringify(scenario.config), "utf-8");
  }

  // 显式设置/清除 env,避免继承宿主环境干扰断言
  if (scenario.env?.DASHSCOPE_API_KEY === undefined) delete process.env.DASHSCOPE_API_KEY;
  else process.env.DASHSCOPE_API_KEY = scenario.env.DASHSCOPE_API_KEY;
  if (scenario.env?.BAILIAN_WORKSPACE_ID === undefined) delete process.env.BAILIAN_WORKSPACE_ID;
  else process.env.BAILIAN_WORKSPACE_ID = scenario.env.BAILIAN_WORKSPACE_ID;
  if (scenario.env?.BAILIAN_BASE_URL === undefined) delete process.env.BAILIAN_BASE_URL;
  else process.env.BAILIAN_BASE_URL = scenario.env.BAILIAN_BASE_URL;

  try {
    assert();
  } finally {
    restore("BAILIAN_CONFIG_DIR", savedConfigDir);
    restore("DASHSCOPE_API_KEY", savedApiKey);
    restore("BAILIAN_WORKSPACE_ID", savedWorkspace);
    restore("BAILIAN_BASE_URL", savedBaseUrl);
    rmSync(dir, { recursive: true, force: true });
  }
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test("bridge:env 已有值时不被 bl config 覆盖(最低优先级)", async () => {
  await inScenario(
    {
      config: { api_key: "sk-from-config", workspace_id: "ws-from-config" },
      env: {
        DASHSCOPE_API_KEY: "sk-from-env",
        BAILIAN_WORKSPACE_ID: "ws-from-env",
      },
    },
    () => {
      bridgeBailianCredentials();
      expect(process.env.DASHSCOPE_API_KEY).toBe("sk-from-env");
      expect(process.env.BAILIAN_WORKSPACE_ID).toBe("ws-from-env");
    },
  );
});

test("bridge:env 缺失且 bl config 有值时填充", async () => {
  await inScenario(
    {
      config: { api_key: "sk-from-config", workspace_id: "ws-from-config" },
      env: {},
    },
    () => {
      bridgeBailianCredentials();
      expect(process.env.DASHSCOPE_API_KEY).toBe("sk-from-config");
      expect(process.env.BAILIAN_WORKSPACE_ID).toBe("ws-from-config");
    },
  );
});

test("bridge:仅缺失项被填,已有项保留(逐字段独立)", async () => {
  await inScenario(
    {
      config: { api_key: "sk-from-config", workspace_id: "ws-from-config" },
      env: { DASHSCOPE_API_KEY: "sk-from-env" },
    },
    () => {
      bridgeBailianCredentials();
      expect(process.env.DASHSCOPE_API_KEY).toBe("sk-from-env");
      expect(process.env.BAILIAN_WORKSPACE_ID).toBe("ws-from-config");
    },
  );
});

test("bridge:env 与 bl config 皆缺失时不抛错且不写入", async () => {
  await inScenario({ env: {} }, () => {
    expect(() => bridgeBailianCredentials()).not.toThrow();
    expect(process.env.DASHSCOPE_API_KEY).toBeUndefined();
    expect(process.env.BAILIAN_WORKSPACE_ID).toBeUndefined();
  });
});

test("bridge:agentstudio_base_url 兜底填入 BAILIAN_BASE_URL", async () => {
  await inScenario(
    {
      config: {
        api_key: "sk-from-config",
        agentstudio_base_url: "https://ws-x.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio",
      },
      env: {},
    },
    () => {
      bridgeBailianCredentials();
      expect(process.env.BAILIAN_BASE_URL).toBe(
        "https://ws-x.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio",
      );
    },
  );
});

test("bridge:env 已有 BAILIAN_BASE_URL 时不被 bl config 覆盖", async () => {
  await inScenario(
    {
      config: {
        api_key: "sk-from-config",
        agentstudio_base_url: "https://from-config.aliyuncs.com/api/v1/agentstudio",
      },
      env: {
        BAILIAN_BASE_URL: "https://from-env.aliyuncs.com/api/v1/agentstudio",
      },
    },
    () => {
      bridgeBailianCredentials();
      expect(process.env.BAILIAN_BASE_URL).toBe("https://from-env.aliyuncs.com/api/v1/agentstudio");
    },
  );
});
