import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "bl-ui-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  const server = createConfigUiServer(TOKEN, makeConfigStore());
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
      base_url: "https://proxy.example.com/team",
    });
    const rawConfig = JSON.parse(readFileSync(getConfigPath(), "utf8"));
    expect(rawConfig.stage.base_url).toBe("https://proxy.example.com/team");

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
