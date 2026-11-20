import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as core from "bailian-cli-core";
import { httpTransport } from "bailian-cli-core";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { buildTarBr } from "../../../core/tests/helpers/skill-archive.ts";
import { createZip } from "../../src/commands/managed-agent/session-debug.ts";
import { runCommandInProcess } from "./helpers.ts";
import { SKILL_ROUTES } from "./topic-routes.ts";

const id = "skill_document";
const origin = "https://catalog.example.test";
const registry = "https://registry.example.test";
const collection = "/api/v1/skills";
const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(workspaceId?: string) {
  const apiOrigin = workspaceId ? `https://${workspaceId}.cn-beijing.maas.aliyuncs.com` : origin;
  const home = realpathSync(mkdtempSync(join(tmpdir(), "bl-skill-lifecycle-")));
  temporary.push(home);
  const project = join(home, "project");
  mkdirSync(project);
  const state = {
    latest: "1.0",
    expire: false,
    malformed: false,
    manifest: undefined as string | undefined,
    ossNames: ["reader"],
    ossHash: undefined as string | undefined,
    active: new Set<string>(["ready"]),
  };
  const requests: string[] = [];
  const env = {
    HOME: home,
    USERPROFILE: home,
    BAILIAN_CONFIG_DIR: join(home, "config"),
    DASHSCOPE_API_KEY: "fixture-key",
    DASHSCOPE_BASE_URL: workspaceId ? "" : origin,
    BAILIAN_WORKSPACE_ID: workspaceId ?? "",
    BAILIAN_SKILL_REGISTRY_URL: registry,
    NODE_OPTIONS: "",
    NODE_USE_ENV_PROXY: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    no_proxy: "",
  };
  const run = (args: string[], config = {}) =>
    runCommandInProcess(
      SKILL_ROUTES,
      ["skill", ...args, "--output", "json"],
      { ...env, ...config },
      { cwd: project },
    );
  const ok = (data: unknown) =>
    Response.json({ success: true, data, request_id: "fixture-request" });
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push(url.pathname);
    if (url.pathname.startsWith("/api/v1/mcp/servers/")) {
      expect(url.origin).toBe(apiOrigin);
      expect(request.headers.get("Authorization")).toBe("Bearer fixture-key");
      const [code, action] = url.pathname.slice("/api/v1/mcp/servers/".length).split("/");
      expect(request.method).toBe(action ? "POST" : "GET");
      if (action) {
        expect(action).toBe(code === "custom" ? "enable" : "activate");
        state.active.add(code!);
      }
      return ok({
        mcp_code: code,
        ...(code === "market-finance" && {
          billing: { mode: "per_call", unit_price: "0.01", free_quota: 0 },
        }),
        type: code === "custom" ? "CUSTOMER" : "OFFICIAL",
        server_status: state.active.has(code!) ? "ACTIVATED" : "INACTIVE",
        requires_manual_setup: code === "manual",
      });
    }
    expect(request.method).toBe("GET");
    if (url.origin === registry) {
      expect(request.headers.has("Authorization")).toBe(false);
      const name = state.ossNames.find(
        (candidate) => url.pathname === `/${candidate}/skill.tar.br`,
      );
      if (name) {
        const files = {
          "SKILL.md": `---\nname: ${name}\ndescription: Public fixture\n---\n`,
          ...(state.manifest !== undefined && { "mcp-config.json": state.manifest }),
        };
        return new Response(Buffer.from(await buildTarBr(files)));
      }
      expect(url.pathname).toBe("/index.json");
      return Response.json({
        skills: Object.fromEntries(
          state.ossNames.map((name) => [
            name,
            { description: `Public ${name}`, contentHash: state.ossHash },
          ]),
        ),
      });
    }
    if (url.hostname === "download.example.test") {
      expect(request.headers.has("Authorization")).toBe(false);
      if (state.expire) {
        state.expire = false;
        return new Response("expired", { status: 403 });
      }
      const version = url.pathname.slice(1);
      const path = version === "1.0" ? "wrapped/SKILL.md" : "SKILL.md";
      const archive = createZip([
        {
          name: state.malformed ? "other.md" : path,
          content: Buffer.from("---\nname: reader\ndescription: Reader fixture\n---\n" + version),
        },
        ...(state.manifest !== undefined
          ? [
              {
                name: path.replace("SKILL.md", "mcp-config.json"),
                content: Buffer.from(state.manifest),
              },
            ]
          : []),
      ]);
      return new Response(Buffer.from(archive));
    }
    expect(url.origin).toBe(apiOrigin);
    expect(request.headers.get("Authorization")).toBe("Bearer fixture-key");
    const skill = {
      id,
      source: "official",
      status: "active",
      latest_version: state.latest,
      display_name: "Document reader",
    };
    if (url.pathname === collection)
      return ok({ items: [skill], page_no: 1, page_size: 100, total: 1 });
    if (url.pathname === collection + "/" + id) return ok(skill);
    if (url.pathname.startsWith(collection + "/" + id + "/versions/")) {
      const [version, content] = url.pathname
        .slice((collection + "/" + id + "/versions/").length)
        .split("/");
      return ok({
        skill_id: id,
        version,
        status: "active",
        ...(content && { file_url: "https://download.example.test/" + version }),
      });
    }
    return Response.json(
      { success: false, error_msg: "Unknown skill", error_code: "NOT_FOUND" },
      { status: 404 },
    );
  });
  return { home, project, state, run, requests };
}

const cursor = ["--agent", "cursor", "--scope", "project"];
const claude = ["--agent", "claude-code", "--scope", "project"];
test("default cloud and explicit OSS isolate same-name installs, including legacy records", async () => {
  const { home, run, requests } = fixture();
  const root = join(home, "config", "skills");
  const localFile = join(root, "reader", "SKILL.md");
  const cloudFile = join(home, ".cursor", "skills", "reader", "SKILL.md");
  const missingOssPath = join(home, ".claude", "skills", "reader");
  mkdirSync(join(root, "reader"), { recursive: true });
  writeFileSync(localFile, "public copy");
  writeFileSync(
    join(root, "skill-lock.json"),
    JSON.stringify({
      version: 1,
      skills: { reader: { installedAt: "2026-01-01", links: [missingOssPath] } },
    }),
  );
  const noKey = { DASHSCOPE_API_KEY: "" };
  const unauthenticated = await run(["list"], noKey);
  expect(unauthenticated.exitCode, unauthenticated.stderr).toBe(3);
  expect(requests).toEqual([]);
  const ossList = await run(["list", "--source", "oss", "--status", "installed"], noKey);
  expect(ossList.exitCode, ossList.stderr).toBe(0);
  expect(JSON.parse(ossList.stdout).skills).toMatchObject([
    { name: "reader", source: "oss", status: "installed" },
  ]);
  expect(requests.splice(0)).toEqual(["/index.json"]);
  const cloudList = await run(["list"]);
  expect(cloudList.exitCode, cloudList.stderr).toBe(0);
  expect(JSON.parse(cloudList.stdout).skills).toMatchObject([
    { skill_code: id, source: "cloud", status: "not-installed" },
  ]);
  const conflict = await run(["add", "--name", id, "--agent", "claude-code"]);
  expect(conflict.exitCode).toBe(1);
  expect(JSON.parse(conflict.stdout).results[0].reason).toBe("SOURCE_CONFLICT");
  expect(existsSync(missingOssPath)).toBe(false);
  const add = await run(["add", "--name", id, "--agent", "cursor"]);
  expect(add.exitCode, add.stderr).toBe(0);
  expect(existsSync(cloudFile)).toBe(true);
  const update = await run(["update", "--all"]);
  expect(update.exitCode, update.stderr).toBe(0);
  expect(JSON.parse(update.stdout).results).toMatchObject([{ code: id, reason: "UP_TO_DATE" }]);
  expect(requests).not.toContain("/index.json");
  requests.length = 0;
  const ossUpdate = await run(["update", "--source", "oss", "--all", "--dry-run"], noKey);
  expect(ossUpdate.exitCode, ossUpdate.stderr).toBe(0);
  expect(JSON.parse(ossUpdate.stdout).results).toMatchObject([{ code: "reader" }]);
  expect(requests.splice(0)).toEqual(["/index.json"]);
  const remove = await run(["remove", "--name", "all"], noKey);
  expect(remove.exitCode, remove.stderr).toBe(0);
  expect(existsSync(cloudFile)).toBe(false);
  expect(readFileSync(localFile, "utf8")).toBe("public copy");
  const removeOss = await run(["remove", "--source", "oss", "--name", "reader"], noKey);
  expect(removeOss.exitCode, removeOss.stderr).toBe(0);
  expect(existsSync(localFile)).toBe(false);
  expect(requests).toEqual([]);
});
test("cloud installs share packages, respect pins, preview and apply updates, then remove offline", async () => {
  const { home, project, state, run, requests } = fixture("ws-install");
  const cursorFile = join(project, ".cursor", "skills", "reader", "SKILL.md");
  const claudeFile = join(project, ".claude", "skills", "reader", "SKILL.md");
  const lock = join(home, "config", "skills", "skill-lock.json");
  const add = ["add", "--name", id];
  const preview = await run([...add, ...cursor, "--dry-run"]);
  expect(preview.exitCode, preview.stderr).toBe(0);
  expect(requests.splice(0)).toEqual([
    `${collection}/${id}`,
    `${collection}/${id}/versions/1.0`,
    `${collection}/${id}/versions/1.0/content`,
    "/1.0",
  ]);
  expect(existsSync(lock)).toBe(false);
  state.expire = true;
  const installed = await run([...add, ...cursor]);
  expect(installed.exitCode, installed.stderr).toBe(0);
  expect(JSON.parse(installed.stdout)).toMatchObject({
    summary: { succeeded: 1 },
    mcp_dependency_status: "metadata_unavailable",
  });
  expect(requests.filter((path) => path.endsWith("/content"))).toHaveLength(2);
  expect(readFileSync(cursorFile, "utf8")).toContain("1.0");
  expect(Object.values(JSON.parse(readFileSync(lock, "utf8")).skills)).toMatchObject([
    { sourceLocation: "https://ws-install.cn-beijing.maas.aliyuncs.com" },
  ]);
  const again = await run([...add, ...cursor]);
  expect(JSON.parse(again.stdout).summary.noop).toBe(1);
  const pinned = await run([...add, ...claude, "--skill-version", "1.0", "--with-mcp", "false"]);
  expect(pinned.exitCode, pinned.stderr).toBe(0);
  expect(JSON.parse(pinned.stdout).mcp_dependency_status).toBe("disabled");
  state.latest = "1.1";
  const list = await run(["list", "--source", "cloud", ...cursor, "--status", "outdated"]);
  expect(JSON.parse(list.stdout).skills).toMatchObject([
    {
      name: "reader",
      skill_code: id,
      locked_version: "1.0",
      latest_version: "1.1",
      agent: "cursor",
    },
  ]);
  const notice = JSON.parse(list.stderr);
  expect(notice).toMatchObject({
    warning: {
      code: "SKILL_UPDATE_AVAILABLE",
      details: {
        scope: "project",
        source: "cloud",
        skills: [{ skill_code: id, agent: "cursor", current: "1.0", latest: "1.1" }],
      },
    },
  });
  const update = ["update", "--name", "reader", ...cursor, "--diff"];
  const before = readFileSync(lock);
  const plan = await run([...update, "--dry-run"]);
  expect(JSON.parse(plan.stdout).results[0].diff).toEqual({
    available: false,
    download_required: true,
    content_path: collection + "/" + id + "/versions/1.1/content",
  });
  expect(readFileSync(lock)).toEqual(before);
  expect(requests).not.toContain("/1.1");
  const updated = await run(update);
  expect(updated.exitCode, updated.stderr).toBe(0);
  expect(JSON.parse(updated.stdout).results[0].diff.modified).toEqual(["SKILL.md"]);
  expect(readFileSync(cursorFile, "utf8")).toContain("1.1");
  const fixed = await run(["update", "--name", id, ...claude]);
  expect(JSON.parse(fixed.stdout).summary.noop).toBe(1);
  expect(readFileSync(claudeFile, "utf8")).toContain("1.0");
  const count = requests.length;
  const removed = await run(["remove", "--name", "reader", ...cursor], {
    DASHSCOPE_API_KEY: "",
    BAILIAN_WORKSPACE_ID: "",
  });
  expect(removed.exitCode, removed.stderr).toBe(0);
  expect(requests).toHaveLength(count);
  expect(existsSync(claudeFile)).toBe(true);
  expect(existsSync(cursorFile)).toBe(false);
});

test("untracked and edited files survive; invalid replacement preserves both installation and lock", async () => {
  const { home, project, run, state } = fixture();
  const directory = join(project, ".cursor", "skills", "reader");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "SKILL.md");
  writeFileSync(file, "existing");
  const add = ["add", "--source", "cloud", "--name", id, ...cursor];
  const conflict = await run(add);
  expect(JSON.parse(conflict.stdout).results[0].reason).toBe("UNTRACKED_CONFLICT");
  expect(readFileSync(file, "utf8")).toBe("existing");
  rmSync(directory, { recursive: true });
  const partial = await run(["add", "--source", "cloud", "--name", id + ",unknown", ...cursor]);
  expect(partial.exitCode).toBe(1);
  expect(JSON.parse(partial.stdout).summary).toEqual({ succeeded: 1, failed: 1, noop: 0 });
  const lock = join(home, "config", "skills", "skill-lock.json");
  const before = readFileSync(lock);
  state.latest = "1.1";
  state.malformed = true;
  const failed = await run(["update", "--name", id, ...cursor]);
  expect(failed.exitCode).toBe(1);
  expect(readFileSync(lock)).toEqual(before);
  expect(readFileSync(file, "utf8")).toContain("1.0");
  writeFileSync(file, "local edit");
  for (const action of ["update", "remove"]) {
    const result = await run([action, "--name", id, ...cursor]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).results[0].reason).toBe("MODIFIED_CONFLICT");
  }
  expect(readFileSync(file, "utf8")).toBe("local edit");
  expect(readFileSync(lock)).toEqual(before);
});

test("list reconciles disk, scoped records and the catalog; update restores a missing target from cache", async () => {
  const { run, project, requests } = fixture();
  const args = ["list", ...cursor];
  const empty = await run(args);
  expect(JSON.parse(empty.stdout).skills[0].status).toBe("not-installed");
  const installed = await run(["add", "--source", "cloud", "--all", ...cursor]);
  expect(installed.exitCode, installed.stderr).toBe(0);
  const root = join(project, ".cursor", "skills");
  mkdirSync(join(root, "handmade"));
  writeFileSync(join(root, "handmade", "SKILL.md"), "handmade");
  const mixed = await run([...args, "--status", "untracked,installed"]);
  expect(JSON.parse(mixed.stdout).skills).toMatchObject([
    { name: "handmade", status: "untracked" },
    { name: "reader", status: "installed" },
  ]);
  rmSync(join(root, "reader"), { recursive: true });
  const missing = await run([...args, "--status", "missing"]);
  expect(JSON.parse(missing.stdout).skills[0].status).toBe("missing");
  const fetched = requests.filter((path) => path === "/1.0").length;
  const repair = await run(["update", "--all", ...cursor]);
  expect(repair.exitCode, repair.stderr).toBe(0);
  expect(readFileSync(join(root, "reader", "SKILL.md"), "utf8")).toContain("1.0");
  expect(requests.filter((path) => path === "/1.0")).toHaveLength(fetched);
  const emptyUser = await run(["list", "--source", "cloud", "--scope", "user"]);
  expect(JSON.parse(emptyUser.stdout).skills).toMatchObject([
    { status: "not-installed", scope: "user" },
  ]);
});

test("package MCP dependencies use only serverCode, plan once, and require confirmation before billing or installing", async () => {
  const { home, project, run, requests, state } = fixture("ws-dependencies");
  state.manifest = JSON.stringify({
    finance: {
      serverCode: "market-finance",
      serverName: "Finance",
      url: "https://untrusted.invalid/tool",
    },
    alias: { serverCode: "market-finance" },
    ready: { serverCode: "ready" },
    custom: { serverCode: "custom" },
    DASHSCOPE_API_KEY: "private-placeholder",
  });
  const base = "/api/v1/mcp/servers/";
  const args = ["add", "--name", id, ...cursor];
  const destinations = [
    join(home, "config", "skills", "skill-lock.json"),
    join(project, ".cursor", "skills", "reader"),
  ];
  const preview = await run([...args, "--dry-run", "--yes"]);
  expect(preview.exitCode, preview.stderr).toBe(0);
  expect(JSON.parse(preview.stdout).mcp_dep_results).toMatchObject([
    {
      code: "market-finance",
      action: "activate",
      status: "planned",
      skills: [id],
      billing: { mode: "per_call", unit_price: "0.01", free_quota: 0 },
    },
    { code: "ready", reason: "ALREADY_ACTIVATED", status: "noop" },
    { code: "custom", action: "enable", status: "planned" },
  ]);
  const confirm = await run(args);
  expect(confirm.exitCode, confirm.stderr).toBe(7);
  expect(confirm.stderr).toContain("requires_confirmation");
  expect(destinations.some((path) => existsSync(path))).toBe(false);
  expect(requests.some((path) => path.endsWith("/activate") || path.endsWith("/enable"))).toBe(
    false,
  );
  requests.length = 0;
  const installed = await run([...args, "--yes"]);
  expect(installed.exitCode, installed.stderr).toBe(0);
  expect(destinations.every((path) => existsSync(path))).toBe(true);
  expect(requests.filter((path) => path.startsWith(base))).toEqual(
    ["market-finance", "ready", "custom", "market-finance/activate", "custom/enable"].map(
      (path) => base + path,
    ),
  );
  expect(requests.filter((path) => path === "/1.0")).toHaveLength(1);
  expect(installed.stdout + installed.stderr + confirm.stderr + preview.stdout).not.toMatch(
    /private-placeholder|untrusted\.invalid/,
  );
  requests.length = 0;
  const again = await run(args);
  expect(again.exitCode, again.stderr).toBe(0);
  expect(
    JSON.parse(again.stdout).mcp_dep_results.every(
      (row: { status: string }) => row.status === "noop",
    ),
  ).toBe(true);
  expect(requests).not.toContain("/1.0");
});

test("manual MCP setup preserves local installation and reports a console link", async () => {
  const { run, project, state } = fixture();
  state.manifest = JSON.stringify({ manual: { serverCode: "manual" } });
  const result = await run(["add", "--name", id, ...cursor]);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    summary: { succeeded: 1 },
    mcp_dependency_status: "failed",
    mcp_dep_results: [
      {
        code: "manual",
        error_code: "MANUAL_SETUP_REQUIRED",
        detail: { console_url: expect.stringMatching(/^https:/) },
      },
    ],
  });
  expect(existsSync(join(project, ".cursor", "skills", "reader", "SKILL.md"))).toBe(true);
});

test("OSS fan-out reads the same manifest, supports explicit credentials and keeps installation available without a key", async () => {
  const { home, run, requests, state } = fixture();
  state.manifest = JSON.stringify({ finance: { serverCode: "market-finance" } });
  const args = ["add", "--source", "oss", "--name", "reader"];
  const offline = await run(args, { DASHSCOPE_API_KEY: "" });
  expect(offline.exitCode, offline.stderr).toBe(3);
  expect(JSON.parse(offline.stdout)).toMatchObject({
    summary: { succeeded: 1 },
    mcp_dep_results: [{ code: "market-finance", status: "failed" }],
  });
  expect(existsSync(join(home, "config", "skills", "reader", "mcp-config.json"))).toBe(true);
  expect(requests).toEqual(["/index.json", "/reader/skill.tar.br"]);
  const activated = await run([...args, "--yes"]);
  expect(activated.exitCode, activated.stderr).toBe(0);
  expect(JSON.parse(activated.stdout).mcp_dep_results).toMatchObject([
    { code: "market-finance", status: "succeeded" },
  ]);
  requests.length = 0;
  const disabled = await run([...args, "--with-mcp", "false"], { DASHSCOPE_API_KEY: "" });
  expect(disabled.exitCode, disabled.stderr).toBe(0);
  expect(JSON.parse(disabled.stdout)).toMatchObject({
    mcp_dep_results: [],
    mcp_dependency_status: "disabled",
  });
  expect(requests.some((path) => path.includes("/mcp/"))).toBe(false);
});

test("invalid manifests do not disclose their contents or issue MCP requests", async () => {
  const { run, requests, state } = fixture();
  state.manifest = '{"DASHSCOPE_API_KEY":"private-placeholder",';
  const args = ["add", "--name", id, ...cursor];
  const invalid = await run([...args, "--yes"]);
  expect(invalid.exitCode, invalid.stderr).toBe(1);
  expect(invalid.stderr + invalid.stdout).not.toContain("private-placeholder");
  const disabled = await run([...args, "--with-mcp", "false"]);
  expect(disabled.exitCode, disabled.stderr).toBe(0);
  expect(requests.some((path) => path.includes("/mcp/"))).toBe(false);
});

test("skill get reads by default from the latest package without installing or contacting MCP; absent and empty declarations differ", async () => {
  const { run, state, requests, home } = fixture();
  const get = ["get", "--name", id];
  const detail = await run([...get, "--with-mcp", "false"]);
  expect(detail.exitCode, detail.stderr).toBe(0);
  expect(requests.splice(0)).toEqual([`${collection}/${id}`]);
  const inspect = [...get, "--with-mcp"];
  const absent = await run(get);
  expect(JSON.parse(absent.stdout).depends_on_mcp).toBe(null);
  state.manifest = "{}";
  expect(JSON.parse((await run(inspect)).stdout).depends_on_mcp).toEqual([]);
  state.manifest = JSON.stringify({
    alias: { serverCode: "market-finance" },
    other: { serverCode: "market-finance" },
    DASHSCOPE_API_KEY: "private-placeholder",
  });
  const result = await run(get);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    latest_version: "1.0",
    depends_on_mcp: ["market-finance"],
  });
  expect(result.stdout).not.toContain("private-placeholder");
  state.manifest = "invalid private-placeholder";
  const broken = await run(get);
  expect(broken.exitCode).toBe(1);
  expect(JSON.parse(broken.stdout)).toMatchObject({ skill_code: id, depends_on_mcp: null });
  expect(broken.stderr).not.toContain("private-placeholder");
  expect(requests.some((path) => path.includes("/mcp/"))).toBe(false);
  expect(existsSync(join(home, "config", "skills"))).toBe(false);
});

test("bulk OSS installation activates a shared dependency once and identifies both owners", async () => {
  const { state, run, requests } = fixture();
  state.manifest = JSON.stringify({ shared: { serverCode: "shared" } });
  state.ossNames = ["reader", "writer"];
  const result = await run(["add", "--all", "--source", "oss", "--yes"]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    summary: { succeeded: 2 },
    mcp_dep_results: [{ code: "shared", status: "succeeded", skills: ["reader", "writer"] }],
  });
  expect(requests.filter((path) => path.includes("/mcp/"))).toEqual([
    "/api/v1/mcp/servers/shared",
    "/api/v1/mcp/servers/shared/activate",
  ]);
  expect(requests.filter((path) => path.endsWith(".tar.br"))).toHaveLength(2);
});

test("legacy OSS previews and repairs only missing agent links, then reports a noop", async () => {
  const { home, state, run, requests } = fixture();
  const canonical = join(home, "config", "skills", "reader");
  const existing = join(home, ".claude", "skills", "reader");
  const missing = join(home, ".cursor", "skills", "reader");
  mkdirSync(canonical, { recursive: true });
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  mkdirSync(join(home, ".cursor"));
  writeFileSync(join(canonical, "SKILL.md"), "legacy");
  symlinkSync(canonical, existing, "junction");
  state.ossHash = "same-index-hash";
  const lock = join(home, "config", "skills", "skill-lock.json");
  writeFileSync(
    lock,
    JSON.stringify({
      version: 1,
      skills: {
        reader: { sourceType: "oss", contentHash: state.ossHash, links: [existing] },
      },
    }),
  );
  const args = ["update", "--source", "oss", "--name", "reader"];
  const before = readFileSync(lock);
  for (const preview of [true, false]) {
    const result = await run(preview ? [...args, "--dry-run"] : args);
    expect(result.exitCode, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.summary).toEqual({ succeeded: 1, noop: 0, failed: 0 });
    expect(payload.results[0]).toMatchObject({ status: "succeeded", reason: "REPAIRED" });
    expect(payload.results[0].agent_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: "cursor",
          installed_path: missing,
          status: "succeeded",
          reason: "REPAIRED",
        }),
        expect.objectContaining({ agent: "claude-code", installed_path: existing, status: "noop" }),
      ]),
    );
    expect(existsSync(missing)).toBe(!preview);
    if (preview) expect(readFileSync(lock)).toEqual(before);
  }
  expect(JSON.parse(readFileSync(lock, "utf8")).skills.reader.links).toContain(missing);
  const again = await run(args);
  expect(JSON.parse(again.stdout).results[0]).toMatchObject({
    status: "noop",
    reason: "UP_TO_DATE",
  });
  expect(requests).toEqual(["/index.json", "/index.json", "/index.json"]);
});

test("legacy OSS removal restores the canonical package, symlink, fallback copy and ledger on commit failure", async () => {
  const { home, run, requests } = fixture();
  const root = join(home, "config", "skills");
  const canonical = join(root, "reader");
  const link = join(home, ".claude", "skills", "reader");
  const copy = join(home, ".cursor", "skills", "reader");
  for (const path of [canonical, copy]) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "SKILL.md"), "original");
  }
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(canonical, link, "junction");
  const lock = join(root, "skill-lock.json");
  writeFileSync(
    lock,
    JSON.stringify({
      version: 1,
      skills: {
        reader: { sourceType: "oss", links: [link, copy] },
      },
    }),
  );
  const before = readFileSync(lock);
  vi.spyOn(core, "writeSkillLock").mockImplementationOnce(() => {
    expect(
      [canonical, link, copy].every((path) => !lstatSync(path, { throwIfNoEntry: false })),
    ).toBe(true);
    throw new Error("fixture lock write failed");
  });
  const args = ["remove", "--source", "oss", "--name", "reader"];
  const failed = await run(args);
  expect(failed.exitCode).toBe(1);
  expect(failed.stderr).toContain("fixture lock write failed");
  expect(readFileSync(lock)).toEqual(before);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  for (const path of [canonical, link, copy])
    expect(readFileSync(join(path, "SKILL.md"), "utf8")).toBe("original");
  expect((await run(args)).exitCode).toBe(0);
  expect(JSON.parse(readFileSync(lock, "utf8")).skills).toEqual({});
  expect(requests).toEqual([]);
});

test("OSS update checks use one catalog read, notify without modifying installs and use the cache on offline removal", async () => {
  const { home, state, run, requests } = fixture();
  state.ossHash = "new-index-hash";
  const root = join(home, "config", "skills");
  for (const name of ["reader", "old"]) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, "SKILL.md"), "original");
  }
  const record = { sourceType: "oss", contentHash: "old-index-hash" };
  const lock = join(root, "skill-lock.json");
  writeFileSync(lock, JSON.stringify({ version: 1, skills: { reader: record, old: record } }));
  const before = readFileSync(lock);
  const list = await run(["list", "--source", "oss"], { DASHSCOPE_API_KEY: "" });
  expect(list.exitCode, list.stderr).toBe(0);
  expect(list.stderr).toContain("SKILL_UPDATE_AVAILABLE");
  expect(readFileSync(lock)).toEqual(before);
  expect(readFileSync(join(root, "reader", "SKILL.md"), "utf8")).toBe("original");
  expect(requests.splice(0)).toEqual(["/index.json"]);
  const removal = await run(["remove", "--source", "oss", "--name", "old"]);
  expect(removal.exitCode, removal.stderr).toBe(0);
  expect(removal.stderr).toContain("SKILL_UPDATE_AVAILABLE");
  expect(requests).toEqual([]);
});
