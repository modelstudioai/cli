import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { LocalFileStateBackend, StateManager } from "@openagentpack/sdk";
import { runNodeMain } from "e2e/runner";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";
import { commandsPackageRoot, parseStdoutJson, runCommandHelp } from "./helpers.ts";
import { MANAGED_AGENT_MEMORY_ROUTES as ROUTES } from "./topic-routes.ts";

const directories: string[] = [];
const servers: Server[] = [];
const STORE_ID = "memstore_a/b c";
const MEMORY_ID = "memory_a/b c";
const VERSION_ID = "memver_a/b c";
const STORE_ARGS = ["--store-id", STORE_ID];
const MEMORY_ARGS = [...STORE_ARGS, "--memory-id", MEMORY_ID];
const VERSION_ARGS = [...STORE_ARGS, "--version-id", VERSION_ID];
const BASE_PATH = "/api/v1/agentstudio/memory_stores";
const STORE_PATH = `${BASE_PATH}/${encodeURIComponent(STORE_ID)}`;
const SHA = "a".repeat(64);
const OPERATIONS = [
  {
    action: ["list"],
    args: ["--limit", "100", "--page", "opaque+/=cursor"],
    method: "GET",
    path: BASE_PATH,
    query: { limit: "100", page: "opaque+/=cursor", include_archived: "false" },
    response: { data: [], next_page: "next+/=cursor" },
  },
  {
    action: ["get"],
    args: STORE_ARGS,
    method: "GET",
    path: STORE_PATH,
    response: { id: STORE_ID, name: "Notes", type: "memory_store" },
  },
  {
    action: ["memories", "create"],
    args: [...STORE_ARGS, "--path", "/notes.md", "--content", ""],
    method: "POST",
    path: `${STORE_PATH}/memories`,
    write: true,
    body: { path: "/notes.md", content: "" },
    response: { id: MEMORY_ID, type: "memory", path: "/notes.md", content: "" },
  },
  {
    action: ["memories", "list"],
    args: [
      ...STORE_ARGS,
      "--path-prefix",
      "/notes/",
      "--depth",
      "1",
      "--view",
      "full",
      "--limit",
      "20",
      "--page",
      "opaque+/=cursor",
    ],
    method: "GET",
    path: `${STORE_PATH}/memories`,
    query: {
      path_prefix: "/notes/",
      depth: "1",
      view: "full",
      limit: "20",
      page: "opaque+/=cursor",
    },
    response: { data: [], prefixes: ["/notes/"], next_page: "next+/=cursor" },
  },
  {
    action: ["memories", "get"],
    args: MEMORY_ARGS,
    method: "GET",
    path: `${STORE_PATH}/memories/${encodeURIComponent(MEMORY_ID)}`,
    response: { id: MEMORY_ID, type: "memory", path: "/notes.md", content: "notes" },
  },
  {
    action: ["memories", "update"],
    args: [...MEMORY_ARGS, "--content", "", "--expected-content-sha256", SHA],
    method: "POST",
    path: `${STORE_PATH}/memories/${encodeURIComponent(MEMORY_ID)}`,
    write: true,
    body: { content: "", precondition: { type: "content_sha256", content_sha256: SHA } },
    response: { id: MEMORY_ID, type: "memory", content: "" },
  },
  {
    action: ["memories", "delete"],
    args: MEMORY_ARGS,
    method: "DELETE",
    path: `${STORE_PATH}/memories/${encodeURIComponent(MEMORY_ID)}`,
    write: true,
    response: { id: MEMORY_ID, type: "memory_deleted" },
  },
  {
    action: ["versions", "list"],
    args: [
      ...STORE_ARGS,
      "--memory-id",
      MEMORY_ID,
      "--operation",
      "modified",
      "--created-at-gte",
      "2026-10-01T00:00:00Z",
      "--created-at-lte",
      "2026-10-13T00:00:00Z",
      "--view",
      "full",
      "--limit",
      "100",
      "--page",
      "opaque+/=cursor",
    ],
    method: "GET",
    path: `${STORE_PATH}/memory_versions`,
    query: {
      memory_id: MEMORY_ID,
      operation: "modified",
      "created_at.gte": "2026-10-01T00:00:00Z",
      "created_at.lte": "2026-10-13T00:00:00Z",
      view: "full",
      limit: "100",
      page: "opaque+/=cursor",
    },
    response: {
      data: [{ id: VERSION_ID, type: "memory_version", operation: "modified" }],
      next_page: null,
    },
  },
  {
    action: ["versions", "get"],
    args: VERSION_ARGS,
    method: "GET",
    path: `${STORE_PATH}/memory_versions/${encodeURIComponent(VERSION_ID)}`,
    response: { id: VERSION_ID, type: "memory_version", content: "old notes" },
  },
  {
    action: ["versions", "redact"],
    args: VERSION_ARGS,
    method: "POST",
    path: `${STORE_PATH}/memory_versions/${encodeURIComponent(VERSION_ID)}/redact`,
    write: true,
    response: { id: VERSION_ID, type: "memory_version", redacted: true },
  },
];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function setup(config: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "bl-memory-e2e-"));
  directories.push(directory);
  writeFileSync(join(directory, "config.json"), JSON.stringify(config));
  return {
    directory,
    env: {
      BAILIAN_CONFIG_DIR: directory,
      DASHSCOPE_API_KEY: "",
      DASHSCOPE_BASE_URL: "",
      BAILIAN_API_KEY: "",
      BAILIAN_BASE_URL: "",
      BAILIAN_WORKSPACE_ID: "",
      BAILIAN_E2E: "0",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      all_proxy: "",
      NO_PROXY: "127.0.0.1,localhost",
    },
  };
}
function run(args: string[], environment: ReturnType<typeof setup>) {
  return runNodeMain(
    join(commandsPackageRoot, "tests/e2e/harness/main.ts"),
    [...args, "--output", "json"],
    {
      cwd: environment.directory,
      env: {
        ...environment.env,
        BAILIAN_E2E_ROUTES: JSON.stringify(
          Object.entries(ROUTES).map(([path, exportName]) => ({ path, export: exportName })),
        ),
      },
    },
  );
}
async function gateway(body: unknown, status = 200) {
  const received: { method?: string; path?: string; body: string; authorization?: string }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method,
        path: request.url,
        body: Buffer.concat(chunks).toString("utf8"),
        authorization: request.headers.authorization,
      });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local server address.");
  return { origin: `http://127.0.0.1:${address.port}`, received };
}

describe("e2e: managed-agent memory help and validation", () => {
  test.each(Object.keys(ROUTES))("%s has API Key help", async (path) => {
    const result = await runCommandHelp(ROUTES, [...path.split(" "), "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`Usage: bl ${path}`);
    expect(result.stderr).toContain("Authentication: API Key");
    if (path === "managed-agent memory-store memories list") {
      expect(result.stderr).toContain("Page size (1–20)");
    } else if (path.endsWith(" list")) {
      expect(result.stderr).toContain("Page size (1–100)");
    }
  });
  test.each(["0", "1.5", "21", "100"])(
    "memories list rejects --limit %s before making a request",
    async (limit) => {
      const server = await gateway({ data: [] });
      const result = await run(
        ["managed-agent", "memory-store", "memories", "list", ...STORE_ARGS, "--limit", limit],
        setup({ api_key: "test-key", base_url: `${server.origin}/api/v1/agentstudio` }),
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("--limit must be an integer from 1 to 20.");
      expect(result.stderr).toContain("--limit 必须为 1–20 的整数。");
      expect(server.received).toEqual([]);
    },
  );
  test.each([
    { action: ["create"], args: [], missing: "--name" },
    { action: ["get"], args: [], missing: "--store-id" },
    { action: ["memories", "create"], args: STORE_ARGS, missing: "--path" },
    { action: ["memories", "get"], args: STORE_ARGS, missing: "--memory-id" },
    { action: ["versions", "get"], args: STORE_ARGS, missing: "--version-id" },
  ])("$action rejects missing $missing", async ({ action, args, missing }) => {
    const result = await run(
      ["managed-agent", "memory-store", ...action, ...args, "--quiet"],
      setup(),
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(missing);
  });
  test.each(
    [
      [
        "memories",
        "create",
        ...STORE_ARGS,
        "--path",
        "/notes",
        "--content",
        "x",
        "--content-file",
        "x",
      ],
      ["memories", "update", ...MEMORY_ARGS],
      ["memories", "list", ...STORE_ARGS, "--depth", "-1"],
      ["list", "--limit", "101"],
      ["versions", "list", ...STORE_ARGS, "--created-at-gte", "invalid"],
      [
        "versions",
        "list",
        ...STORE_ARGS,
        "--created-at-gte",
        "2026-10-13",
        "--created-at-lte",
        "2026-10-01",
      ],
      [
        "memories",
        "update",
        ...MEMORY_ARGS,
        "--content",
        "x",
        "--expected-content-sha256",
        "invalid",
      ],
    ].map((args) => ({ args })),
  )("rejects invalid input $args before network", async ({ args }) => {
    const result = await run(
      ["managed-agent", "memory-store", ...args, "--dry-run", "--workspace-id", "ws-test"],
      setup(),
    );
    expect(result.exitCode).toBe(2);
  });
});

describe("e2e: managed-agent memory offline preview and confirmation", () => {
  test.each(OPERATIONS)(
    "$action dry-run performs no requests or writes",
    async ({ action, args }) => {
      const { origin, received } = await gateway({});
      const environment = setup({ base_url: origin });
      const before = readdirSync(environment.directory);
      const result = await run(
        ["managed-agent", "memory-store", ...action, ...args, "--dry-run"],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        operation: `memory-store.${action.join(".")}`,
        provider: "bailian",
      });
      expect(received).toEqual([]);
      expect(readdirSync(environment.directory)).toEqual(before);
    },
  );
  test.each(OPERATIONS.filter((operation) => operation.write))(
    "$action requires confirmation without requests",
    async ({ action, args }) => {
      const { origin, received } = await gateway({});
      const result = await run(
        ["managed-agent", "memory-store", ...action, ...args],
        setup({ base_url: origin, api_key: "test-key" }),
      );
      expect(result.exitCode).toBe(7);
      expect(result.stderr).toContain("requires_confirmation");
      expect(received).toEqual([]);
    },
  );
  test("Store create previews YAML and keeps original files intact", async () => {
    const environment = setup();
    const source =
      'version: "1"\nproviders:\n  bailian:\n    api_key: ""\n    workspace_id: ws-test\n';
    const path = join(environment.directory, "agents.yaml");
    writeFileSync(path, source);
    const result = await run(
      [
        "managed-agent",
        "memory-store",
        "create",
        "--name",
        "Project Notes",
        "--description",
        "",
        "--metadata",
        "owner=platform",
        "--entry",
        '{"key":"notes.md","content":""}',
        "--dry-run",
      ],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      resource: { type: "memory_store", key: "project-notes", name: "Project Notes" },
      yaml_written: false,
      ready_to_create: true,
    });
    expect(readFileSync(path, "utf8")).toBe(source);
    expect(readdirSync(environment.directory).sort()).toEqual(["agents.yaml", "config.json"]);
  });
  test("Store create defaults to a preview, then --yes writes YAML and creates only that store", async () => {
    const { origin, received } = await gateway({
      id: "memstore_created",
      type: "memory_store",
      name: "Notes",
      description: "",
      metadata: {},
    });
    const environment = setup({ base_url: origin, api_key: "test-key" });
    const source = [
      'version: "1"',
      "providers:",
      "  bailian:",
      '    api_key: "test-key"',
      `    base_url: ${origin}/api/v1/agentstudio`,
      "# Keep this unrelated declaration.",
      "memory_stores:",
      "  other:",
      "    name: Other notes",
      "    description: Keep me",
      "    provider: bailian",
      "",
    ].join("\n");
    const path = join(environment.directory, "agents.yaml");
    writeFileSync(path, source);
    const args = ["managed-agent", "memory-store", "create", "--name", "Notes"];

    const preview = await run(args, environment);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(parseStdoutJson(preview.stdout)).toMatchObject({
      resource: { type: "memory_store", key: "notes" },
      yaml_written: false,
      requires_confirmation: true,
      ready_to_create: true,
    });
    expect(received).toEqual([]);
    expect(readFileSync(path, "utf8")).toBe(source);
    expect(readdirSync(environment.directory).sort()).toEqual(["agents.yaml", "config.json"]);

    const applied = await run([...args, "--yes"], environment);
    expect(applied.exitCode, applied.stderr).toBe(0);
    expect(parseStdoutJson(applied.stdout)).toMatchObject({
      resource: { type: "memory_store", key: "notes", remote_id: "memstore_created" },
      yaml_written: true,
    });
    expect(received.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "POST", path: BASE_PATH },
      { method: "GET", path: `${BASE_PATH}/memstore_created` },
    ]);
    expect(JSON.parse(received[0]!.body)).toEqual({ name: "Notes", description: "" });
    const written = readFileSync(path, "utf8");
    expect(written).toContain("# Keep this unrelated declaration.");
    expect(parse(written)).toMatchObject({
      memory_stores: {
        other: { name: "Other notes", description: "Keep me", provider: "bailian" },
        notes: { name: "Notes", description: "", provider: "bailian" },
      },
    });
  });
  test("Store initialization retries the same Store with 20-item pages and preserves existing content", async () => {
    const store = {
      id: "memstore_initializing",
      type: "memory_store",
      name: "Notes",
      description: "",
      metadata: {},
      archived_at: null,
    };
    const entries = [
      { key: "alpha.md", content: "Initial alpha" },
      { key: "beta.md", content: "Initial beta" },
      { key: "gamma.md", content: "Initial gamma" },
    ];
    const memories = new Map<string, { id: string; content: string }>();
    const received: { method: string; path: string; page: string | null; limit: string | null }[] =
      [];
    const createdPaths: string[] = [];
    const nextPage = "opaque+/=cursor";
    let storeCreates = 0;
    let failBeta = true;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const url = new URL(request.url!, "http://localhost");
        const method = request.method!;
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        const reply = (status: number, value: unknown) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(value));
        };
        received.push({
          method,
          path: url.pathname,
          page: url.searchParams.get("page"),
          limit: url.searchParams.get("limit"),
        });
        if (method === "POST" && url.pathname === BASE_PATH) {
          storeCreates += 1;
          reply(200, store);
          return;
        }
        if (
          (method === "GET" || method === "POST") &&
          url.pathname === `${BASE_PATH}/${store.id}`
        ) {
          reply(200, store);
          return;
        }
        if (url.pathname === `${BASE_PATH}/${store.id}/memories`) {
          if (method === "GET") {
            if (url.searchParams.get("limit") !== "20") {
              reply(400, { message: "limit must be between 1 and 20" });
              return;
            }
            const page = url.searchParams.get("page");
            if (page !== null && page !== nextPage) {
              reply(400, { message: "Invalid opaque cursor" });
              return;
            }
            const offset = page === nextPage ? 20 : 0;
            const all = [...memories].map(([path, memory]) => ({
              id: memory.id,
              type: "memory",
              path,
              content_sha256: createHash("sha256").update(memory.content).digest("hex"),
            }));
            reply(200, {
              data: all.slice(offset, offset + 20),
              next_page: offset + 20 < all.length ? nextPage : null,
            });
            return;
          }
          if (method === "POST") {
            const path = body.path as string;
            if (path === "/beta.md" && failBeta) {
              reply(503, { message: "Injected beta initialization failure" });
              return;
            }
            createdPaths.push(path);
            const memory = { id: `memory_${memories.size + 1}`, content: body.content as string };
            memories.set(path, memory);
            reply(200, { id: memory.id, type: "memory", path });
            return;
          }
        }
        reply(500, { message: `Unexpected request: ${method} ${url.pathname}` });
      });
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected a local server address.");
    const origin = `http://127.0.0.1:${address.port}`;
    const environment = setup({ base_url: origin, api_key: "test-key" });
    const configPath = join(environment.directory, "agents.yaml");
    writeFileSync(
      configPath,
      [
        'version: "1"',
        "providers:",
        "  bailian:",
        '    api_key: "test-key"',
        `    base_url: ${origin}/api/v1/agentstudio`,
        "",
      ].join("\n"),
    );
    const args = [
      "managed-agent",
      "memory-store",
      "create",
      "--name",
      "Notes",
      ...entries.flatMap((entry) => ["--entry", JSON.stringify(entry)]),
      "--yes",
    ];
    const first = await run(args, environment);
    expect(first.exitCode).toBe(1);
    expect(first.stderr).toContain("Injected beta initialization failure");
    expect(`${first.stdout}${first.stderr}`).toContain("503");
    expect(`${first.stdout}${first.stderr}`).not.toContain("limit must be between 1 and 20");
    expect(createdPaths).toEqual(["/alpha.md"]);
    const backend = new LocalFileStateBackend({ configPath });
    const statePath = backend.getStatePath({ projectId: basename(environment.directory) });
    const resourceAddress = { provider: "bailian", type: "memory_store" as const, name: "notes" };
    const checkpoint = await StateManager.load(statePath);
    expect(checkpoint.getResource(resourceAddress)).toMatchObject({
      remote_id: store.id,
      memory_initialization: {
        pending_entries: entries.slice(1).map((entry) => ({
          path: `/${entry.key}`,
          content_sha256: createHash("sha256").update(entry.content).digest("hex"),
        })),
      },
    });

    memories.get("/alpha.md")!.content = "Agent updated alpha";
    for (let index = 0; index < 20; index += 1) {
      memories.set(`/filler-${index}.md`, { id: `filler_${index}`, content: "Keep filler" });
    }
    memories.set("/beta.md", { id: "memory_agent_beta", content: "Agent supplied beta" });
    failBeta = false;
    const resumed = await run(args, environment);
    expect(resumed.exitCode, resumed.stderr).toBe(0);
    expect(parseStdoutJson(resumed.stdout)).toMatchObject({
      resource: { type: "memory_store", key: "notes", remote_id: store.id },
      reused_pending: true,
    });
    expect(storeCreates).toBe(1);
    expect(createdPaths).toEqual(["/alpha.md", "/gamma.md"]);
    expect(memories.get("/alpha.md")?.content).toBe("Agent updated alpha");
    expect(memories.get("/beta.md")?.content).toBe("Agent supplied beta");
    expect(memories.get("/gamma.md")?.content).toBe("Initial gamma");
    const listRequests = received.filter(
      ({ method, path }) => method === "GET" && path.endsWith("/memories"),
    );
    expect(listRequests.every(({ limit }) => limit === "20")).toBe(true);
    expect(listRequests.some(({ page }) => page === nextPage)).toBe(true);
    const completed = await StateManager.load(statePath);
    expect(completed.getResource(resourceAddress)?.remote_id).toBe(store.id);
    expect(completed.getResource(resourceAddress)?.memory_initialization).toBeUndefined();
    expect(Object.keys(parse(readFileSync(configPath, "utf8")).memory_stores)).toEqual(["notes"]);
  });
  test("content-file preview reads an empty UTF-8 file", async () => {
    const environment = setup({ base_url: "http://127.0.0.1:1" });
    const path = join(environment.directory, "empty.txt");
    writeFileSync(path, "");
    const result = await run(
      [
        "managed-agent",
        "memory-store",
        "memories",
        "update",
        ...MEMORY_ARGS,
        "--content-file",
        path,
        "--dry-run",
      ],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({ request: { content: "" } });
  });
  test.each(["create", "run"])(
    "Session %s previews repeatable resources and legacy YAML keys",
    async (action) => {
      const environment = setup();
      const resource = {
        type: "memory_store",
        memory_store: "notes",
        access: "read_only",
        instructions: "Use project notes",
      };
      const path = join(environment.directory, "mount.json");
      writeFileSync(path, JSON.stringify(resource));
      const result = await run(
        [
          "managed-agent",
          "session",
          action,
          ...(action === "run" ? ["--prompt", "hello"] : []),
          "--memory-stores",
          "notes,other",
          "--resource",
          `@${path}`,
          "--dry-run",
        ],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        [action === "create" ? "would_create_session" : "would_run"]: {
          memory_stores: ["notes", "other"],
          resources: [resource],
        },
      });
    },
  );
  test.each(["create", "run"])(
    "Session %s rejects invalid resource access before auth or project loading",
    async (action) => {
      const environment = setup();
      const result = await run(
        [
          "managed-agent",
          "session",
          action,
          ...(action === "run" ? ["--prompt", "hello"] : []),
          "--resource",
          '{"type":"memory_store","memory_store":"notes","access":"write"}',
          "--quiet",
        ],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain("access");
      expect(readdirSync(environment.directory)).toEqual(["config.json"]);
    },
  );
});

describe("e2e: managed-agent memory SDK HTTP protocol", () => {
  test.each(OPERATIONS)(
    "$action sends SDK method, path and fields and preserves response",
    async ({ action, args, method, path, query, body, response, write }) => {
      const { origin, received } = await gateway(response);
      const environment = setup({ base_url: origin, api_key: "test-key" });
      const result = await run(
        ["managed-agent", "memory-store", ...action, ...args, ...(write ? ["--yes"] : [])],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toEqual(response);
      expect(received).toHaveLength(1);
      const request = received[0]!;
      const url = new URL(request.path!, origin);
      expect(request.method).toBe(method);
      expect(url.pathname).toBe(path);
      expect(Object.fromEntries(url.searchParams)).toEqual(query ?? {});
      expect(request.authorization).toBe("Bearer test-key");
      if (body) expect(JSON.parse(request.body)).toEqual(body);
      expect(readdirSync(environment.directory)).toEqual(["config.json"]);
    },
  );
  test("service errors remain authoritative", async () => {
    const { origin } = await gateway(
      { message: "Memory service exact failure", request_id: "memory-error" },
      409,
    );
    const result = await run(
      [
        "managed-agent",
        "memory-store",
        "memories",
        "update",
        ...MEMORY_ARGS,
        "--content",
        "x",
        "--yes",
      ],
      setup({ base_url: origin, api_key: "test-key" }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Memory service exact failure");
  });
});
