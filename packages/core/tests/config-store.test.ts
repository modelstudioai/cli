import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, test } from "vite-plus/test";
import { makeConfigStore } from "../src/config/store.ts";
import { makeAuthStore } from "../src/auth/store.ts";

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

test("AuthStore:login 合并落盘,logout 按域清理并报告变更", async () => {
  await inTempConfigDir(async () => {
    const store = makeAuthStore({ flags: {}, file: {}, env: {} });
    await store.login({
      api_key: "sk-1",
      access_token: "tok-1",
      workspace_id: "ws-1",
      console_site: "international",
    });
    expect(makeConfigStore().read()).toMatchObject({
      api_key: "sk-1",
      access_token: "tok-1",
      workspace_id: "ws-1",
      console_site: "international",
    });

    expect(await store.logout("console")).toBe(true);
    expect(makeConfigStore().read().access_token).toBeUndefined();
    expect(makeConfigStore().read().api_key).toBe("sk-1");

    expect(await store.logout("all")).toBe(true);
    expect(makeConfigStore().read().api_key).toBeUndefined();
    expect(await store.logout("all")).toBe(false);

    // 非凭证键不受 logout 影响
    expect(makeConfigStore().read().workspace_id).toBe("ws-1");
  });
});
