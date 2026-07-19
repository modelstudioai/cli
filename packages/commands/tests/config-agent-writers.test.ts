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
 * 结构以阿里云百炼官方文档为准。
 */

const OAI_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const ANTHROPIC_URL = "https://dashscope.aliyuncs.com/apps/anthropic";

let home = "";
let prevHome: string | undefined;
let prevCodexHome: string | undefined;
let prevClaudeDir: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bl-agent-writer-"));
  prevHome = process.env.HOME;
  prevCodexHome = process.env.CODEX_HOME;
  prevClaudeDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.HOME = home;
  delete process.env.CODEX_HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  expect(homedir()).toBe(home);
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = prevCodexHome;
  if (prevClaudeDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = prevClaudeDir;
  rmSync(home, { recursive: true, force: true });
});

function readJsonAt(...segments: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(home, ...segments), "utf8"));
}

describe("config agent writers", () => {
  test("claude-code 写入 env 与 onboarding，并合并已有 env", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ env: { KEEP_ME: "1" }, other: true }),
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
    expect(env.ANTHROPIC_MODEL).toBe("qwen3-max");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("qwen3-max");
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("qwen3-max");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("qwen3-max");
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("qwen3-max");

    expect(readJsonAt(".claude.json").hasCompletedOnboarding).toBe(true);
  });

  test("claude-code 尊重 CLAUDE_CONFIG_DIR", () => {
    const dir = join(home, "custom-claude");
    process.env.CLAUDE_CONFIG_DIR = dir;
    claudeCode.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-a",
      model: "qwen3-max",
    });
    const settings = JSON.parse(
      readFileSync(join(dir, "settings.json"), "utf8"),
    );
    expect((settings.env as Record<string, string>).ANTHROPIC_BASE_URL).toBe(
      ANTHROPIC_URL,
    );
  });

  test("qwen-code compatible-mode 走 openai 协议（官方结构）", () => {
    qwenCode.write({
      baseUrl: OAI_URL,
      apiKey: "sk-q",
      model: "qwen3-coder-plus",
    });
    const settings = readJsonAt(".qwen", "settings.json");
    const security = settings.security as { auth: Record<string, unknown> };
    expect(security.auth.selectedType).toBe("openai");
    // 不写已废弃的 apiKey/baseUrl
    expect(security.auth.apiKey).toBeUndefined();
    expect(security.auth.baseUrl).toBeUndefined();
    expect(settings.$version).toBe(3);
    expect((settings.env as Record<string, string>).BAILIAN_API_KEY).toBe(
      "sk-q",
    );
    expect(settings.model).toEqual({ name: "qwen3-coder-plus" });
    const providers = settings.modelProviders as Record<
      string,
      Array<Record<string, unknown>>
    >;
    expect(providers.openai[0]).toMatchObject({
      id: "qwen3-coder-plus",
      name: "[Bailian] qwen3-coder-plus",
      baseUrl: OAI_URL,
      envKey: "BAILIAN_API_KEY",
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

  test("opencode 按端点选 npm（无 setCacheKey），合并保留其它 provider", () => {
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
    expect(options.setCacheKey).toBeUndefined();
    expect(
      (provider["bailian-cli"].models as Record<string, unknown>)["qwen3-max"],
    ).toBeDefined();

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

  test("opencode 存在 .jsonc 时写入 .jsonc", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(join(home, ".config", "opencode", "opencode.jsonc"), "{}\n");
    const summary = opencode.write({
      baseUrl: OAI_URL,
      apiKey: "sk-o",
      model: "qwen3-max",
    });
    expect(summary.paths[0].endsWith("opencode.jsonc")).toBe(true);
  });

  test("openclaw 不传 contextWindow 时不写该字段", () => {
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
    expect(entry.contextWindow).toBeUndefined();
    const agents = config.agents as {
      defaults: { model: { primary: string }; models: Record<string, unknown> };
    };
    expect(agents.defaults.model.primary).toBe("bailian-cli/qwen3-coder-plus");
    expect(
      agents.defaults.models["bailian-cli/qwen3-coder-plus"],
    ).toBeDefined();
  });

  test("openclaw 传 contextWindow 时写入该字段；anthropic 端点用 anthropic-messages", () => {
    openclaw.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-c",
      model: "qwen3-max",
      contextWindow: 262144,
    });
    const config = readJsonAt(".openclaw", "openclaw.json");
    const bailian = (
      (config.models as Record<string, unknown>).providers as Record<
        string,
        Record<string, unknown>
      >
    )["bailian-cli"];
    expect(bailian.api).toBe("anthropic-messages");
    expect(
      (bailian.models as Array<Record<string, unknown>>)[0].contextWindow,
    ).toBe(262144);
  });

  test("hermes 官方扁平 model.* 结构；anthropic 端点带 api_mode", () => {
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(
      join(home, ".hermes", "config.yaml"),
      yaml.stringify({ agent: { max_turns: 5 } }),
    );

    hermes.write({
      baseUrl: ANTHROPIC_URL,
      apiKey: "sk-h",
      model: "qwen3-max",
    });
    const config = yaml.parse(
      readFileSync(join(home, ".hermes", "config.yaml"), "utf8"),
    );
    // 合并保留其它顶层键
    expect(config.agent).toEqual({ max_turns: 5 });
    expect(config.model).toEqual({
      default: "qwen3-max",
      provider: "custom",
      base_url: ANTHROPIC_URL,
      api_key: "sk-h",
      api_mode: "anthropic_messages",
    });
    expect(config.custom_providers).toBeUndefined();
  });

  test("hermes OpenAI 兼容端点省略 api_mode", () => {
    hermes.write({
      baseUrl: OAI_URL,
      apiKey: "sk-h",
      model: "qwen3-coder-plus",
    });
    const config = yaml.parse(
      readFileSync(join(home, ".hermes", "config.yaml"), "utf8"),
    );
    expect(config.model.api_mode).toBeUndefined();
    expect(config.model.base_url).toBe(OAI_URL);
  });

  test("codex 官方 env_key 结构；合并保留其它配置", () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      [
        'approval_policy = "on-request"',
        "",
        "[model_providers.other]",
        'name = "other"',
        "",
      ].join("\n"),
    );
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
    expect(toml).toContain('wire_api = "responses"');
    // 不再包含 cc-switch 专有字段
    expect(toml).not.toContain("requires_openai_auth");
    expect(toml).not.toContain("model_reasoning_effort");
    expect(toml).not.toContain("disable_response_storage");
    // 合并保留
    expect(toml).toContain('approval_policy = "on-request"');
    expect(toml).toContain("[model_providers.other]");

    const auth = readJsonAt(".codex", "auth.json");
    expect(auth.OPENAI_API_KEY).toBe("sk-x");
    expect(auth.EXISTING).toBe("keep");
  });

  test("codex 尊重 CODEX_HOME", () => {
    const dir = join(home, "custom-codex");
    process.env.CODEX_HOME = dir;
    codex.write({
      baseUrl: OAI_URL,
      apiKey: "sk-x",
      model: "qwen3-coder-plus",
    });
    expect(readFileSync(join(dir, "config.toml"), "utf8")).toContain(
      'model_provider = "bailian-cli"',
    );
    expect(
      JSON.parse(readFileSync(join(dir, "auth.json"), "utf8")).OPENAI_API_KEY,
    ).toBe("sk-x");
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

  test("已有配置解析失败时抛错，不覆盖原文件", () => {
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    const path = join(home, ".openclaw", "openclaw.json");
    writeFileSync(path, "{ this is not valid json");
    expect(() =>
      openclaw.write({ baseUrl: OAI_URL, apiKey: "sk-c", model: "qwen3-max" }),
    ).toThrow(/Failed to parse/);
    // 原文件保持不变
    expect(readFileSync(path, "utf8")).toBe("{ this is not valid json");
  });
});
