import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import {
  type ApiKeyCredential,
  Client,
  ExitCode,
  type Identity,
  type Settings,
} from "bailian-cli-core";
import {
  assertProviderCredentials,
  type CredentialHost,
  injectProviderCredentials,
  prepareProviderEnv,
  scrubCredentialEnv,
} from "../src/commands/managed-agent/_engine/credentials.ts";

/**
 * 凭证内存注入管道:injectProviderCredentials 把 authStage 解析进 Client 的凭证
 * 权威覆写 bailian 配置块(不落 env),scrubCredentialEnv 清空所有凭证 env,
 * assertProviderCredentials 对空 key 给 CLI 权威 AUTH 错误。用快照隔离凭证 env。
 */
const TRACKED_ENV = [
  "DASHSCOPE_API_KEY",
  "BAILIAN_API_KEY",
  "BAILIAN_BASE_URL",
  "BAILIAN_WORKSPACE_ID",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "ARK_API_KEY",
  "QODER_PAT",
  "QODER_API_KEY",
  "AGENTS_CONFIG_PATH",
  "AGENTS_PROVIDER",
];

let envSnapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  envSnapshot = Object.fromEntries(TRACKED_ENV.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of TRACKED_ENV) {
    const value = envSnapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const identity: Identity = {
  binName: "bl",
  version: "0.0.0-test",
  npmPackage: "bailian-cli",
  clientName: "bailian-cli",
};

function makeHost(options: { apiCred?: ApiKeyCredential; workspaceId?: string }): CredentialHost {
  const settings = { workspaceId: options.workspaceId } as Settings;
  return {
    settings,
    client: new Client({
      identity,
      settings,
      baseUrl: options.apiCred?.baseUrl ?? "https://dashscope.aliyuncs.com",
      apiCred: options.apiCred,
    }),
  };
}

function bailianCred(
  token = "sk-auth-chain",
  baseUrl = "https://dashscope.aliyuncs.com",
): ApiKeyCredential {
  return { token, baseUrl, source: "config" };
}

test("inject:bailian api_key 无条件覆盖(含 yaml 字面量),base_url 空则拼 agentstudio 后缀", () => {
  const providers = { bailian: { api_key: "literal-from-yaml", base_url: "" } };
  injectProviderCredentials(providers, makeHost({ apiCred: bailianCred() }));
  expect(providers.bailian.api_key).toBe("sk-auth-chain");
  expect(providers.bailian.base_url).toBe("https://dashscope.aliyuncs.com/api/v1/agentstudio");
});

test("inject:base_url 已带后缀不重复拼;非空字面量 base_url 保留", () => {
  const withSuffix = { bailian: { api_key: "", base_url: "" } };
  injectProviderCredentials(
    withSuffix,
    makeHost({
      apiCred: bailianCred("t", "https://x.maas.aliyuncs.com/api/v1/agentstudio"),
    }),
  );
  expect(withSuffix.bailian.base_url).toBe("https://x.maas.aliyuncs.com/api/v1/agentstudio");

  const literal = {
    bailian: {
      api_key: "",
      base_url: "https://custom.example.com/api/v1/agentstudio",
    },
  };
  injectProviderCredentials(literal, makeHost({ apiCred: bailianCred() }));
  expect(literal.bailian.base_url).toBe("https://custom.example.com/api/v1/agentstudio");
});

test("inject:workspace_id 引用且为空时用 settings 填充;有字面量则保留", () => {
  const empty = { bailian: { api_key: "", workspace_id: "" } };
  injectProviderCredentials(
    empty,
    makeHost({ apiCred: bailianCred(), workspaceId: "ws-settings" }),
  );
  expect(empty.bailian.workspace_id).toBe("ws-settings");

  const literal = { bailian: { api_key: "", workspace_id: "ws-yaml" } };
  injectProviderCredentials(
    literal,
    makeHost({ apiCred: bailianCred(), workspaceId: "ws-settings" }),
  );
  expect(literal.bailian.workspace_id).toBe("ws-yaml");
});

test("inject:无凭证(dry-run)时 bailian 块保持不变", () => {
  const providers = { bailian: { api_key: "", base_url: "" } };
  injectProviderCredentials(providers, makeHost({}));
  expect(providers.bailian.api_key).toBe("");
  expect(providers.bailian.base_url).toBe("");
});

test("inject:非 bailian provider 块不被触碰", () => {
  const providers = {
    claude: { api_key: "sk-ant" },
    ark: { api_key: "ark-key" },
  };
  injectProviderCredentials(providers, makeHost({ apiCred: bailianCred() }));
  expect(providers.claude.api_key).toBe("sk-ant");
  expect(providers.ark.api_key).toBe("ark-key");
});

test("assert:所有已声明 provider 的 key 非空时通过", () => {
  expect(() =>
    assertProviderCredentials({
      bailian: { api_key: "x" },
      claude: { api_key: "y" },
    }),
  ).not.toThrow();
});

test("assert:claude key 为空抛 AUTH 且 hint 指向 ANTHROPIC_API_KEY", () => {
  let thrown: unknown;
  try {
    assertProviderCredentials({ claude: { api_key: "" } });
  } catch (error) {
    thrown = error;
  }
  const err = thrown as { exitCode?: number; hint?: string; message?: string };
  expect(err.exitCode).toBe(ExitCode.AUTH);
  expect(err.hint).toContain("ANTHROPIC_API_KEY");
  expect(err.message).toContain("claude");
});

test("assert:bailian key 为空(dry-run/未登录)抛 AUTH 且 hint 指向 bl auth login", () => {
  let thrown: unknown;
  try {
    assertProviderCredentials({ bailian: { api_key: "" } });
  } catch (error) {
    thrown = error;
  }
  const err = thrown as { exitCode?: number; hint?: string };
  expect(err.exitCode).toBe(ExitCode.AUTH);
  expect(err.hint).toContain("bl auth login");
});

test("scrub:所有凭证 env 变量被删除", () => {
  process.env.DASHSCOPE_API_KEY = "x";
  process.env.ANTHROPIC_API_KEY = "y";
  process.env.ARK_API_KEY = "z";
  process.env.BAILIAN_BASE_URL = "u";
  process.env.QODER_PAT = "q";
  scrubCredentialEnv();
  expect(process.env.DASHSCOPE_API_KEY).toBeUndefined();
  expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(process.env.ARK_API_KEY).toBeUndefined();
  expect(process.env.BAILIAN_BASE_URL).toBeUndefined();
  expect(process.env.QODER_PAT).toBeUndefined();
});

test("prepare:调用后凭证变量均已定义,避免 yaml 插值抛错", () => {
  // 指向不存在的 agents 配置,隔离宿主 ~/.agents/config.json 干扰
  process.env.AGENTS_CONFIG_PATH = join(tmpdir(), "no-such-agents-config.json");
  delete process.env.ARK_API_KEY;
  delete process.env.QODER_API_KEY;
  prepareProviderEnv();
  // 契约:每个凭证变量都被占位或填充,插值不会因 undefined 抛错
  expect(process.env.ARK_API_KEY).toBeDefined();
  expect(process.env.QODER_API_KEY).toBeDefined();
});
