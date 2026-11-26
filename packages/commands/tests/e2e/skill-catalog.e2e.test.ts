import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildSkillLockEntry, httpTransport } from "bailian-cli-core";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { buildTarBr } from "../../../core/tests/helpers/skill-archive.ts";
import {
  isDashScopeE2EReady,
  runCommandE2e,
  runCommandHelp,
  runCommandInProcess,
} from "./helpers.ts";
import { SKILL_ROUTES } from "./topic-routes.ts";

const origin = "https://skills.example.test";
const collection = "/api/v1/skills";
const offlineEnv = {
  DASHSCOPE_API_KEY: "fixture-key",
  DASHSCOPE_BASE_URL: origin,
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

function run(args: string[], env = {}, cwd?: string) {
  return runCommandInProcess(
    SKILL_ROUTES,
    ["skill", ...args, "--output", "json"],
    { ...offlineEnv, ...env },
    { cwd },
  );
}

function skill(id: string, source = "official") {
  return {
    id,
    display_name: "Display name",
    display_description: "Description",
    source,
    status: "active",
    latest_version: "2.0",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  };
}

function page(pageNo: number, pageSize: number, total: number, items: ReturnType<typeof skill>[]) {
  return { page_no: pageNo, page_size: pageSize, total, items };
}

function success(data: unknown) {
  return Response.json({ success: true, data, request_id: "fixture-request" });
}

// Exercise the parser, auth middleware, HTTP client and output in-process.
function gateway(...responses: Response[]) {
  const requests: URL[] = [];
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    expect(url.origin).toBe(origin);
    expect(request.method).toBe("GET");
    expect(request.headers.get("Authorization")).toBe("Bearer fixture-key");
    expect(request.body).toBeNull();
    requests.push(url);
    const response = responses.shift();
    if (!response) throw new Error("Unexpected catalog request");
    return response;
  });
  return requests;
}

afterEach(() => vi.restoreAllMocks());

test.each([
  ["search", "--keyword"],
  ["get", "--code"],
])("%s help exposes API key auth", async (command, flag) => {
  const result = await runCommandHelp(SKILL_ROUTES, ["skill", command, "--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain(flag);
  if (command === "get") expect(result.stderr).toContain("--name");
  expect(result.stderr).toContain("--api-key");
  expect(result.stderr).toContain("--workspace-id");
  expect(result.stderr).not.toContain("--console-region");
});

test("cloud requests derive the workspace gateway only when the base URL is implicit", async ({
  onTestFinished,
}) => {
  const config = mkdtempSync(join(tmpdir(), "bl-skill-workspace-"));
  onTestFinished(() => rmSync(config, { recursive: true, force: true }));
  const env = { BAILIAN_CONFIG_DIR: config, BAILIAN_WORKSPACE_ID: "", DASHSCOPE_BASE_URL: "" };
  const path = join(config, "config.json");
  writeFileSync(path, JSON.stringify({ workspace_id: "ws-config" }));
  const requests: string[] = [];
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    expect(request.headers.get("Authorization")).toBe("Bearer fixture-key");
    expect(new URL(request.url).pathname).toBe(collection);
    requests.push(new URL(request.url).origin);
    return success(page(1, 30, 0, []));
  });
  async function search(flags: string[], overrides = {}) {
    const result = await run(["search", ...flags], { ...env, ...overrides });
    expect(result.exitCode, result.stderr).toBe(0);
  }
  await search([]);
  await search([], { BAILIAN_WORKSPACE_ID: "ws-env" });
  await search(["--workspace-id", "ws-flag"], { BAILIAN_WORKSPACE_ID: "ws-env" });
  writeFileSync(
    path,
    JSON.stringify({ workspace_id: "ws-config", base_url: "https://dashscope.aliyuncs.com" }),
  );
  await search(["--workspace-id", "ws-flag"]);
  await search([], { DASHSCOPE_BASE_URL: origin });
  await search(["--base-url", "https://override.example.test"], { DASHSCOPE_BASE_URL: origin });
  expect(requests).toEqual([
    "https://ws-config.cn-beijing.maas.aliyuncs.com",
    "https://ws-env.cn-beijing.maas.aliyuncs.com",
    "https://ws-flag.cn-beijing.maas.aliyuncs.com",
    "https://dashscope.aliyuncs.com",
    origin,
    "https://override.example.test",
  ]);

  writeFileSync(path, "{}");
  const missing = await run(["search"], env);
  expect(missing.exitCode, missing.stderr).toBe(2);
  expect(missing.stderr).toContain("--workspace-id");
  const invalid = await run(["search", "--workspace-id", "other.example/path"], env);
  expect(invalid.exitCode, invalid.stderr).toBe(2);
  expect(requests).toHaveLength(6);
});

test.each([
  ["get", "--quiet"],
  ["get", "--name", " "],
  ["get", "--name", ".."],
  ["get", "--code", " "],
  ["get", "--code", ".."],
  ["get", "--name", "pdf", "--code", "pdf"],
  ["search", "--type", "other"],
  ["search", "--page", "0"],
  ["search", "--page-size", "101"],
  ["search", "--page", "101", "--page-size", "100"],
  ["search", "--limit", "0"],
  ["search", "--limit", "1.5"],
])("invalid args fail before a request (%s %s %s)", async (...args) => {
  const requests = gateway();
  const result = await run(args);
  expect(result.exitCode, result.stderr).toBe(2);
  expect(requests).toHaveLength(0);
});

test("dry-run previews encoded paths without credentials or requests", async () => {
  const requests = gateway();
  const env = { DASHSCOPE_API_KEY: "", DASHSCOPE_BASE_URL: "", BAILIAN_WORKSPACE_ID: "" };
  const search = await run(["search", "--keyword", "  ", "--type", "OFFICIAL", "--dry-run"], env);
  expect(search.exitCode, search.stderr).toBe(0);
  expect(JSON.parse(search.stdout)).toEqual({
    method: "GET",
    path: collection + "?pageNo=1&pageSize=30&type=OFFICIAL",
    limit: 30,
  });
  const registry = "https://skills-registry.example.test/skills";
  const registryPreview = await run(["get", "--name", "sample", "--dry-run"], {
    ...env,
    BAILIAN_SKILL_REGISTRY_URL: registry,
  });
  expect(registryPreview.exitCode, registryPreview.stderr).toBe(0);
  expect(JSON.parse(registryPreview.stdout)).toEqual({
    method: "GET",
    url: registry + "/index.json",
    name: "sample",
    inspect_latest_package_file: "mcp-config.json",
  });
  const detail = await run(["get", "--code", "a/b?#", "--dry-run"], env);
  expect(detail.exitCode, detail.stderr).toBe(0);
  expect(JSON.parse(detail.stdout)).toEqual({
    method: "GET",
    path: collection + "/a%2Fb%3F%23",
    inspect_latest_package_file: "mcp-config.json",
  });
  const unauthenticated = await run(["search"], env);
  expect(unauthenticated.exitCode).toBe(3);
  expect(requests).toHaveLength(0);
});

test("filtered search checks other installed cloud revisions, reuses fresh checks and tolerates lookup errors", async ({
  onTestFinished,
}) => {
  const config = mkdtempSync(join(tmpdir(), "bl-update-check-"));
  onTestFinished(() => rmSync(config, { recursive: true, force: true }));
  const remote = skill("skill_managed");
  const skills = join(config, "skills");
  mkdirSync(skills);
  const lock = join(skills, "skill-lock.json");
  const installed = JSON.stringify({
    version: 1,
    skills: {
      reader: {
        sourceType: "openapi",
        remoteId: remote.id,
        installedVersion: "1.9",
        sourceLocation: origin,
      },
    },
  });
  writeFileSync(lock, installed);
  const empty = () => success(page(1, 30, 0, []));
  const requests = gateway(
    empty(),
    success(remote),
    empty(),
    empty(),
    Response.json({ success: false }, { status: 503 }),
  );
  const args = ["search", "--keyword", "unrelated"];
  const env = { BAILIAN_CONFIG_DIR: config };
  expect((await run([...args, "--dry-run"], env)).exitCode).toBe(0);
  expect(requests).toHaveLength(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await run(args, env);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stderr)).toMatchObject({
      warning: { code: "SKILL_UPDATE_AVAILABLE", details: { update_command: "bl skill update" } },
    });
    expect(JSON.parse(result.stdout).skills).toEqual([]);
  }
  const cache = join(config, "skill-update-cache");
  const file = join(cache, readdirSync(cache)[0]!);
  writeFileSync(file, JSON.stringify({ checkedAt: 0, revision: remote.latest_version }));
  const offline = await run(args, env);
  expect(offline.exitCode, offline.stderr).toBe(0);
  expect(offline.stderr).not.toContain("SKILL_UPDATE_AVAILABLE");
  expect(requests.map((url) => url.pathname)).toEqual([
    collection,
    collection + "/" + remote.id,
    collection,
    collection,
    collection + "/" + remote.id,
  ]);
  expect(readFileSync(lock, "utf8")).toBe(installed);
});

test("search returns an empty mixed catalog page", async () => {
  const requests = gateway(success(page(1, 30, 0, [])));
  const result = await run(["search"]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    total: 0,
    page_start: 1,
    page_end: 1,
    page_size: 30,
    skills: [],
  });
  expect(requests.map((url) => url.pathname + url.search)).toEqual([
    collection + "?pageNo=1&pageSize=30",
  ]);
});

test("search sends the filters on every page and only returns as many items as requested", async () => {
  const skills = ["third", "fourth", "fifth", "sixth"].map((id) => skill(id, "customer"));
  const requests = gateway(
    success(page(2, 2, 8, skills.slice(0, 2))),
    success(page(3, 2, 8, skills.slice(2))),
  );
  const result = await run([
    "search",
    "--keyword",
    "  订单 & pdf  ",
    "--type",
    "PRIVATE",
    "--page",
    "2",
    "--page-size",
    "2",
    "--limit",
    "3",
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ total: 8, page_start: 2, page_end: 3, page_size: 2 });
  expect(output.skills.map((item: { skill_code: string }) => item.skill_code)).toEqual([
    "third",
    "fourth",
    "fifth",
  ]);
  expect(output.skills[0]).toMatchObject({
    type: "private",
    skill_name: "Display name",
    description: "Description",
    latest_version: "2.0",
    installed: false,
    install_state: "not-installed",
    installations: [],
  });
  expect(requests.map((url) => [url.pathname, Object.fromEntries(url.searchParams)])).toEqual(
    ["2", "3"].map((pageNo) => [
      collection,
      { pageNo, pageSize: "2", type: "CUSTOMER", keywords: "订单 & pdf" },
    ]),
  );
});

test("search stops at the service window even if more matches exist", async () => {
  const requests = gateway(success(page(10000, 1, 10001, [skill("last")])));
  const result = await run(["search", "--page", "10000", "--page-size", "1", "--limit", "2"]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    page_end: 10000,
    total: 10001,
    skills: [{ skill_code: "last" }],
  });
  expect(requests).toHaveLength(1);
});

test("an inconsistent later page fails without emitting a partial search result", async () => {
  const requests = gateway(
    success(page(1, 1, 3, [skill("first")])),
    success(page(1, 1, 3, [skill("first")])),
  );
  const result = await run(["search", "--page-size", "1", "--limit", "3"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).error.request_id).toBe("fixture-request");
  expect(requests.map((url) => url.searchParams.get("pageNo"))).toEqual(["1", "2"]);
});

test("cloud search and get by code reconcile canonical installation names, user links and project installations", async ({
  onTestFinished,
}) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "bl-skill-catalog-")));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const project = join(directory, "project");
  const config = join(directory, "config");
  const canonical = join(config, "skills", "canonical");
  const missingLink = join(directory, ".claude", "skills", "canonical");
  const projectPath = join(project, ".cursor", "skills", "canonical");
  for (const path of [canonical, projectPath]) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "SKILL.md"), "---\nname: canonical\ndescription: fixture\n---\n");
  }
  const remote = skill("skill_abc");
  const lockPath = join(dirname(canonical), "skill-lock.json");
  const lock = JSON.stringify({
    version: 1,
    skills: {
      canonical: {
        ...buildSkillLockEntry({ remoteId: remote.id, version: "1.0" }, [missingLink]),
        sourceType: "openapi",
      },
    },
  });
  writeFileSync(lockPath, lock);
  const requests = gateway(success(remote), success(page(1, 30, 1, [remote])));
  const env = { HOME: directory, USERPROFILE: directory, BAILIAN_CONFIG_DIR: config };
  const result = await run(["get", "--code", remote.id, "--with-mcp", "false"], env, project);
  expect(result.exitCode, result.stderr).toBe(0);
  const detail = JSON.parse(result.stdout);
  expect(detail).toMatchObject({
    skill_code: remote.id,
    install_state: "outdated",
    locked_version: "1.0",
    installed: true,
    installations: [
      {
        agent: null,
        scope: "user",
        installed_path: canonical,
        install_state: "outdated",
        locked_version: "1.0",
      },
      {
        agent: "claude-code",
        scope: "user",
        installed_path: missingLink,
        install_state: "missing",
      },
      {
        agent: "cursor",
        scope: "project",
        installed_path: projectPath,
        install_state: "untracked",
        locked_version: null,
      },
    ],
  });
  const search = await run(["search"], env, project);
  expect(search.exitCode, search.stderr).toBe(0);
  expect(JSON.parse(search.stdout).skills).toEqual([detail]);
  expect(requests.map((url) => url.pathname)).toEqual([collection + "/skill_abc", collection]);
  expect(readFileSync(lockPath, "utf8")).toBe(lock);
});

test("get by name reads an unversioned OSS archive and distinguishes installations from same-code OpenAPI results", async ({
  onTestFinished,
}) => {
  const config = mkdtempSync(join(tmpdir(), "bl-skill-legacy-"));
  onTestFinished(() => rmSync(config, { recursive: true, force: true }));
  const canonical = join(config, "skills", "pdf");
  mkdirSync(canonical, { recursive: true });
  writeFileSync(join(canonical, "SKILL.md"), "fixture");
  writeFileSync(
    join(dirname(canonical), "skill-lock.json"),
    JSON.stringify({ version: 1, skills: { pdf: { sourceType: "oss", contentHash: "old" } } }),
  );
  const registry = "https://registry.example.test/skills";
  const env = {
    BAILIAN_CONFIG_DIR: config,
    BAILIAN_SKILL_REGISTRY_URL: registry,
    DASHSCOPE_API_KEY: "",
    DASHSCOPE_BASE_URL: "",
    BAILIAN_WORKSPACE_ID: "",
  };
  const archive = await buildTarBr({
    "SKILL.md": "---\nname: pdf\ndescription: OSS sample\n---\n",
    "mcp-config.json": JSON.stringify({ service: { serverCode: "declared-mcp" } }),
  });
  const requests: string[] = [];
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.url);
    expect(request.method).toBe("GET");
    if (request.url.startsWith(origin + collection)) {
      expect(request.headers.get("Authorization")).toBe("Bearer fixture-key");
      return success(skill("pdf"));
    }
    expect(request.headers.get("Authorization")).toBeNull();
    if (request.url === registry + "/index.json")
      return Response.json({
        skills: { pdf: { remoteId: "skill_pdf", description: "OSS sample", contentHash: "new" } },
      });
    if (request.url === registry + "/pdf/skill.tar.br") return new Response(Buffer.from(archive));
    throw new Error("unexpected request");
  });
  const first = await run(["get", "--name", "pdf"], env);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({
    skill_name: "pdf",
    skill_code: "skill_pdf",
    source: "oss",
    description: "OSS sample",
    latest_version: null,
    install_state: "outdated",
    locked_version: null,
    depends_on_mcp: ["declared-mcp"],
    installations: [{ installed_path: canonical, install_state: "outdated" }],
  });
  const metadata = await run(["get", "--name", "pdf", "--with-mcp", "false"], env);
  expect(metadata.exitCode, metadata.stderr).toBe(0);
  expect(JSON.parse(metadata.stdout)).not.toHaveProperty("depends_on_mcp");
  const missing = await run(["get", "--name", "absent"], env);
  expect(missing.exitCode, missing.stderr).toBe(1);
  expect(missing.stderr).toContain("OSS");
  const unauthenticated = await run(["get", "--code", "pdf", "--with-mcp", "false"], env);
  expect(unauthenticated.exitCode, unauthenticated.stderr).toBe(3);
  const cloud = await run(["get", "--code", "pdf", "--with-mcp", "false"], {
    BAILIAN_CONFIG_DIR: config,
  });
  expect(cloud.exitCode, cloud.stderr).toBe(0);
  expect(JSON.parse(cloud.stdout)).toMatchObject({
    source: "official",
    installed: false,
    installations: [],
  });
  expect(requests).toEqual([
    registry + "/index.json",
    registry + "/pdf/skill.tar.br",
    registry + "/index.json",
    registry + "/index.json",
    origin + collection + "/pdf",
  ]);
});

test("get keeps distinct target versions and ignores records from another gateway or project", async ({
  onTestFinished,
}) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "bl-skill-targets-")));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const project = join(directory, "project");
  const config = join(directory, "config");
  const userPath = join(directory, ".claude", "skills", "reader");
  const projectPath = join(project, ".cursor", "skills", "reader");
  for (const path of [userPath, projectPath]) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "SKILL.md"), "fixture");
  }
  const user = {
    canonicalName: "reader",
    remoteId: "skill_reader",
    sourceType: "openapi",
    sourceLocation: origin,
    agent: "claude-code",
    scope: "user",
    installedPath: userPath,
    installedVersion: "1.0",
  };
  const scoped = {
    ...user,
    agent: "cursor",
    scope: "project",
    projectRoot: project,
    installedPath: projectPath,
    installedVersion: "2.0",
  };
  mkdirSync(join(config, "skills"), { recursive: true });
  writeFileSync(
    join(config, "skills", "skill-lock.json"),
    JSON.stringify({
      version: 1,
      skills: {
        first: user,
        second: scoped,
        foreign: { ...user, remoteId: "elsewhere", sourceLocation: "https://other.example.test" },
        otherProject: {
          ...scoped,
          remoteId: "other-project",
          projectRoot: join(directory, "other"),
        },
      },
    }),
  );
  const requests = gateway(success(skill(user.remoteId)));
  const detail = await run(
    ["get", "--code", user.remoteId, "--with-mcp", "false"],
    { HOME: directory, USERPROFILE: directory, BAILIAN_CONFIG_DIR: config },
    project,
  );
  expect(detail.exitCode, detail.stderr).toBe(0);
  expect(JSON.parse(detail.stdout)).toMatchObject({
    skill_code: user.remoteId,
    locked_version: null,
    installations: [
      { agent: "claude-code", scope: "user", install_state: "outdated", locked_version: "1.0" },
      { agent: "cursor", scope: "project", install_state: "installed", locked_version: "2.0" },
    ],
  });
  expect(requests.map((url) => url.pathname)).toEqual([collection + "/skill_reader"]);
});

test.each([200, 500])("get preserves a server error returned with HTTP %i", async (status) => {
  gateway(
    Response.json(
      {
        success: false,
        error_code: "SKILL_NOT_EXIST",
        error_msg: "skill不存在",
        data: null,
        request_id: "req-detail",
      },
      { status },
    ),
  );
  const result = await run(["get", "--code", "unknown"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).error).toMatchObject({
    api_code: "SKILL_NOT_EXIST",
    message: "skill不存在",
    request_id: "req-detail",
  });
});

describe.skipIf(!isDashScopeE2EReady())("cloud skill gateway", () => {
  // Live subprocess smoke uses the configured API key and gateway through normal CLI startup.
  test("a returned official code opens its detail", async () => {
    const search = await runCommandE2e(SKILL_ROUTES, [
      "skill",
      "search",
      "--type",
      "official",
      "--page-size",
      "1",
      "--output",
      "json",
    ]);
    expect(search.exitCode, search.stderr).toBe(0);
    const code = JSON.parse(search.stdout).skills[0]?.skill_code;
    expect(code).toEqual(expect.any(String));
    const detail = await runCommandE2e(SKILL_ROUTES, [
      "skill",
      "get",
      "--code",
      code,
      "--output",
      "json",
    ]);
    expect(detail.exitCode, detail.stderr).toBe(0);
    expect(JSON.parse(detail.stdout).skill_code).toBe(code);
  });
});
