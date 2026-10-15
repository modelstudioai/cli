import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectInstalledAgents,
  isHostSystemDetectDir,
  SKIP_HOST_AGENTS_ENV,
} from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import {
  buildIsolatedCliEnv,
  cleanupIsolationSessionRootAt,
  createIsolationSessionRoot,
  enterIsolatedHome,
  getIsolationSessionRoot,
  withIsolatedHome,
} from "../src/isolation.ts";

test("isHostSystemDetectDir 识别 /etc 与 /Applications，排除 HOME 下路径", () => {
  const handle = enterIsolatedHome();
  try {
    expect(isHostSystemDetectDir("/etc/codex")).toBe(true);
    expect(isHostSystemDetectDir("/Applications/ZCode.app")).toBe(true);
    expect(isHostSystemDetectDir(join(handle.home, ".codex"))).toBe(false);
  } finally {
    handle.restore();
  }
});

test("withIsolatedHome 关闭系统 detectDirs，空 HOME 下不探测主机路径", async () => {
  await withIsolatedHome(async (home) => {
    expect(process.env[SKIP_HOST_AGENTS_ENV]).toBe("1");
    expect(process.env.HOME).toBe(home);
    expect(process.env.BAILIAN_CONFIG_DIR).toBe(join(home, ".bailian"));
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(process.env.LOCALAPPDATA).toBeUndefined();

    // 未创建任何 agent 目录时，列表应为空（不受 /etc/codex 等主机路径影响）
    expect(detectInstalledAgents()).toEqual([]);

    mkdirSync(join(home, ".claude"), { recursive: true });
    expect(detectInstalledAgents().map((agent) => agent.id)).toEqual(["claude-code"]);
  });
});

test("隔离开关打开时，HOME 外的绝对路径不探测", async () => {
  const outside = mkdtempSync(join(tmpdir(), "bl-iso-outside-"));
  try {
    await withIsolatedHome(async (home) => {
      process.env.CODEX_HOME = outside;
      expect(isHostSystemDetectDir(outside)).toBe(true);
      expect(detectInstalledAgents().some((agent) => agent.id === "codex")).toBe(false);

      delete process.env.CODEX_HOME;
      mkdirSync(join(home, ".codex"), { recursive: true });
      expect(detectInstalledAgents().some((agent) => agent.id === "codex")).toBe(true);
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("buildIsolatedCliEnv 默认只写 en-US，不拷贝凭证，dispose 删除临时目录", () => {
  const probeRoot = mkdtempSync(join(tmpdir(), "bl-iso-seed-"));
  const realConfigDir = join(probeRoot, "real-bailian");
  mkdirSync(realConfigDir, { recursive: true });
  writeFileSync(
    join(realConfigDir, "config.json"),
    JSON.stringify({
      language: "zh-CN",
      output: "text",
      api_key: "sk-seed-for-isolation",
      access_key_secret: "sk-secret",
      access_token: "console-seed-token",
    }),
    "utf8",
  );

  const previousConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.BAILIAN_CONFIG_DIR = realConfigDir;
  process.env.XDG_CONFIG_HOME = join(probeRoot, "host-xdg");
  process.env.LOCALAPPDATA = join(probeRoot, "host-local");
  const isolated = buildIsolatedCliEnv();
  try {
    const env = isolated.env;
    expect(env[SKIP_HOST_AGENTS_ENV]).toBe("1");
    expect(env.BAILIAN_CONFIG_DIR).toBeTruthy();
    expect(env.BAILIAN_CONFIG_DIR).not.toBe(realConfigDir);
    expect(env.XDG_CONFIG_HOME).toBe(join(env.HOME!, ".config"));
    expect(env.LOCALAPPDATA).toBeUndefined();
    const body = JSON.parse(
      readFileSync(join(env.BAILIAN_CONFIG_DIR!, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(body).toEqual({ language: "en-US" });
  } finally {
    const configDir = isolated.env.BAILIAN_CONFIG_DIR!;
    const home = isolated.env.HOME!;
    isolated.dispose();
    expect(existsSync(configDir)).toBe(false);
    expect(existsSync(home)).toBe(false);
    if (previousConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = previousConfigDir;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    rmSync(probeRoot, { recursive: true, force: true });
  }
});

test("buildIsolatedCliEnv seedCredentials 只拷贝 Console 字段", () => {
  const probeRoot = mkdtempSync(join(tmpdir(), "bl-iso-console-seed-"));
  const realConfigDir = join(probeRoot, "real-bailian");
  mkdirSync(realConfigDir, { recursive: true });
  writeFileSync(
    join(realConfigDir, "config.json"),
    JSON.stringify({
      language: "zh-CN",
      output: "text",
      api_key: "sk-seed-for-isolation",
      access_key_secret: "sk-secret",
      access_token: "console-seed-token",
      console_region: "cn-beijing",
    }),
    "utf8",
  );

  const previousConfigDir = process.env.BAILIAN_CONFIG_DIR;
  process.env.BAILIAN_CONFIG_DIR = realConfigDir;
  const isolated = buildIsolatedCliEnv({ seedCredentials: true });
  try {
    const body = JSON.parse(
      readFileSync(join(isolated.env.BAILIAN_CONFIG_DIR!, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(body.language).toBe("en-US");
    expect(body.output).toBeUndefined();
    expect(body.api_key).toBeUndefined();
    expect(body.access_key_secret).toBeUndefined();
    expect(body.access_token).toBe("console-seed-token");
    expect(body.console_region).toBe("cn-beijing");
  } finally {
    isolated.dispose();
    if (previousConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = previousConfigDir;
    rmSync(probeRoot, { recursive: true, force: true });
  }
});

test("buildIsolatedCliEnv 显式 HOME 时仍改写 XDG，配置落在该 HOME 下", () => {
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = join(tmpdir(), "host-xdg-should-not-leak");
  const home = mkdtempSync(join(tmpdir(), "bl-iso-explicit-"));
  const isolated = buildIsolatedCliEnv({
    overrides: { BAILIAN_CONFIG_DIR: home, HOME: home },
  });
  try {
    expect(isolated.env.BAILIAN_CONFIG_DIR).toBe(home);
    expect(isolated.env.HOME).toBe(home);
    expect(isolated.env.XDG_CONFIG_HOME).toBe(join(home, ".config"));
    expect(isolated.env[SKIP_HOST_AGENTS_ENV]).toBe("1");
    isolated.dispose();
    expect(existsSync(home)).toBe(true);
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    rmSync(home, { recursive: true, force: true });
  }
});

test("只传空 HOME 时隔离 config 写在该 HOME/.bailian", () => {
  const home = mkdtempSync(join(tmpdir(), "bl-iso-home-only-"));
  const isolated = buildIsolatedCliEnv({ overrides: { HOME: home } });
  try {
    expect(isolated.env.BAILIAN_CONFIG_DIR).toBe(join(home, ".bailian"));
    expect(existsSync(join(home, ".bailian", "config.json"))).toBe(true);
    isolated.dispose();
    expect(existsSync(join(home, ".bailian", "config.json"))).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("只传 HOME 且已有 config 时不覆盖，改用基建自有 config 目录", () => {
  const home = mkdtempSync(join(tmpdir(), "bl-iso-home-preserve-"));
  const existingDir = join(home, ".bailian");
  mkdirSync(existingDir, { recursive: true });
  const existingBody = {
    language: "zh-CN",
    api_key: "sk-keep-me",
    active_config: "work",
  };
  writeFileSync(join(existingDir, "config.json"), `${JSON.stringify(existingBody, null, 2)}\n`);

  const isolated = buildIsolatedCliEnv({ overrides: { HOME: home } });
  try {
    expect(isolated.env.HOME).toBe(home);
    expect(isolated.env.BAILIAN_CONFIG_DIR).not.toBe(existingDir);
    expect(isolated.env.BAILIAN_CONFIG_DIR).toBeTruthy();
    const preserved = JSON.parse(readFileSync(join(existingDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(preserved).toEqual(existingBody);
    const isolatedBody = JSON.parse(
      readFileSync(join(isolated.env.BAILIAN_CONFIG_DIR!, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(isolatedBody).toEqual({ language: "en-US" });
  } finally {
    const ownedConfig = isolated.env.BAILIAN_CONFIG_DIR!;
    isolated.dispose();
    expect(existsSync(ownedConfig)).toBe(false);
    expect(existsSync(join(existingDir, "config.json"))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  }
});

test("undefined / 空串 overrides 不会取消 HOME 与 config 隔离", () => {
  const isolated = buildIsolatedCliEnv({
    overrides: {
      HOME: undefined,
      USERPROFILE: "",
      BAILIAN_CONFIG_DIR: undefined,
      XDG_CONFIG_HOME: "",
      [SKIP_HOST_AGENTS_ENV]: "",
      DASHSCOPE_API_KEY: "",
    },
  });
  try {
    expect(isolated.env.HOME).toBeTruthy();
    expect(isolated.env.BAILIAN_CONFIG_DIR).toBeTruthy();
    expect(isolated.env.XDG_CONFIG_HOME).toBe(join(isolated.env.HOME!, ".config"));
    expect(isolated.env[SKIP_HOST_AGENTS_ENV]).toBe("1");
    // 非隔离关键键仍允许空串（测试故意清凭证）
    expect(isolated.env.DASHSCOPE_API_KEY).toBe("");
    expect(existsSync(join(isolated.env.BAILIAN_CONFIG_DIR!, "config.json"))).toBe(true);
  } finally {
    isolated.dispose();
  }
});

test("非关键键传 undefined 会删除继承自父进程的凭证", () => {
  const previousKey = process.env.DASHSCOPE_API_KEY;
  const previousToken = process.env.DASHSCOPE_ACCESS_TOKEN;
  process.env.DASHSCOPE_API_KEY = "sk-should-not-leak";
  process.env.DASHSCOPE_ACCESS_TOKEN = "token-should-not-leak";
  const isolated = buildIsolatedCliEnv({
    overrides: {
      DASHSCOPE_API_KEY: undefined,
      DASHSCOPE_ACCESS_TOKEN: undefined,
    },
  });
  try {
    expect(isolated.env.HOME).toBeTruthy();
    expect(isolated.env.BAILIAN_CONFIG_DIR).toBeTruthy();
    expect(isolated.env.DASHSCOPE_API_KEY).toBeUndefined();
    expect(isolated.env.DASHSCOPE_ACCESS_TOKEN).toBeUndefined();
    expect("DASHSCOPE_API_KEY" in isolated.env).toBe(false);
    expect("DASHSCOPE_ACCESS_TOKEN" in isolated.env).toBe(false);
  } finally {
    isolated.dispose();
    if (previousKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = previousKey;
    if (previousToken === undefined) delete process.env.DASHSCOPE_ACCESS_TOKEN;
    else process.env.DASHSCOPE_ACCESS_TOKEN = previousToken;
  }
});

test("隔离子进程清理 OPENCLAW_CONFIG_PATH 与 ZCODE_HOME", () => {
  const previousOpenclaw = process.env.OPENCLAW_CONFIG_PATH;
  const previousZcode = process.env.ZCODE_HOME;
  process.env.OPENCLAW_CONFIG_PATH = "/tmp/outside-openclaw.json";
  process.env.ZCODE_HOME = "/tmp/outside-zcode";
  const isolated = buildIsolatedCliEnv();
  try {
    expect(isolated.env.OPENCLAW_CONFIG_PATH).toBeUndefined();
    expect(isolated.env.ZCODE_HOME).toBeUndefined();
  } finally {
    isolated.dispose();
    if (previousOpenclaw === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = previousOpenclaw;
    if (previousZcode === undefined) delete process.env.ZCODE_HOME;
    else process.env.ZCODE_HOME = previousZcode;
  }
});

test("session root：create 写入 BL_ISO_ROOT，临时目录挂在其下，cleanup 幂等", () => {
  const previousEnv = process.env.BL_ISO_ROOT;
  const sessionRoot = createIsolationSessionRoot();
  try {
    expect(sessionRoot).toContain("bl-e2e-session-");
    expect(process.env.BL_ISO_ROOT).toBe(sessionRoot);
    expect(getIsolationSessionRoot()).toBe(sessionRoot);

    const isolated = buildIsolatedCliEnv();
    try {
      const homeReal = realpathSync(isolated.env.HOME!);
      const sessionReal = realpathSync(sessionRoot);
      expect(homeReal === sessionReal || homeReal.startsWith(sessionReal + "/")).toBe(true);
    } finally {
      isolated.dispose();
    }
  } finally {
    cleanupIsolationSessionRootAt(sessionRoot);
    expect(existsSync(sessionRoot)).toBe(false);
    cleanupIsolationSessionRootAt(sessionRoot);
    expect(existsSync(sessionRoot)).toBe(false);
    if (previousEnv === undefined) delete process.env.BL_ISO_ROOT;
    else process.env.BL_ISO_ROOT = previousEnv;
  }
});

test("无 BL_ISO_ROOT 时临时目录落在 os.tmpdir，不惰性创建 session", () => {
  const previousEnv = process.env.BL_ISO_ROOT;
  delete process.env.BL_ISO_ROOT;
  try {
    expect(getIsolationSessionRoot()).toBe(tmpdir());
    const isolated = buildIsolatedCliEnv();
    try {
      const homeReal = realpathSync(isolated.env.HOME!);
      const tmpReal = realpathSync(tmpdir());
      expect(homeReal === tmpReal || homeReal.startsWith(tmpReal + "/")).toBe(true);
      expect(homeReal.includes("bl-e2e-session-")).toBe(false);
    } finally {
      isolated.dispose();
    }
  } finally {
    if (previousEnv === undefined) delete process.env.BL_ISO_ROOT;
    else process.env.BL_ISO_ROOT = previousEnv;
  }
});

test("cleanupIsolationSessionRootAt 只删指定 root，不误伤其它会话", () => {
  const rootA = mkdtempSync(join(tmpdir(), "bl-e2e-session-a-"));
  const rootB = mkdtempSync(join(tmpdir(), "bl-e2e-session-b-"));
  try {
    cleanupIsolationSessionRootAt(rootA);
    cleanupIsolationSessionRootAt(rootA);
    expect(existsSync(rootA)).toBe(false);
    expect(existsSync(rootB)).toBe(true);
  } finally {
    cleanupIsolationSessionRootAt(rootB);
  }
});
