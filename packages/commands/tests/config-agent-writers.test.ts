import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import claudeCode from "../src/commands/config/agent/writers/claude-code.ts";
import qwenCode from "../src/commands/config/agent/writers/qwen-code.ts";
import opencode from "../src/commands/config/agent/writers/opencode.ts";
import openclaw from "../src/commands/config/agent/writers/openclaw.ts";
import hermes from "../src/commands/config/agent/writers/hermes.ts";
import codex from "../src/commands/config/agent/writers/codex.ts";
import yaml from "yaml";

/**
 * Agent writer 单元测试：直接调用 writer，用临时 HOME 隔离文件系统。
 * writer 是纯文件 I/O，在进程内测试比 e2e 子进程更快、覆盖更全。
 */

const OAI_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const ANTHROPIC_URL = "https://dashscope.aliyuncs.com/apps/anthropic";

let home = "";
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bl-agent-writer-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
  // homedir() 在 POSIX 读 $HOME；断言隔离生效。
  expect(homedir()).toBe(home);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

function readJsonAt(...segments: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(home, ...segments), "utf8"));
}

describe("config agent writers", () => {
  test("claude-code 写入 env 与 onboarding，并合并已有 env", () => {
    // 预置一个无关 env 键与旧的 ANTHROPIC_API_KEY，验证合并保留 / 旧键清理
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({
        env: { KEEP_ME: "1", ANTHROPIC_API_KEY: "sk-stale" },
        other: true,
      }),
    );

    const summary = claudeCode.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-a",
      model: "qwen3-max",
    });
    expect(summary.paths).toHaveLength(2);

    const settings = readJsonAt(".claude", "settings.json");
    const env = settings.env as Record<string, string>;
    expect(env.KEEP_ME).toBe("1");
    expect(settings.other).toBe(true);
    expect(env.ANTHROPIC_BASE_URL).toBe(ANTHROPIC_URL);
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-a");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe("qwen3-max");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("qwen3-max");
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("qwen3-max");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("qwen3-max");
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("qwen3-max");

    expect(readJsonAt(".claude.json").hasCompletedOnboarding).toBe(true);
  });

  test("claude-code 尊重 CLAUDE_CONFIG_DIR", () => {
    const customDir = join(home, "custom-claude");
    process.env.CLAUDE_CONFIG_DIR = customDir;
    try {
      claudeCode.write({
        baseUrl: ANTHROPIC_URL,
        apiKey: "sk-a",
        model: "qwen3-max",
      });
      const settings = JSON.parse(
        readFileSync(join(customDir, "settings.json"), "utf8"),
      );
      expect(
        (settings.env as Record<string, string>).ANTHROPIC_AUTH_TOKEN,
      ).toBe("sk-a");
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  test("qwen-code compatible-mode 走 openai 协议（官方 v3 结构）", () => {
    qwenCode.write({
      baseUrl: OAI_URL,
      apiKey: "sk-q",
      model: "qwen3-coder-plus",
    });
    const settings = readJsonAt(".qwen", "settings.json");
    expect(settings.$version).toBe(3);
    const security = settings.security as { auth: Record<string, unknown> };
    // security.auth 只携带 selectedType；凭证在 env + envKey 里
    expect(security.auth).toEqual({ selectedType: "openai" });
    expect((settings.env as Record<string, string>).BAILIAN_CLI_API_KEY).toBe(
      "sk-q",
    );
    expect(settings.model).toEqual({ name: "qwen3-coder-plus" });
    const providers = settings.modelProviders as Record<
      string,
      Array<Record<string, unknown>>
    >;
    expect(providers.openai[0]).toMatchObject({
      id: "qwen3-coder-plus",
      name: "bailian-cli",
      baseUrl: OAI_URL,
      envKey: "BAILIAN_CLI_API_KEY",
    });
  });

  test("qwen-code anthropic 端点走 anthropic 协议", () => {
    qwenCode.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-q",
      model: "qwen3-max",
    });
    const settings = readJsonAt(".qwen", "settings.json");
    expect(
      (settings.security as { auth: { selectedType: string } }).auth
        .selectedType,
    ).toBe("anthropic");
    const providers = settings.modelProviders as Record<string, unknown>;
    expect(Array.isArray(providers.anthropic)).toBe(true);
    expect(providers.openai).toBeUndefined();
  });

  test("qwen-code 对相同 id+baseUrl 的 provider 项做 upsert 而非追加", () => {
    qwenCode.write({
      baseUrl: OAI_URL,
      apiKey: "sk-1",
      model: "qwen3-coder-plus",
    });
    qwenCode.write({
      baseUrl: OAI_URL,
      apiKey: "sk-2",
      model: "qwen3-coder-plus",
    });
    const settings = readJsonAt(".qwen", "settings.json");
    const openaiEntries = (settings.modelProviders as Record<string, unknown[]>)
      .openai;
    expect(openaiEntries).toHaveLength(1);
  });

  test("opencode 容忍 JSONC（注释与尾逗号）", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(
      join(home, ".config", "opencode", "opencode.json"),
      [
        "{",
        "  // user comment",
        '  "provider": {',
        '    "other": { "name": "Other" }, // inline comment',
        "  },",
        "  /* block */",
        '  "theme": "dark",',
        "}",
      ].join("\n"),
    );

    opencode.write({ baseUrl: OAI_URL, apiKey: "sk-o", model: "qwen3-max" });
    const config = readJsonAt(".config", "opencode", "opencode.json");
    expect(config.theme).toBe("dark");
    const provider = config.provider as Record<string, unknown>;
    expect(provider.other).toBeDefined();
    expect(provider["bailian-cli"]).toBeDefined();
  });

  test("opencode 按端点选 npm，含 setCacheKey，合并保留其它 provider", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(
      join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ provider: { other: { name: "Other" } } }),
    );

    opencode.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-o",
      model: "qwen3-max",
    });
    const config = readJsonAt(".config", "opencode", "opencode.json");
    const provider = config.provider as Record<string, Record<string, unknown>>;
    expect(provider.other).toBeDefined();
    expect(provider["bailian-cli"].npm).toBe("@ai-sdk/anthropic");
    const options = provider["bailian-cli"].options as Record<string, unknown>;
    expect(options.baseURL).toBe(ANTHROPIC_URL);
    expect(options.apiKey).toBe("sk-o");
    expect(options.setCacheKey).toBe(true);
    expect(
      (provider["bailian-cli"].models as Record<string, unknown>)["qwen3-max"],
    ).toBeDefined();

    // 非 anthropic 端点用 openai-compatible
    opencode.write({ baseUrl: OAI_URL, apiKey: "sk-o", model: "qwen3-max" });
    expect(
      (
        readJsonAt(".config", "opencode", "opencode.json").provider as Record<
          string,
          { npm: string }
        >
      )["bailian-cli"].npm,
    ).toBe("@ai-sdk/openai-compatible");
  });

  test("openclaw 写入 provider、api 与 primary", () => {
    openclaw.write({
      baseUrl: OAI_URL,
      apiKey: "sk-c",
      model: "qwen3-coder-plus",
    });
    const config = readJsonAt(".openclaw", "openclaw.json");
    const models = config.models as Record<string, unknown>;
    expect(models.mode).toBe("merge");
    const bailian = (
      models.providers as Record<string, Record<string, unknown>>
    )["bailian-cli"];
    expect(bailian.api).toBe("openai-completions");
    const entry = (bailian.models as Array<Record<string, unknown>>)[0];
    expect(entry.id).toBe("qwen3-coder-plus");
    // 未传 --context-window 时使用安全默认值，不再硬编码 1M
    expect(entry.contextWindow).toBe(256000);
    expect(entry.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    const agents = config.agents as {
      defaults: { model: { primary: string }; models: Record<string, unknown> };
    };
    expect(agents.defaults.model.primary).toBe("bailian-cli/qwen3-coder-plus");
    expect(agents.defaults.models["bailian-cli/qwen3-coder-plus"]).toEqual({});

    // --context-window 覆盖默认值；anthropic 端点用 anthropic-messages
    openclaw.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-c",
      model: "qwen3-max",
      contextWindow: 1000000,
    });
    const config2 = readJsonAt(".openclaw", "openclaw.json");
    const providers2 = (config2.models as Record<string, unknown>)
      .providers as Record<
      string,
      { api: string; models: Array<Record<string, unknown>> }
    >;
    expect(providers2["bailian-cli"].api).toBe("anthropic-messages");
    expect(providers2["bailian-cli"].models[0].contextWindow).toBe(1000000);
  });

  test("hermes 写入官方扁平 model.* 结构，保留其它顶层键", () => {
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      yaml.stringify({
        custom_providers: [{ name: "other", base_url: "https://x" }],
      }),
    );

    hermes.write({
      baseUrl: OAI_URL,
      apiKey: "sk-h",
      model: "qwen3-coder-plus",
    });
    const config = yaml.parse(
      readFileSync(join(home, ".hermes", "config.yaml"), "utf8"),
    );
    // OpenAI 兼容端点：按官方文档省略 api_mode；无关顶层键不受影响
    expect(config.model).toEqual({
      default: "qwen3-coder-plus",
      provider: "custom",
      base_url: OAI_URL,
      api_key: "sk-h",
    });
    expect(config.custom_providers).toHaveLength(1);

    // anthropic 端点：必须带 api_mode = anthropic_messages
    hermes.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-h",
      model: "qwen3-max",
    });
    const config2 = yaml.parse(
      readFileSync(join(home, ".hermes", "config.yaml"), "utf8"),
    );
    expect(config2.model).toEqual({
      default: "qwen3-max",
      provider: "custom",
      base_url: ANTHROPIC_URL,
      api_key: "sk-h",
      api_mode: "anthropic_messages",
    });
  });

  test("codex 写入 config.toml 与 auth.json（官方 env_key 结构，合并保留）", () => {
    // 预置 config.toml 无关顶层键与另一个 provider，验证非破坏性合并
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      [
        'approval_policy = "on-request"',
        "",
        "[model_providers.other]",
        'name = "other"',
        'base_url = "https://other.example.com/v1"',
        "",
      ].join("\n"),
    );
    // 预置 auth.json 无关键，验证合并保留
    writeFileSync(
      join(home, ".codex", "auth.json"),
      JSON.stringify({ EXISTING: "keep" }),
    );

    codex.write({
      baseUrl: OAI_URL,
      apiKey: "sk-x",
      model: "qwen3-coder-plus",
    });
    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(toml).toContain('model_provider = "bailian-cli"');
    expect(toml).toContain('model = "qwen3-coder-plus"');
    expect(toml).toContain("[model_providers.bailian-cli]");
    expect(toml).toContain(`base_url = "${OAI_URL}"`);
    expect(toml).toContain('env_key = "OPENAI_API_KEY"');
    // 未传 --wire-api 时默认 chat（所有模型可用）
    expect(toml).toContain('wire_api = "chat"');
    expect(toml).toContain("requires_openai_auth = true");
    // 合并：保留用户已有的无关配置
    expect(toml).toContain('approval_policy = "on-request"');
    expect(toml).toContain("[model_providers.other]");

    const auth = readJsonAt(".codex", "auth.json");
    expect(auth.OPENAI_API_KEY).toBe("sk-x");
    expect(auth.EXISTING).toBe("keep");

    // --wire-api responses：支持 Responses API 的模型
    codex.write({
      baseUrl: OAI_URL,
      apiKey: "sk-x",
      model: "qwen3.7-plus",
      wireApi: "responses",
    });
    const toml2 = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(toml2).toContain('wire_api = "responses"');
    expect(toml2).toContain('model = "qwen3.7-plus"');
  });

  test("已存在的配置文件会被备份为 .bak.<epoch>", () => {
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      join(home, ".openclaw", "openclaw.json"),
      JSON.stringify({ pre: 1 }),
    );

    openclaw.write({ baseUrl: OAI_URL, apiKey: "sk-c", model: "qwen3-max" });
    const backups = readdirSync(join(home, ".openclaw")).filter((name) =>
      name.startsWith("openclaw.json.bak."),
    );
    expect(backups).toHaveLength(1);
  });
});
