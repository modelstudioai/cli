import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { expect, test } from "vite-plus/test";
import {
  activateConfigProfile,
  getConfigPath,
  makeConfigStore,
  writeConfigFile,
  readConfigFile,
  readConfigProfiles,
} from "bailian-cli-core";
import { createConfigUiServer } from "../src/commands/config/ui.ts";

const TOKEN = "test-token";

interface HttpResult {
  status: number;
  json: any;
  text: string;
}

function httpJson(
  port: number,
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string> },
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = opts?.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = { ...opts?.headers };
    if (payload) headers["Content-Type"] = "application/json";
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        let json: unknown = null;
        try {
          json = d ? JSON.parse(d) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode ?? 0, json, text: d });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 隔离临时配置目录 + 启动 UI server，跑完清理。 */
async function withServer(fn: (port: number) => Promise<void>, configName?: string): Promise<void> {
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "bl-ui-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  const server = createConfigUiServer(TOKEN, makeConfigStore(configName));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : 0;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (saved === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("GET / follows the launch Profile language", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ language: "zh-CN" });

    const chinese = await httpJson(port, "GET", `/?token=${TOKEN}`);
    expect(chinese.status).toBe(200);
    expect(chinese.text).toContain('<html lang="zh-CN">');
    expect(chinese.text).toContain("快速开始");
    const inlineScript = chinese.text.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(inlineScript).toBeDefined();
    expect(() => new Script(inlineScript ?? "")).not.toThrow();
    expect(chinese.text).toContain("'Content-Type': 'application/json'");
    expect(chinese.text).not.toContain("Content-类型");

    await writeConfigFile({ language: "en-US" });
    const english = await httpJson(port, "GET", `/?token=${TOKEN}`);
    expect(english.status).toBe(200);
    expect(english.text).toContain('<html lang="en-US">');
    expect(english.text).toContain("Quick Start");
  });
});

test("GET / embeds both locales so the browser can switch language in place", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ language: "zh-CN" });

    const response = await httpJson(port, "GET", `/?token=${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain("Quick Start");
    expect(response.text).toContain("快速开始");
    expect(response.text).toContain("'Content-Type': 'application/json'");
  });
});

test("POST /api/profile returns the launch Profile language for an in-place update", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ language: "en-US" });

    const otherProfile = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "work", data: { language: "zh-CN" } },
    });
    expect(otherProfile.status).toBe(200);
    expect(otherProfile.json.uiLanguage).toBe("en-US");

    const response = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "", data: { language: "zh-CN" } },
    });

    expect(response.status).toBe(200);
    expect(response.json.uiLanguage).toBe("zh-CN");
  });
});

test("activating another Profile switches the Config UI language source", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ language: "en-US" });
    await writeConfigFile({ language: "zh-CN" }, "token-plan");
    await activateConfigProfile("token-plan");

    const saveDefault = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "default", data: { language: "en-US" } },
    });
    expect(saveDefault.status).toBe(200);
    expect(saveDefault.json.uiLanguage).toBe("zh-CN");

    const activateDefault = await httpJson(port, "POST", `/api/active?token=${TOKEN}`, {
      body: { name: "default" },
    });
    expect(activateDefault.status).toBe(200);
    expect(activateDefault.json.uiLanguage).toBe("en-US");

    const scenarios = await httpJson(port, "GET", `/api/scenarios?token=${TOKEN}`);
    expect(scenarios.json.scenarios[0].title).toBe("Text to image");
  }, "token-plan");
});

test("GET / uses an explicitly selected named Profile language", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ language: "en-US" });
    await writeConfigFile({ language: "zh-CN" }, "work");

    const response = await httpJson(port, "GET", `/?token=${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<html lang="zh-CN">');
    expect(response.text).toContain("快速开始");
  }, "work");
});

test("GET /api/scenarios localizes built-in scenarios with the launch Profile", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ language: "en-US" });
    const english = await httpJson(port, "GET", `/api/scenarios?token=${TOKEN}`);
    expect(english.status).toBe(200);
    expect(english.json.scenarios[0]).toMatchObject({
      id: "image-generate",
      title: "Text to image",
      category: "Image",
      prompt: expect.stringContaining("Use bl's image generation capability"),
    });

    await writeConfigFile({ language: "zh-CN" });
    const chinese = await httpJson(port, "GET", `/api/scenarios?token=${TOKEN}`);
    expect(chinese.status).toBe(200);
    expect(chinese.json.scenarios[0]).toMatchObject({
      id: "image-generate",
      title: "文生图",
      category: "图像",
    });
  });
});

test("GET /api/config 返回全部 profile、明文密钥与持久化激活项", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ api_key: "sk-default", output: "json" });
    await writeConfigFile({ api_key: "sk-dev", access_token: "tok-dev" }, "dev");
    await activateConfigProfile("dev");

    const res = await httpJson(port, "GET", `/api/config?token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.json.activeProfile).toBe("dev");
    expect(res.json.default).toMatchObject({ api_key: "sk-default", output: "json" });
    expect(res.json.named.dev).toMatchObject({ api_key: "sk-dev", access_token: "tok-dev" });
    expect(res.json.secretKeys).toContain("api_key");
    expect(res.json.keys).toContain("default_image_to_video_model");
    expect(res.json.keys).toContain("default_reference_to_video_model");
    // Console/telemetry fields are editable via the UI (full ConfigFile surface).
    expect(res.json.keys).toContain("console_site");
    expect(res.json.keys).toContain("telemetry");
    expect(res.json.keys).toContain("default_speech_recognition_model");
    expect(res.json.enums.console_site).toEqual(["domestic", "international"]);
    expect(res.json.booleanKeys).toContain("telemetry");
    // Default field hints are surfaced as prefilled values in the UI.
    expect(res.json.fieldDefaults.default_image_model).toBe("qwen-image-3.0");
    expect(res.json.fieldDefaults.default_text_model).toBe("qwen3.8-max");
    expect(res.json.fieldDefaults.output_dir).toContain("bailian-output");
    expect(res.json.fieldDefaults.timeout).toBe("300");
    expect(res.json.fieldDefaults.base_url).toBe("https://dashscope.aliyuncs.com");
    // Per-category model catalog (click-to-fill suggestions) is exposed too.
    expect(res.json.modelCatalog.default_image_model[0]).toMatchObject({ id: "qwen-image-3.0" });
    expect(res.json.modelCatalog.default_video_model.map((m: { id: string }) => m.id)).toContain(
      "happyhorse-1.1-i2v",
    );
    expect(
      res.json.modelCatalog.default_speech_recognition_model.map(
        (model: { id: string }) => model.id,
      ),
    ).toEqual(["fun-asr", "qwen-audio-3.0-asr-flash"]);
  });
});

test("GET /api/auth/status 无 bridge 时返回未认证；login/logout 返回 400", async () => {
  await withServer(async (port) => {
    // The test harness builds the server without an auth bridge, so the auth
    // endpoints degrade safely instead of throwing.
    const status = await httpJson(port, "GET", `/api/auth/status?token=${TOKEN}`);
    expect(status.status).toBe(200);
    expect(status.json.authenticated).toBe(false);
    expect(status.json.methods).toEqual({ apiKey: false, console: false, openapi: false });
    expect(status.json.primary).toBe(null);

    const login = await httpJson(port, "POST", `/api/auth/login?token=${TOKEN}`);
    expect(login.status).toBe(400);

    const logout = await httpJson(port, "POST", `/api/auth/logout?token=${TOKEN}`);
    expect(logout.status).toBe(400);
  });
});

test("鉴权：错误 token 401、非 loopback Host 403", async () => {
  await withServer(async (port) => {
    const bad = await httpJson(port, "GET", `/api/config?token=wrong`);
    expect(bad.status).toBe(401);

    const badHost = await httpJson(port, "GET", `/api/config?token=${TOKEN}`, {
      headers: { Host: "evil.com" },
    });
    expect(badHost.status).toBe(403);
  });
});

test("POST /api/profile 写命名 profile（timeout 强制为 number），空串清除键", async () => {
  await withServer(async (port) => {
    const save = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: {
        name: "stage",
        data: {
          api_key: "sk-stage",
          timeout: "90",
          base_url: "https://proxy.example.com/team/compatible-mode/v1/?x=1#fragment",
        },
      },
    });
    expect(save.status).toBe(200);
    expect(readConfigFile("stage")).toMatchObject({
      api_key: "sk-stage",
      timeout: 90,
      base_url: "https://proxy.example.com",
    });
    const rawConfig = JSON.parse(readFileSync(getConfigPath(), "utf8"));
    expect(rawConfig.stage.base_url).toBe("https://proxy.example.com");

    // 空串清除 api_key（整块替换）
    const clear = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "stage", data: { api_key: "", timeout: "120" } },
    });
    expect(clear.status).toBe(200);
    const after = readConfigFile("stage");
    expect(after.api_key).toBeUndefined();
    expect(after.timeout).toBe(120);
  });
});

test("POST /api/profile 可编辑 console/telemetry 字段并按类型持久化", async () => {
  await withServer(async (port) => {
    const save = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: {
        name: "stage",
        data: {
          api_key: "sk-stage",
          console_site: "international",
          console_region: "ap-southeast-1",
          console_switch_agent: "42",
          telemetry: "false",
        },
      },
    });
    expect(save.status).toBe(200);

    const profile = readConfigFile("stage");
    expect(profile).toMatchObject({
      api_key: "sk-stage",
      console_site: "international",
      console_region: "ap-southeast-1",
      console_switch_agent: 42,
      telemetry: false,
    });

    const rawConfig = JSON.parse(readFileSync(getConfigPath(), "utf8"));
    // Coerced to the right JSON types, not left as strings.
    expect(rawConfig.stage.console_switch_agent).toBe(42);
    expect(rawConfig.stage.telemetry).toBe(false);

    // Invalid enum value is rejected.
    const bad = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "stage", data: { console_site: "mars" } },
    });
    expect(bad.status).toBe(400);
    expect(String(bad.json.error)).toMatch(/console_site/);
  });
});

test("POST /api/profile 按浏览器字符串形态往返持久化 capability 白名单", async () => {
  await withServer(async (port) => {
    const save = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: {
        name: "company-plan",
        data: {
          api_key_capabilities: "text.chat, image.generate, text.chat",
        },
      },
    });
    expect(save.status).toBe(200);
    expect(readConfigFile("company-plan").api_key_capabilities).toEqual([
      "text.chat",
      "image.generate",
    ]);

    const closeAll = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: {
        name: "company-plan",
        data: { api_key_capabilities: "[]" },
      },
    });
    expect(closeAll.status).toBe(200);
    expect(readConfigFile("company-plan").api_key_capabilities).toEqual([]);
  });
});

test("New profile 立即保存空 Profile，其他配置读取可以看到", async () => {
  await withServer(async (port) => {
    const create = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "new-profile", data: {} },
    });
    expect(create.status).toBe(200);
    expect(create.json.saved).toEqual({});
    expect(readConfigProfiles().named["new-profile"]).toEqual({});

    const list = await httpJson(port, "GET", `/api/config?token=${TOKEN}`);
    expect(list.status).toBe(200);
    expect(list.json.named["new-profile"]).toEqual({});
  });
});

test("POST /api/profile 非法 key 返回 400", async () => {
  await withServer(async (port) => {
    const res = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "stage", data: { not_a_key: "x" } },
    });
    expect(res.status).toBe(400);
    expect(String(res.json.error)).toMatch(/Invalid config key/);
  });
});

test("DELETE /api/profile 删命名 profile；缺 name 返回 400", async () => {
  await withServer(async (port) => {
    await writeConfigFile({ api_key: "sk-stage" }, "stage");
    const del = await httpJson(port, "DELETE", `/api/profile?name=stage&token=${TOKEN}`);
    expect(del.status).toBe(200);
    expect(del.json.deleted).toBe(true);
    expect(readConfigProfiles().named.stage).toBeUndefined();

    const noName = await httpJson(port, "DELETE", `/api/profile?token=${TOKEN}`);
    expect(noName.status).toBe(400);
  });
});

test("Save & Activate 创建并激活 Profile；删除激活项后切回 default", async () => {
  await withServer(async (port) => {
    const save = await httpJson(port, "POST", `/api/profile?token=${TOKEN}`, {
      body: { name: "stage", data: { api_key: "sk-stage" } },
    });
    expect(save.status).toBe(200);

    const activate = await httpJson(port, "POST", `/api/active?token=${TOKEN}`, {
      body: { name: "stage" },
    });
    expect(activate.status).toBe(200);
    expect(activate.json.activeProfile).toBe("stage");
    expect(readConfigProfiles().active).toBe("stage");

    const missing = await httpJson(port, "POST", `/api/active?token=${TOKEN}`, {
      body: { name: "missing" },
    });
    expect(missing.status).toBe(400);
    expect(readConfigProfiles().active).toBe("stage");

    const deleted = await httpJson(port, "DELETE", `/api/profile?name=stage&token=${TOKEN}`);
    expect(deleted.status).toBe(200);
    expect(deleted.json.activeProfile).toBe("default");
    expect(readConfigProfiles().active).toBe("default");
  });
});
