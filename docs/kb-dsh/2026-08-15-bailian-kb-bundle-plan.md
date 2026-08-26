# bailian-kb-bundle 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle` 新建独立 pnpm workspace，交付一个可通过 `dsh plugin add` 安装的 dsh bundle：三个 API 直连知识库工具（`kb_service_list` / `kb_search` / `kb_chat`）+ kscli 管理面 skill。

**Architecture:** 两包结构——`dsh-tool-bailian-kb`（Cordis 函数插件：Config、KbClient、工具工厂、skill 注册）+ `bailian-kb-bundle`（`dsh.bundle` 分发面：cordis.patch.yml）。工具逻辑与 Cordis 解耦为纯函数/类（endpoints、client、SSE、services、tools 工厂），`apply()` 只做装配，测试不需要 Cordis 容器。

**Tech Stack:** TypeScript strict + NodeNext ESM（相对导入用 `.js` 后缀）、`@deepseek-ai/cordis@4.0.1`（peer+dev）、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-skill`（类型）、`@deepseek-ai/schemastery@3.18.1`、vitest、tsc 构建（输出 `lib/`）。

**设计依据（spec）:** `deepseek-harness/docs/superpowers/specs/2026-08-15-bailian-kb-bundle-design.md`

---

## 已验证的 API 事实（实现的唯一依据，来自 modelstudioai/cli 源码）

所有 endpoint 的 host 为 **workspace 子域名**：`https://${workspaceId}.${endpointHost}`，默认 `endpointHost = cn-beijing.maas.aliyuncs.com`。鉴权统一 `Authorization: Bearer ${DASHSCOPE_API_KEY}`。

**1. 服务列表** `POST /api/v1/indices/rag/app/list`
请求体：`{ agent_scene: 'chat'|'search'（必填）, agent_name?: string, page_number: number, page_size: number（1-100） }`
响应：`{ code, message, data: { total_count?: number, rows?: Array<{ agent_id?, agent_name?, agent_scene?, agent_status?, pipeline_list?: Array<{ pipeline_id?, pipeline_name? }> }> } }`

**2. 检索** `POST /api/v1/indices/knowledge/search`
请求体：`{ query: string, agent_id: string, agent_version?: string, images?: string[] }`（**无 top_k 参数**，条数由服务端配置决定；top_k 为客户端截断）
响应：`{ code, status_code, request_id, data: { total, cost_time, nodes: Array<{ score: number, text: string, metadata: { title?, doc_id?, doc_name?, doc_url?, page_number?, ... } }> } }`

**3. 问答** `POST /api/v2/apps/knowledge/chat`（**仅 SSE**）
请求体：`{ input: { messages: Array<{ role: 'user'|'assistant', content: string }> }, parameters: { agent_options: { agent_id, agent_version? } }, stream: true }`
SSE：`data: [DONE]` 结束；`event: error` 的 data 为 `{ code?, message? }`；普通 chunk：
`{ output: { choices: Array<{ message: { role, content, extra?: { step_change?, step?, group? } }, finish_reason: string }> }, code, message, request_id }`
`content` 为**增量**（delta），拼接即完整答案；事件序列 `tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end`，`tool_calling→tool_return` 可循环多次（服务端 agentic loop，耗时可达分钟级）。

**4. dsh 侧已验证接口**：`ctx.tools.register(defineTool({...}))`（模板：deepseek-harness `packages/todo/tool-todo/src/index.ts`）；`ctx.credentials.resolve(credentialRef('DASHSCOPE_API_KEY'))` 返回 `Promise<{ value, source } | undefined>`，**逐次调用不缓存**；`ctx.skills.register({ name, description, whenToUse?, content, source: 'bundled', resourceBase? })` 返回 disposer；bundle patch 语法为顶层 `- insert:` 行数组（模板：`packages/bundle/base/cordis.patch.yml`）。

## 文件结构

```
/Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle/
├── package.json                # 根：private，scripts（build/test/typecheck）
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── .gitignore
└── packages/
    ├── tool-bailian-kb/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── skills/bailian-kb-management/SKILL.md   # kscli 管理面 skill
    │   ├── src/
    │   │   ├── index.ts        # 插件入口：name/inject/Config/apply（只做装配）
    │   │   ├── api-types.ts    # 上述 API 请求/响应类型
    │   │   ├── endpoints.ts    # 纯函数：URL 拼接 + 协议路径常量
    │   │   ├── client.ts       # KbClient：Bearer 鉴权、JSON/SSE 请求、KbApiError
    │   │   ├── sse.ts          # 最小 SSE 解析器（async generator）
    │   │   ├── chat.ts         # consumeChatStream：SSE → 完整答案（缓冲）
    │   │   ├── services.ts     # listServices：scene 合并 + 分页内化 + 截断提示
    │   │   ├── tools.ts        # createKbTools：三个工具定义（纯工厂）
    │   │   └── skill.ts        # registerSkill：ctx.skills 运行时注册
    │   └── tests/
    │       ├── config.test.ts
    │       ├── endpoints.test.ts
    │       ├── client.test.ts
    │       ├── sse.test.ts
    │       ├── chat.test.ts
    │       ├── services.test.ts
    │       └── tools.test.ts
    └── bundle/
        ├── package.json        # bailian-kb-bundle：dsh.bundle 声明
        └── cordis.patch.yml    # insert 插件 row（workspaceId 走 !!js env）
```

---

### Task 1: 仓库脚手架与依赖可用性验证

**Files:**

- Create: `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`vitest.config.ts`、`.gitignore`

- [ ] **Step 1: 验证 npm 依赖存在**

```bash
npm view @deepseek-ai/cordis version && npm view @deepseek-ai/dsh-tools version && npm view @deepseek-ai/schemastery version && npm view @deepseek-ai/dsh-credentials version && npm view @deepseek-ai/dsh-skill version
```

Expected: 五行版本号（已确认 cordis 4.0.1、dsh-tools 0.0.1-rc.1、schemastery 3.18.1；后两个若 404，改用 `github:` 依赖或从 dsh 安装闭包解析——此时停下向用户报告，不要静默绕过）。

- [ ] **Step 2: 初始化目录与 git**

```bash
mkdir -p /Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle && cd /Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle && git init
```

- [ ] **Step 3: 写根配置文件**

`package.json`：

```json
{
  "name": "bailian-kb-workspace",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "vitest run",
    "typecheck": "tsc -b packages/tool-bailian-kb"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - packages/*
```

`tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["packages/*/tests/**/*.test.ts"] },
});
```

`.gitignore`：

```
node_modules/
lib/
*.tsbuildinfo
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm workspace"
```

### Task 2: 插件包骨架与 Config schema

**Files:**

- Create: `packages/tool-bailian-kb/package.json`、`packages/tool-bailian-kb/tsconfig.json`、`packages/tool-bailian-kb/src/index.ts`（先只有 Config）
- Test: `packages/tool-bailian-kb/tests/config.test.ts`

- [ ] **Step 1: 写包配置**

`packages/tool-bailian-kb/package.json`：

```json
{
  "name": "dsh-tool-bailian-kb",
  "version": "0.1.0",
  "description": "Bailian knowledge-base tools for DeepSeek Harness: kb_service_list, kb_search, kb_chat over the DashScope RAG API, plus the kscli management skill.",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "skills"],
  "scripts": { "build": "tsc -b" },
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.1" },
  "dependencies": {
    "@deepseek-ai/dsh-tools": "^0.0.1-rc.1",
    "@deepseek-ai/dsh-credentials": "*",
    "@deepseek-ai/dsh-skill": "*",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "devDependencies": { "@deepseek-ai/cordis": "^4.0.1", "@types/node": "^22.0.0" }
}
```

（`*` 处安装后锁到 `pnpm install` 解析出的当前 rc 版本，手动改回具体 `^` 范围。）

`packages/tool-bailian-kb/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "lib" },
  "include": ["src"]
}
```

- [ ] **Step 2: 写失败测试**

`packages/tool-bailian-kb/tests/config.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { Config } from "../src/index.js";

describe("Config", () => {
  it("applies defaults and keeps required workspaceId", () => {
    const resolved = new Config({ workspaceId: "ws-1" });
    expect(resolved.workspaceId).toBe("ws-1");
    expect(resolved.endpointHost).toBe("cn-beijing.maas.aliyuncs.com");
    expect(resolved.chatTimeoutMs).toBe(300_000);
    expect(resolved.defaultAgentId).toBeUndefined();
  });

  it("rejects a missing workspaceId (fail loud at load)", () => {
    expect(() => new Config({} as never)).toThrow();
  });
});
```

- [ ] **Step 3: 运行确认失败**

```bash
cd /Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle && pnpm install && pnpm vitest run packages/tool-bailian-kb/tests/config.test.ts
```

Expected: FAIL（`../src/index.js` 不存在）。

- [ ] **Step 4: 实现 Config**

`packages/tool-bailian-kb/src/index.ts`：

```ts
/**
 * Bailian knowledge-base consumer plugin: registers kb_service_list, kb_search,
 * and kb_chat over the DashScope RAG API, plus the kscli management skill.
 * @module dsh-tool-bailian-kb
 */

import z from "@deepseek-ai/schemastery";

export const name = "tool-bailian-kb";
export const inject = ["tools", "credentials"];

/** Bailian knowledge-base plugin configuration. */
export interface Config {
  /** Bailian workspace id; the API host is the workspace subdomain `https://<workspaceId>.<endpointHost>`. */
  workspaceId: string;
  /** API host suffix; replace for other regions or private deployments. */
  endpointHost: string;
  /** Retrieval-service id pinned by this deployment; when set, the tools' agent_id parameter becomes optional. */
  defaultAgentId?: string;
  /** Service version to call: `beta` (draft) or a published number; defaults to the latest published version. Never model-visible. */
  agentVersion?: string;
  /** kb_chat timeout in milliseconds; the server side is a minutes-scale agentic loop. */
  chatTimeoutMs: number;
}

/** Schemastery validation for {@link Config}; a missing workspaceId fails at load. */
export const Config: z<Config> = z.object({
  workspaceId: z.string().required(),
  endpointHost: z.string().default("cn-beijing.maas.aliyuncs.com"),
  defaultAgentId: z.string(),
  agentVersion: z.string(),
  chatTimeoutMs: z.number().default(300_000),
});
```

- [ ] **Step 5: 运行确认通过 & Commit**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/config.test.ts
git add -A && git commit -m "feat: plugin package skeleton with validated Config"
```

### Task 3: endpoints 纯函数与 API 类型

**Files:**

- Create: `packages/tool-bailian-kb/src/endpoints.ts`、`packages/tool-bailian-kb/src/api-types.ts`
- Test: `packages/tool-bailian-kb/tests/endpoints.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/tool-bailian-kb/tests/endpoints.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { KB_PATHS, kbEndpoint } from "../src/endpoints.js";

describe("kbEndpoint", () => {
  it("builds the workspace-subdomain URL", () => {
    expect(kbEndpoint("cn-beijing.maas.aliyuncs.com", "ws-1", KB_PATHS.search)).toBe(
      "https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search",
    );
  });

  it("keeps protocol paths as constants", () => {
    expect(KB_PATHS.chat).toBe("/api/v2/apps/knowledge/chat");
    expect(KB_PATHS.serviceList).toBe("/api/v1/indices/rag/app/list");
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/endpoints.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`packages/tool-bailian-kb/src/endpoints.ts`：

```ts
/** Protocol path constants and the workspace-subdomain URL builder (external API spec; not configurable). */

/** DashScope knowledge API paths, mirrored from the verified kscli endpoint table. */
export const KB_PATHS = {
  serviceList: "/api/v1/indices/rag/app/list",
  search: "/api/v1/indices/knowledge/search",
  chat: "/api/v2/apps/knowledge/chat",
} as const;

/**
 * Build one knowledge API endpoint.
 * @param endpointHost - host suffix, e.g. `cn-beijing.maas.aliyuncs.com`.
 * @param workspaceId - Bailian workspace id used as the subdomain.
 * @param path - one {@link KB_PATHS} value.
 * @returns the absolute endpoint URL.
 */
export function kbEndpoint(endpointHost: string, workspaceId: string, path: string): string {
  return `https://${workspaceId}.${endpointHost}${path}`;
}
```

`packages/tool-bailian-kb/src/api-types.ts`：

```ts
/** Request/response fields of the three DashScope knowledge endpoints, mirrored from the verified kscli types. */

export interface ServiceListRequest {
  agent_scene: "chat" | "search";
  agent_name?: string;
  page_number: number;
  page_size: number;
}

export interface ServiceListRow {
  agent_id?: string;
  agent_name?: string;
  agent_scene?: string;
  agent_status?: string;
  pipeline_list?: { pipeline_id?: string; pipeline_name?: string }[];
}

export interface ServiceListResponse {
  code?: string;
  message?: string;
  data?: { total_count?: number; rows?: ServiceListRow[] };
}

export interface SearchRequest {
  query: string;
  agent_id: string;
  agent_version?: string;
  images?: string[];
}

export interface SearchResponse {
  request_id?: string;
  data?: {
    total?: number;
    nodes?: { score: number; text: string; metadata?: Record<string, unknown> }[];
  };
}

export interface ChatRequest {
  input: { messages: { role: "user" | "assistant"; content: string }[] };
  parameters: { agent_options: { agent_id: string; agent_version?: string } };
  stream: true;
}

export interface ChatStreamChunk {
  output?: {
    choices?: {
      message?: { content?: string; extra?: { step_change?: string } };
      finish_reason?: string;
    }[];
  };
  request_id?: string;
}
```

- [ ] **Step 4: 运行确认通过 & Commit**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/endpoints.test.ts
git add -A && git commit -m "feat: endpoint builder and API types"
```

### Task 4: KbClient（鉴权、JSON/SSE 请求、错误翻译）

**Files:**

- Create: `packages/tool-bailian-kb/src/client.ts`
- Test: `packages/tool-bailian-kb/tests/client.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/tool-bailian-kb/tests/client.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { KbApiError, KbClient } from "../src/client.js";

function makeClient(fetchImpl: typeof fetch) {
  return new KbClient({
    workspaceId: "ws-1",
    endpointHost: "cn-beijing.maas.aliyuncs.com",
    resolveApiKey: async () => "sk-test",
    fetchImpl,
  });
}

describe("KbClient.postJson", () => {
  it("sends Bearer auth to the workspace endpoint and returns parsed JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const result = await client.postJson<{ ok: number }>("/api/v1/indices/knowledge/search", {
      query: "q",
    });
    expect(result.ok).toBe(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(init.method).toBe("POST");
  });

  it("translates a non-2xx into KbApiError with status and a bounded body summary", async () => {
    const body = JSON.stringify({ code: "InvalidParameter", message: "agent not found" });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 400 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const err = await client
      .postJson("/api/v1/indices/knowledge/search", {})
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KbApiError);
    expect((err as KbApiError).status).toBe(400);
    expect((err as KbApiError).message).toContain("agent not found");
  });

  it("re-resolves the API key per call (credential hot-swap contract)", async () => {
    const resolveApiKey = vi.fn(async () => "sk-test");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = new KbClient({
      workspaceId: "ws-1",
      endpointHost: "h",
      resolveApiKey,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.postJson("/p", {});
    await client.postJson("/p", {});
    expect(resolveApiKey).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/client.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`packages/tool-bailian-kb/src/client.ts`：

```ts
/** Shared HTTP client for the knowledge endpoints: per-call Bearer auth, JSON/SSE POST, and error translation. */

import { kbEndpoint } from "./endpoints.js";

/** Maximum error-body characters kept in a translated message. */
const ERROR_BODY_LIMIT = 500;

/** One knowledge API failure: HTTP status plus a bounded server-body summary. */
export class KbApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "KbApiError";
  }
}

export interface KbClientOptions {
  workspaceId: string;
  endpointHost: string;
  /** Service version forwarded on search/chat when set (deployment debug choice). */
  agentVersion?: string;
  /** Resolves the current DASHSCOPE_API_KEY per call; throws with guidance when unconfigured. */
  resolveApiKey: () => Promise<string>;
  /** Test seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class KbClient {
  constructor(private readonly opts: KbClientOptions) {}

  /** The deployment's configured service version, exposed for request builders. */
  get agentVersion(): string | undefined {
    return this.opts.agentVersion;
  }

  private async post(
    path: string,
    body: unknown,
    accept: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const apiKey = await this.opts.resolveApiKey();
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const url = kbEndpoint(this.opts.endpointHost, this.opts.workspaceId, path);
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: accept,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const raw = (await res.text().catch(() => "")).slice(0, ERROR_BODY_LIMIT);
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string; code?: string };
        if (parsed.message)
          detail = parsed.code ? `${parsed.code}: ${parsed.message}` : parsed.message;
      } catch {
        /* non-JSON error body: keep the bounded raw text */
      }
      throw new KbApiError(
        `knowledge API ${path} failed (HTTP ${res.status}): ${detail}`,
        res.status,
      );
    }
    return res;
  }

  /**
   * POST one JSON request and parse the JSON response.
   * @param path - one KB_PATHS value.
   * @param body - JSON-serializable request body.
   * @param signal - optional abort/timeout signal.
   * @returns the parsed response.
   */
  async postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.post(path, body, "application/json", signal);
    return (await res.json()) as T;
  }

  /**
   * POST one JSON request expecting an SSE response stream.
   * @param path - one KB_PATHS value.
   * @param body - JSON-serializable request body.
   * @param signal - abort/timeout signal (kb_chat passes its configured timeout).
   * @returns the raw Response whose body is the SSE stream.
   */
  async postSse(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return await this.post(path, body, "text/event-stream", signal);
  }
}
```

- [ ] **Step 4: 运行确认通过 & Commit**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/client.test.ts
git add -A && git commit -m "feat: KbClient with per-call auth and error translation"
```

### Task 5: SSE 解析与 chat 缓冲消费

**Files:**

- Create: `packages/tool-bailian-kb/src/sse.ts`、`packages/tool-bailian-kb/src/chat.ts`
- Test: `packages/tool-bailian-kb/tests/sse.test.ts`、`packages/tool-bailian-kb/tests/chat.test.ts`

- [ ] **Step 1: 写失败测试（SSE 解析器）**

`packages/tool-bailian-kb/tests/sse.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { parseSseStream } from "../src/sse.js";

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body as ReadableStream<Uint8Array>;
}

async function collect(text: string) {
  const events: { event?: string; data: string }[] = [];
  for await (const e of parseSseStream(streamOf(text))) events.push(e);
  return events;
}

describe("parseSseStream", () => {
  it("yields data events split on blank lines", async () => {
    const events = await collect('data: {"a":1}\n\ndata: [DONE]\n\n');
    expect(events).toEqual([
      { event: undefined, data: '{"a":1}' },
      { event: undefined, data: "[DONE]" },
    ]);
  });

  it("carries the event field and survives chunk boundaries inside a line", async () => {
    const events = await collect('event: error\ndata: {"message":"boom"}\n\n');
    expect(events[0]).toEqual({ event: "error", data: '{"message":"boom"}' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/sse.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 SSE 解析器**

`packages/tool-bailian-kb/src/sse.ts`：

```ts
/** Minimal SSE parser for the knowledge chat stream: `event:`/`data:` lines, events split on blank lines. */

export interface SseEvent {
  event?: string;
  data: string;
}

/**
 * Parse one SSE byte stream into events.
 * @param body - the response body stream.
 * @returns events in stream order; multi-`data:` events join with newlines per the SSE spec.
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];

  const flush = (): SseEvent | undefined => {
    if (data.length === 0) return undefined;
    const out = { event, data: data.join("\n") };
    event = undefined;
    data = [];
    return out;
  };

  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    buffer += done ? "" : decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line === "") {
        const out = flush();
        if (out) yield out;
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }
      // comment/id/retry lines are irrelevant to this API and are skipped
    }
    if (done) {
      const out = flush();
      if (out) yield out;
      return;
    }
  }
}
```

- [ ] **Step 4: SSE 测试通过后，写失败测试（chat 缓冲）**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/sse.test.ts   # Expected: PASS
```

`packages/tool-bailian-kb/tests/chat.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { consumeChatStream } from "../src/chat.js";

function sse(text: string): Response {
  return new Response(text, { status: 200 });
}

function chunk(content: string, finish = ""): string {
  return `data: ${JSON.stringify({ output: { choices: [{ message: { content }, finish_reason: finish }] }, request_id: "r-1" })}\n\n`;
}

describe("consumeChatStream", () => {
  it("concatenates delta content across chunks until [DONE]", async () => {
    const res = sse(chunk("Hello") + chunk(" world", "stop") + "data: [DONE]\n\n");
    const out = await consumeChatStream(res);
    expect(out.answer).toBe("Hello world");
    expect(out.requestId).toBe("r-1");
  });

  it("ignores step_change progress chunks with empty content", async () => {
    const progress = `data: ${JSON.stringify({ output: { choices: [{ message: { content: "", extra: { step_change: "tool_calling" } }, finish_reason: "" }] } })}\n\n`;
    const res = sse(progress + chunk("answer", "stop") + "data: [DONE]\n\n");
    expect((await consumeChatStream(res)).answer).toBe("answer");
  });

  it("throws on an SSE error event with the server message", async () => {
    const res = sse('event: error\ndata: {"code":"Throttling","message":"rate limited"}\n\n');
    await expect(consumeChatStream(res)).rejects.toThrow(/Throttling.*rate limited/);
  });
});
```

- [ ] **Step 5: 运行确认失败，然后实现**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/chat.test.ts   # Expected: FAIL
```

`packages/tool-bailian-kb/src/chat.ts`：

```ts
/** Buffered consumption of the knowledge chat SSE stream: deltas concatenate into one complete answer. */

import type { ChatStreamChunk } from "./api-types.js";
import { KbApiError } from "./client.js";
import { parseSseStream } from "./sse.js";

export interface ChatResult {
  answer: string;
  requestId?: string;
}

/**
 * Consume one chat SSE response to completion.
 * @param res - the SSE response from KbClient.postSse.
 * @returns the concatenated answer and the last seen request id.
 */
export async function consumeChatStream(res: Response): Promise<ChatResult> {
  if (!res.body) throw new KbApiError("knowledge chat returned no response body");
  let answer = "";
  let requestId: string | undefined;
  for await (const event of parseSseStream(res.body)) {
    if (event.data === "[DONE]") break;
    if (event.event === "error") {
      let message = `knowledge chat stream error: ${event.data}`;
      try {
        const err = JSON.parse(event.data) as { code?: string; message?: string };
        if (err.message)
          message = `knowledge chat stream error${err.code ? ` (${err.code})` : ""}: ${err.message}`;
      } catch {
        /* non-JSON error payload: keep the raw data in the message */
      }
      throw new KbApiError(message);
    }
    let parsed: ChatStreamChunk;
    try {
      parsed = JSON.parse(event.data) as ChatStreamChunk;
    } catch {
      continue;
    } // unparseable keep-alive/comment payloads carry no answer content
    if (parsed.request_id) requestId = parsed.request_id;
    for (const choice of parsed.output?.choices ?? []) {
      if (choice.message?.content) answer += choice.message.content;
    }
  }
  return { answer, requestId };
}
```

- [ ] **Step 6: 运行确认通过 & Commit**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/sse.test.ts packages/tool-bailian-kb/tests/chat.test.ts
git add -A && git commit -m "feat: SSE parser and buffered chat consumption"
```

### Task 6: listServices（scene 合并、分页内化、截断提示）

**Files:**

- Create: `packages/tool-bailian-kb/src/services.ts`
- Test: `packages/tool-bailian-kb/tests/services.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/tool-bailian-kb/tests/services.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import type { ServiceListResponse } from "../src/api-types.js";
import type { KbClient } from "../src/client.js";
import { listServices } from "../src/services.js";

function fakeClient(byScene: Record<string, ServiceListResponse>) {
  const postJson = vi.fn(
    async (_path: string, body: { agent_scene: string }) => byScene[body.agent_scene],
  );
  return { client: { postJson } as unknown as KbClient, postJson };
}

const row = (id: string, scene: string) => ({
  agent_id: id,
  agent_name: `svc-${id}`,
  agent_scene: scene,
  agent_status: "deployed",
  pipeline_list: [{ pipeline_id: "p1", pipeline_name: "kb-one" }],
});

describe("listServices", () => {
  it("queries both scenes when scene is omitted and merges rows with scene tags", async () => {
    const { client, postJson } = fakeClient({
      chat: { data: { total_count: 1, rows: [row("a", "chat")] } },
      search: { data: { total_count: 1, rows: [row("b", "search")] } },
    });
    const out = await listServices(client, {});
    expect(postJson).toHaveBeenCalledTimes(2);
    expect(out.services.map((s) => [s.agent_id, s.scene])).toEqual([
      ["a", "chat"],
      ["b", "search"],
    ]);
    expect(out.total).toBe(2);
    expect(out.truncated).toBe(false);
    const body = postJson.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.page_number).toBe(1);
    expect(body.page_size).toBe(100);
  });

  it("queries one scene and forwards the name filter", async () => {
    const { client, postJson } = fakeClient({ search: { data: { total_count: 0, rows: [] } } });
    await listServices(client, { scene: "search", nameFilter: "客服" });
    expect(postJson).toHaveBeenCalledTimes(1);
    expect((postJson.mock.calls[0]![1] as Record<string, unknown>).agent_name).toBe("客服");
  });

  it("flags truncation when a scene exceeds one max page", async () => {
    const { client } = fakeClient({
      chat: { data: { total_count: 250, rows: [row("a", "chat")] } },
      search: { data: { total_count: 0, rows: [] } },
    });
    const out = await listServices(client, {});
    expect(out.truncated).toBe(true);
    expect(out.total).toBe(250);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/services.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`packages/tool-bailian-kb/src/services.ts`：

```ts
/** Retrieval-service discovery: per-scene queries merged into one model-facing list; pagination stays internal. */

import type { ServiceListResponse } from "./api-types.js";
import type { KbClient } from "./client.js";
import { KB_PATHS } from "./endpoints.js";

/** Server page-size maximum; one page per scene covers ordinary workspaces. */
const MAX_PAGE_SIZE = 100;

export interface ServiceEntry {
  agent_id: string;
  name: string;
  scene: string;
  status: string;
  knowledge_bases: string[];
}

export interface ServiceList {
  services: ServiceEntry[];
  total: number;
  /** True when some scene reported more rows than one max page returned. */
  truncated: boolean;
}

export interface ListServicesQuery {
  scene?: "chat" | "search";
  nameFilter?: string;
}

/**
 * List retrieval/Q&A services. An omitted scene fans out to both scenes and merges.
 * @param client - the shared knowledge API client.
 * @param query - optional scene and fuzzy name filter.
 * @returns merged entries, the server-reported total, and the truncation flag.
 */
export async function listServices(
  client: KbClient,
  query: ListServicesQuery,
): Promise<ServiceList> {
  const scenes: ("chat" | "search")[] = query.scene ? [query.scene] : ["chat", "search"];
  const services: ServiceEntry[] = [];
  let total = 0;
  for (const scene of scenes) {
    const res = await client.postJson<ServiceListResponse>(KB_PATHS.serviceList, {
      agent_scene: scene,
      ...(query.nameFilter ? { agent_name: query.nameFilter } : {}),
      page_number: 1,
      page_size: MAX_PAGE_SIZE,
    });
    total += res.data?.total_count ?? 0;
    for (const row of res.data?.rows ?? []) {
      services.push({
        agent_id: row.agent_id ?? "",
        name: row.agent_name ?? "",
        scene: row.agent_scene ?? scene,
        status: row.agent_status ?? "",
        knowledge_bases: (row.pipeline_list ?? [])
          .map((p) => p.pipeline_name ?? p.pipeline_id ?? "")
          .filter(Boolean),
      });
    }
  }
  return { services, total, truncated: total > services.length };
}
```

- [ ] **Step 4: 运行确认通过 & Commit**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/services.test.ts
git add -A && git commit -m "feat: service discovery with scene merge and internalized pagination"
```

### Task 7: createKbTools 工具工厂（三工具 + defaultAgentId 静态 schema + 错误附清单）

**Files:**

- Create: `packages/tool-bailian-kb/src/tools.ts`
- Test: `packages/tool-bailian-kb/tests/tools.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/tool-bailian-kb/tests/tools.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { KbApiError, KbClient } from "../src/client.js";
import { createKbTools } from "../src/tools.js";

const EXEC = {} as never;

function toolsWith(postJson: unknown, postSse?: unknown, defaultAgentId?: string) {
  const client = { postJson, postSse, agentVersion: undefined } as unknown as KbClient;
  const list = createKbTools({ client, defaultAgentId, chatTimeoutMs: 1000 });
  const byName = Object.fromEntries(list.map((t) => [t.name, t]));
  return { byName, list };
}

const searchResponse = {
  request_id: "r1",
  data: {
    total: 3,
    nodes: [
      { score: 0.9, text: "A", metadata: { doc_name: "d1" } },
      { score: 0.8, text: "B", metadata: {} },
      { score: 0.7, text: "C", metadata: {} },
    ],
  },
};

describe("createKbTools", () => {
  it("registers exactly kb_service_list, kb_search, kb_chat", () => {
    const { list } = toolsWith(vi.fn());
    expect(list.map((t) => t.name).sort()).toEqual(["kb_chat", "kb_search", "kb_service_list"]);
  });

  it("kb_search truncates nodes client-side to top_k (default 5 documented, explicit here)", async () => {
    const postJson = vi.fn(async () => searchResponse);
    const { byName } = toolsWith(postJson);
    const out = (await byName.kb_search!.execute(
      { query: "q", agent_id: "aid-1", top_k: 2 },
      EXEC,
    )) as { chunks: unknown[] };
    expect(out.chunks).toHaveLength(2);
    const body = postJson.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("top_k"); // the server API has no such parameter
  });

  it("agent_id is required without defaultAgentId and optional with one", () => {
    const withoutDefault = toolsWith(vi.fn()).byName.kb_search!;
    const withDefault = toolsWith(vi.fn(), undefined, "aid-fixed").byName.kb_search!;
    expect(
      (withoutDefault.parameters as Record<string, { required?: boolean }>).agent_id!.required,
    ).toBe(true);
    expect(
      (withDefault.parameters as Record<string, { required?: boolean }>).agent_id!.required,
    ).toBeUndefined();
  });

  it("kb_search falls back to defaultAgentId as an explicit resolve step", async () => {
    const postJson = vi.fn(async () => searchResponse);
    const { byName } = toolsWith(postJson, undefined, "aid-fixed");
    await byName.kb_search!.execute({ query: "q" }, EXEC);
    expect((postJson.mock.calls[0]![1] as Record<string, unknown>).agent_id).toBe("aid-fixed");
  });

  it("a 4xx failure appends the current service list to the error", async () => {
    const postJson = vi.fn(async (path: string) => {
      if (path === "/api/v1/indices/knowledge/search") throw new KbApiError("agent not found", 400);
      return {
        data: {
          total_count: 1,
          rows: [
            {
              agent_id: "aid-9",
              agent_name: "faq",
              agent_scene: "search",
              agent_status: "deployed",
            },
          ],
        },
      };
    });
    const { byName } = toolsWith(postJson);
    const err = await byName
      .kb_search!.execute({ query: "q", agent_id: "bad" }, EXEC)
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain("aid-9");
  });

  it("kb_chat buffers the SSE stream into one answer", async () => {
    const sse =
      'data: {"output":{"choices":[{"message":{"content":"hi"},"finish_reason":"stop"}]},"request_id":"r2"}\n\ndata: [DONE]\n\n';
    const postSse = vi.fn(async () => new Response(sse, { status: 200 }));
    const { byName } = toolsWith(vi.fn(), postSse);
    const out = (await byName.kb_chat!.execute({ message: "q", agent_id: "aid-1" }, EXEC)) as {
      answer: string;
    };
    expect(out.answer).toBe("hi");
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/tools.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`packages/tool-bailian-kb/src/tools.ts`：

```ts
/** The three model-facing knowledge tools. Schemas are static per deployment: a configured
 * defaultAgentId downgrades agent_id to optional at build time (never a runtime fallback chain). */

import { defineTool } from "@deepseek-ai/dsh-tools";
import type { SearchRequest, SearchResponse } from "./api-types.js";
import type { KbClient } from "./client.js";
import { KbApiError } from "./client.js";
import { consumeChatStream } from "./chat.js";
import { KB_PATHS } from "./endpoints.js";
import { listServices } from "./services.js";

/** Client-side chunk cap applied when the model omits top_k. */
const DEFAULT_TOP_K = 5;

export interface KbToolDeps {
  client: KbClient;
  defaultAgentId?: string;
  chatTimeoutMs: number;
}

/** Format one service list into the error-hint / result text form. */
function formatServices(
  services: { agent_id: string; name: string; scene: string; status: string }[],
): string {
  return services.map((s) => `${s.agent_id} (${s.name}, scene=${s.scene}, ${s.status})`).join("; ");
}

/**
 * Append the current service list to a client error so the model can correct
 * an invalid agent_id in one step. Auth failures (401/403) keep their own message.
 */
async function withServiceHint(client: KbClient, err: unknown): Promise<never> {
  if (
    err instanceof KbApiError &&
    err.status !== undefined &&
    err.status >= 400 &&
    err.status !== 401 &&
    err.status !== 403
  ) {
    try {
      const { services } = await listServices(client, {});
      if (services.length > 0) {
        throw new KbApiError(
          `${err.message}. Available services: ${formatServices(services)}`,
          err.status,
        );
      }
    } catch (hintErr) {
      if (hintErr instanceof KbApiError && hintErr.message.includes("Available services"))
        throw hintErr;
      // discovery is best-effort; fall through to the original error
    }
  }
  throw err;
}

/**
 * Build the three tool definitions over one shared client.
 * @param deps - client plus the deployment's explicit pinning and timeout choices.
 * @returns definitions ready for `ctx.tools.register()`.
 */
export function createKbTools(deps: KbToolDeps) {
  const { client, defaultAgentId, chatTimeoutMs } = deps;
  const agentIdParam = {
    type: "string" as const,
    ...(defaultAgentId === undefined ? { required: true as const } : {}),
    description:
      defaultAgentId === undefined
        ? "Retrieval/Q&A service id (find one via kb_service_list)."
        : `Retrieval/Q&A service id; omit to use this deployment's default service.`,
  };
  const resolveAgentId = (supplied: string | undefined): string => {
    const agentId = supplied ?? defaultAgentId;
    if (agentId === undefined)
      throw new Error("agent_id is required: discover services with kb_service_list");
    return agentId;
  };

  const serviceList = defineTool({
    name: "kb_service_list",
    description:
      "List the Bailian knowledge retrieval/Q&A services available in this workspace. " +
      "Each entry names the service id (agent_id) to pass to kb_search (scene=search) or kb_chat (scene=chat), " +
      "its bound knowledge bases, and its status (prefer deployed). " +
      "Omit scene to see both kinds; narrow large workspaces with name_filter.",
    parameters: {
      scene: {
        type: "string",
        enum: ["chat", "search"],
        description: "Only list services for this scene; omitted lists both.",
      },
      name_filter: { type: "string", description: "Fuzzy match on the service name." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          services: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                agent_id: { type: "string", required: true },
                name: { type: "string", required: true },
                scene: { type: "string", required: true },
                status: { type: "string", required: true },
                knowledge_bases: { type: "array", required: true, items: { type: "string" } },
              },
            },
          },
          total: { type: "integer", required: true },
          truncated: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => [
        {
          type: "text",
          text:
            value.services.length === 0
              ? "No knowledge services found."
              : `${value.services.length} service(s): ${formatServices(value.services)}` +
                (value.truncated
                  ? ` — listed first ${value.services.length} of ${value.total}; narrow with name_filter.`
                  : ""),
        },
      ],
    },
    async execute(args) {
      return await listServices(client, {
        ...(args.scene === "chat" || args.scene === "search" ? { scene: args.scene } : {}),
        ...(args.name_filter ? { nameFilter: args.name_filter } : {}),
      });
    },
    presentCall: (args) => ({
      card: "generic",
      title: "List knowledge services",
      kind: "other",
      rawInput: args,
    }),
  });

  const search = defineTool({
    name: "kb_search",
    description:
      "Semantic search over a Bailian knowledge base. Returns raw knowledge chunks with scores and source " +
      "references for you to verify, cite, or combine with other context. Retrieval scope and strategy " +
      "(multi-KB weighting, routing, reranking) come from the service configuration. " +
      "top_k caps how many chunks return (client-side cut of the score-ranked results). " +
      "Use kb_chat instead when the user question can be answered by the knowledge base alone.",
    parameters: {
      query: { type: "string", required: true, description: "Search query text." },
      agent_id: agentIdParam,
      top_k: {
        type: "integer",
        description: `Maximum chunks to return; defaults to ${DEFAULT_TOP_K}.`,
      },
      images: {
        type: "array",
        items: { type: "string" },
        description: "Image URLs for multimodal retrieval.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          chunks: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string", required: true },
                score: { type: "number", required: true },
                doc_name: { type: "string" },
                doc_id: { type: "string" },
                title: { type: "string" },
              },
            },
          },
          total: { type: "integer", required: true },
        },
      },
      render: (_args, value) => [
        {
          type: "text",
          text:
            value.chunks.length === 0
              ? "No matching knowledge chunks."
              : value.chunks
                  .map(
                    (c, i) =>
                      `[${i + 1}] (score ${c.score.toFixed(2)}${c.doc_name ? `, ${c.doc_name}` : ""}) ${c.text}`,
                  )
                  .join("\n"),
        },
      ],
    },
    async execute(args) {
      const topK = args.top_k ?? DEFAULT_TOP_K;
      const body: SearchRequest = {
        query: args.query,
        agent_id: resolveAgentId(args.agent_id),
        ...(client.agentVersion ? { agent_version: client.agentVersion } : {}),
        ...(args.images && args.images.length > 0 ? { images: args.images } : {}),
      };
      const res = await client
        .postJson<SearchResponse>(KB_PATHS.search, body)
        .catch((err) => withServiceHint(client, err));
      const nodes = (res.data?.nodes ?? []).slice(0, topK);
      return {
        chunks: nodes.map((n) => ({
          text: n.text,
          score: n.score,
          ...(typeof n.metadata?.doc_name === "string" ? { doc_name: n.metadata.doc_name } : {}),
          ...(typeof n.metadata?.doc_id === "string" ? { doc_id: n.metadata.doc_id } : {}),
          ...(typeof n.metadata?.title === "string" ? { title: n.metadata.title } : {}),
        })),
        total: res.data?.total ?? nodes.length,
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Search knowledge base",
      kind: "read",
      rawInput: args,
    }),
  });

  const chat = defineTool({
    name: "kb_chat",
    description:
      "Ask the knowledge base directly and get a complete, domain-tuned answer from a specialized RAG pipeline " +
      "(multi-round retrieval + reranking + grounded generation). For knowledge Q&A this typically outperforms " +
      "searching and synthesizing yourself when the question can be answered by the knowledge base alone; " +
      "use kb_search instead when you need raw chunks to verify, cite, or combine with other work. " +
      "The pipeline runs an internal analysis/retrieval loop and may take a few minutes.",
    parameters: {
      message: { type: "string", required: true, description: "The question to ask." },
      agent_id: agentIdParam,
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          answer: { type: "string", required: true },
          request_id: { type: "string" },
        },
      },
      render: (_args, value) => [
        { type: "text", text: value.answer.length === 0 ? "(empty answer)" : value.answer },
      ],
    },
    async execute(args) {
      const body = {
        input: { messages: [{ role: "user" as const, content: args.message }] },
        parameters: {
          agent_options: {
            agent_id: resolveAgentId(args.agent_id),
            ...(client.agentVersion ? { agent_version: client.agentVersion } : {}),
          },
        },
        stream: true as const,
      };
      let res: Response;
      try {
        res = await client.postSse(KB_PATHS.chat, body, AbortSignal.timeout(chatTimeoutMs));
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(
            `knowledge chat timed out after ${chatTimeoutMs}ms; the pipeline runs a multi-round retrieval loop ` +
              "and long questions can exceed the deployment timeout. Retry, or use kb_search for raw chunks instead.",
          );
        }
        return await withServiceHint(client, err);
      }
      const { answer, requestId } = await consumeChatStream(res);
      return { answer, ...(requestId ? { request_id: requestId } : {}) };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Ask knowledge base (may take a few minutes)",
      kind: "read",
      rawInput: args,
    }),
  });

  return [serviceList, search, chat];
}
```

注意：`defineTool` 的参数 schema 结构以 `@deepseek-ai/dsh-tools` 实际类型为准（模板 `tool-todo`）；若 `enum`/`items` 字段名有出入，按其 `ParameterSchemaSpec` 类型修正，测试断言随之调整——**不得**为绕过类型错误引入 `any`。

- [ ] **Step 4: 运行确认通过 & Commit**

```bash
pnpm vitest run packages/tool-bailian-kb/tests/tools.test.ts
git add -A && git commit -m "feat: kb_service_list, kb_search, kb_chat tool factory"
```

### Task 8: SKILL.md、skill 注册与插件入口装配

**Files:**

- Create: `packages/tool-bailian-kb/skills/bailian-kb-management/SKILL.md`、`packages/tool-bailian-kb/src/skill.ts`
- Modify: `packages/tool-bailian-kb/src/index.ts`（追加 apply）

- [ ] **Step 1: 写 SKILL.md**

`packages/tool-bailian-kb/skills/bailian-kb-management/SKILL.md`：

````markdown
---
name: bailian-kb-management
description: 管理阿里云百炼知识库（建库、上传文档、部署检索服务、Chunk 运维）。当用户要创建/更新/删除知识库、上传或导入文档、部署检索服务、管理数据中心文件时使用 kscli。检索与问答不走本 skill——用原生工具 kb_search / kb_chat。
---

# 百炼知识库管理（kscli）

检索面与管理面的分工：**查知识用 `kb_search`（取证据）/ `kb_chat`（成品问答）原生工具；本 skill 只覆盖管理长尾**——知识库全生命周期、文档、检索服务、Chunk、数据中心。

## 前置检查

1. `kscli --version` —— 未安装则运行 `npm install -g knowledge-studio-cli`（需 Node.js ≥ 18.17）；安装失败时把错误原样报告给用户，不要静默跳过。
2. 鉴权：需要 `DASHSCOPE_API_KEY`（环境变量，或 `kscli config set --key api_key --value sk-xxx`）。
3. workspace 解析优先级：`--workspace-id` 参数 > 环境变量 `BAILIAN_WORKSPACE_ID` > `kscli config set --key workspace_id --value ws-xxx`。

## 常用工作流：建库到可检索

```bash
kscli kb create --name "my-kb" --embedding-model text-embedding-v3   # 1. 建库
kscli doc upload --kb-id <kb-id> --file ./docs.pdf                    # 2. 上传本地文档
kscli doc status --kb-id <kb-id> --doc-id <doc-id>                    # 3. 轮询至 COMPLETED
kscli service create ... && kscli service deploy ...                  # 4. 建/部署检索服务 → 得到 agent_id
```

部署完成后用 `kb_service_list` 确认服务可见，再用 `kb_search --agent-id` 验证检索。

## 命令组速查

`kb`（list/info/create/update/delete/stats）· `doc`（list/upload/status/delete/tag/import-oss）· `service`（list/get/create/update/deploy/delete/copy）· `chunk`（add/list/update/delete）· `file` / `collection` / `category`（数据中心）。全部命令支持 `--output json`（结构化输出）、`--dry-run`（预览请求）、`--quiet`。完整手册：https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md

## 最佳实践

- 用户反复使用同一检索服务时，建议其把 agent_id 写入项目指令（如 AGENTS.md）或让 agent 记住，后续 kb_search / kb_chat 直接携带。
- 服务有 draft/deployed 两种状态：只有 deployed 可被默认版本调用；draft 调试用 `--agent-version beta`。
````

- [ ] **Step 2: 实现 skill 注册**

`packages/tool-bailian-kb/src/skill.ts`：

```ts
/** Runtime skill registration: the packaged kscli-management SKILL.md joins the catalog when a skills registry is composed. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves ctx.skills for the optional inject below.
import type {} from "@deepseek-ai/dsh-skill";

const SKILL_DIR = fileURLToPath(new URL("../skills/bailian-kb-management/", import.meta.url));

/**
 * Register the management skill when the skills registry is composed; headless
 * assemblies without the seam stay unaffected.
 * @param ctx - the plugin context.
 */
export function registerSkill(ctx: Context): void {
  ctx.inject(["skills"], (skillCtx) => {
    const content = readFileSync(`${SKILL_DIR}SKILL.md`, "utf8");
    skillCtx.skills.register({
      name: "bailian-kb-management",
      description:
        "Manage Bailian knowledge bases with the kscli CLI: create/update KBs, upload documents, deploy " +
        "retrieval services, and maintain chunks. Retrieval itself uses the native kb_search/kb_chat tools.",
      content,
      source: "bundled",
      resourceBase: { kind: "directory", path: SKILL_DIR },
    });
  });
}
```

（`lib/skill.js` 相对 `../skills/` 解析到包根 `skills/`，与 `files` 白名单一致。frontmatter 保留在 content 内无害；若 dsh 渲染出现重复描述，实现时剥离 frontmatter 再注册。）

- [ ] **Step 3: 装配 apply**

在 `packages/tool-bailian-kb/src/index.ts` 追加（Config 声明保持不变）：

```ts
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { KbClient } from "./client.js";
import { registerSkill } from "./skill.js";
import { createKbTools } from "./tools.js";

/**
 * Register the three knowledge tools over one shared client, plus the
 * management skill when a skills registry is composed.
 * @param ctx - registrant context carrying tools and credentials.
 * @param config - deployment's workspace, host, pinning, and timeout choices.
 */
export function apply(ctx: Context, config: Config): void {
  const client = new KbClient({
    workspaceId: config.workspaceId,
    endpointHost: config.endpointHost,
    ...(config.agentVersion ? { agentVersion: config.agentVersion } : {}),
    resolveApiKey: async () => {
      const resolved = await ctx.credentials.resolve(credentialRef("DASHSCOPE_API_KEY"));
      if (!resolved) {
        throw new Error(
          "DASHSCOPE_API_KEY is not configured. Set it in ~/.dsh/.env or .credentials.yaml " +
            "(create a key at https://bailian.console.aliyun.com/?tab=app#/api-key).",
        );
      }
      return resolved.value;
    },
  });
  for (const tool of createKbTools({
    client,
    ...(config.defaultAgentId ? { defaultAgentId: config.defaultAgentId } : {}),
    chatTimeoutMs: config.chatTimeoutMs,
  })) {
    ctx.tools.register(tool);
  }
  registerSkill(ctx);
}
```

- [ ] **Step 4: 全量测试 + 构建验证 & Commit**

```bash
pnpm run test && pnpm run typecheck && pnpm run build
git add -A && git commit -m "feat: plugin apply wiring with credential-backed client and skill registration"
```

Expected: 测试全 PASS；`packages/tool-bailian-kb/lib/` 产出 `index.js` 等。

### Task 9: bundle 分发包

**Files:**

- Create: `packages/bundle/package.json`、`packages/bundle/cordis.patch.yml`

- [ ] **Step 1: 写 bundle 包**

`packages/bundle/package.json`：

```json
{
  "name": "bailian-kb-bundle",
  "version": "0.1.0",
  "description": "Installable dsh bundle for Bailian knowledge-base tools: kb_service_list, kb_search, kb_chat plus the kscli management skill.",
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "exports": {
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["cordis.patch.yml"],
  "dependencies": { "dsh-tool-bailian-kb": "workspace:^" }
}
```

（发布时 `workspace:^` 由 pnpm publish 自动替换为版本号；git spec 安装场景改为固定版本依赖——实现时二选一并在 README 记录。）

`packages/bundle/cordis.patch.yml`：

```yaml
# bailian-kb-bundle: inserts the Bailian knowledge-base consumer over dsh-base.
# workspaceId reads BAILIAN_WORKSPACE_ID from the environment (~/.dsh/.env) so a
# user patch is only needed to pin defaultAgentId or override the host/timeout.
# An id-targeted user patch replaces this whole config: restate workspaceId too.

- insert:
    - id: tool-bailian-kb
      name: dsh-tool-bailian-kb
      config:
        workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: installable dsh bundle package"
```

### Task 10: README 文档

**Files:**

- Create: `README.md`（根）、`packages/tool-bailian-kb/README.md`、`packages/bundle/README.md`

- [ ] **Step 1: 写三份 README**

根 `README.md`：项目一句话定位、两包结构表、安装（`dsh plugin --profile web add bailian-kb-bundle`）、配置（`BAILIAN_WORKSPACE_ID` + `DASHSCOPE_API_KEY` 写入 `~/.dsh/.env`）、验证（`dsh --profile web --dump-config`）、开发命令（install/test/typecheck/build）。

`packages/tool-bailian-kb/README.md`：Config 字段表（五个字段与默认值，含 defaultAgentId 的静态 schema 语义）、三个工具的参数/返回摘要、错误语义（4xx 附服务清单、凭证缺失指引、chat 超时）、Known Limitations（chat 执行期无进展显示——进展流式见 spec 附录 A；服务清单单页 100 上限靠 name_filter 收窄）。

`packages/bundle/README.md`：patch row 说明、用户覆盖示例（id-targeted patch 需 restate 整个 config）、卸载方式。

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: package and repository READMEs"
```

### Task 11: dsh 本地集成验收（手动 smoke）

前置：本机可运行 dsh（deepseek-harness checkout 或全局安装）；`~/.dsh/.env` 写入真实 `DASHSCOPE_API_KEY` 与 `BAILIAN_WORKSPACE_ID`。

- [ ] **Step 1: 安装进本地 profile**

```bash
cd /Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle && pnpm run build
cd /Users/zeyufeng/Documents/Code/workspace/deepseek-harness
pnpm dsh plugin --profile headless add /Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle/packages/bundle
```

Expected: pnpm 安装成功，输出提示 bundle 加入 `dsh.profile.bundles`。

- [ ] **Step 2: 验证组合树**

```bash
pnpm dsh --profile headless --dump-config | grep -A 4 tool-bailian-kb
```

Expected: 能看到 `tool-bailian-kb` row 及解析后的 workspaceId。

- [ ] **Step 3: 真实任务 smoke（需要 DEEPSEEK_API_KEY）**

```bash
pnpm dsh --profile headless "列出可用的知识库检索服务"
pnpm dsh --profile headless "用知识库检索：<你知识库里确定存在的主题>，给出来源"
```

Expected: 模型调用 `kb_service_list` / `kb_search` 并给出带来源的回答。将实际 transcript 记录到验收笔记。

- [ ] **Step 4: 负例验证（fail loud）**

```bash
# 临时移除 BAILIAN_WORKSPACE_ID 后：
pnpm dsh --profile headless --dump-config
```

Expected: 加载期报错指向 workspaceId 缺失（schemastery required），而不是静默跳过。验证后恢复环境变量。

- [ ] **Step 5: 打 tag**

```bash
cd /Users/zeyufeng/Documents/Code/workspace/bailian-kb-bundle && git tag v0.1.0
```

---

## 与 spec 的偏差记录

- **测试策略降级（spec §10）**：spec 要求 mock HTTP fixture 的 keyless snapshot 与真实 API e2e；首版以单元测试（Task 2-7）+ 手动集成验收（Task 11）覆盖，snapshot/e2e 基建依赖 dsh snapshot harness 对 out-of-tree bundle 的支持情况，作为 v0.2 跟进项记入根 README 的 Known Limitations。其余均与 2026-08-15 spec 最终版一致。

## 明确不在本计划内（spec §2）

`retrieve` 工具、MCP 通道、chat 进展流式 UI、`run_in_background`、skills 生态独立分发、snapshot/e2e 测试基建（依赖 dsh snapshot harness 对 out-of-tree bundle 的支持情况，首版以单元测试 + 手动集成验收覆盖，作为 v0.2 跟进项记录在根 README 的 Known Limitations）。
