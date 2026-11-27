import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  RAG_PATHS,
  SANDBOX_PATHS,
  agentStudioHost,
  chatPath,
  classifyServicePlane,
  classifyModelHost,
  createRequestSignals,
  httpTransport,
  knowledgeChatEndpoint,
  knowledgeSearchEndpoint,
  memoryAddAsyncPath,
  memoryEndpoint,
  memoryEventPath,
  memoryListPath,
  memoryNodePath,
  memorySearchPath,
  memorySkillExportPath,
  parsexBaseUrl,
  parsexEndpoint,
  productSiteOf,
  profileSchemaPath,
  ragEndpoint,
  sandboxEndpoint,
  securityOverviewEndpoint,
  SERVICE_PLANES,
  userProfilePath,
  Client,
  type Identity,
  type ServicePlane,
  type Settings,
} from "../src/index.ts";
// The custom-model import builders are internal to core (only model-import/api.ts
// uses them), so they are not part of the package index.
import {
  customModelImportEndpoint,
  customModelImportJobEndpoint,
} from "../src/client/endpoints.ts";
import { resolveTelemetrySite } from "../src/telemetry/site.ts";

afterEach(() => vi.restoreAllMocks());

const identity: Identity = {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli-test",
  npmPackage: "bailian-cli",
};
const workspaceId = "ws-review";

function makeClient(baseUrl: string): Client {
  return new Client({
    identity,
    settings: { telemetry: true, timeout: 30 } as Settings,
    baseUrl,
    baseUrlIsDefault: false,
    apiCred: { token: "sk-test", baseUrl, source: "config" },
  });
}

/**
 * Drift guard: every absolute URL the CLI builds for a mainland-only or
 * overridable service plane must resolve to a known plane, and a plane
 * declared `domestic` must only ever be emitted on a mainland host. A new
 * workspace-scoped endpoint missing from the table silently loses its product
 * attribution, which is exactly the bug class of issue #349.
 */
test("every RAG admin-plane path maps to the domestic rag-workspace plane", () => {
  for (const [name, path] of Object.entries(RAG_PATHS)) {
    const plane = classifyServicePlane(ragEndpoint(workspaceId, path));
    expect(plane?.key, `RAG_PATHS.${name} ${path}`).toBe("rag-workspace");
    expect(plane?.site, `RAG_PATHS.${name} ${path}`).toBe("domestic");
  }
});

test("knowledge search and chat map to the domestic rag-workspace plane", () => {
  expect(classifyServicePlane(knowledgeSearchEndpoint(workspaceId))?.key).toBe("rag-workspace");
  expect(classifyServicePlane(knowledgeChatEndpoint(workspaceId))?.key).toBe("rag-workspace");
});

test("memory endpoints map to the domestic memory plane", () => {
  const memoryPaths = [
    memoryAddAsyncPath(),
    memoryEventPath("event-one"),
    memorySearchPath(),
    memoryListPath(),
    memoryNodePath("node-one"),
    memorySkillExportPath("node-one"),
    profileSchemaPath(),
    userProfilePath("schema-one"),
  ];
  for (const path of memoryPaths) {
    const plane = classifyServicePlane(memoryEndpoint(workspaceId, path));
    expect(plane?.key, path).toBe("memory");
    expect(plane?.site, path).toBe("domestic");
  }
});

test("overridable planes carry no product verdict", () => {
  // A bare origin has no service path, so it carries no verdict at all.
  expect(classifyServicePlane(parsexBaseUrl(workspaceId))).toBeUndefined();
  expect(
    classifyServicePlane(parsexEndpoint(parsexBaseUrl(workspaceId), "parse", "submit"))?.key,
  ).toBe("parsex");
  expect(
    classifyServicePlane(
      parsexEndpoint("https://ws.cn-beijing.pre-maas.aliyuncs.com", "extract", "result"),
    )?.key,
  ).toBe("parsex");
  // Prefixes are path-segment bounded, so a sibling namespace stays unmapped.
  expect(
    classifyServicePlane("https://ws.cn-beijing.maas.aliyuncs.com/api/v2/apps/parse-xfoo"),
  ).toBeUndefined();
  expect(classifyServicePlane(sandboxEndpoint(workspaceId, SANDBOX_PATHS.sandboxList))?.key).toBe(
    "agentstudio",
  );
  expect(classifyServicePlane(securityOverviewEndpoint(agentStudioHost(workspaceId)))?.key).toBe(
    "agentstudio",
  );
  for (const key of ["parsex", "agentstudio"]) {
    expect(SERVICE_PLANES.find((plane) => plane.key === key)?.site).toBe("follow");
  }
});

test("custom model import maps to the domestic plane", () => {
  expect(classifyServicePlane(customModelImportEndpoint())?.key).toBe("custom-model-import");
  expect(classifyServicePlane(customModelImportJobEndpoint("job-one"))?.site).toBe("domestic");
});

/**
 * Pathname-only classification is only sound while a domestic plane is never
 * emitted on a non-mainland host. These are the builders behind that invariant.
 */
test("domestic planes are only ever built on mainland hosts", () => {
  const mainlandUrls = [
    ragEndpoint(workspaceId, RAG_PATHS.indexList),
    knowledgeSearchEndpoint(workspaceId),
    knowledgeChatEndpoint(workspaceId),
    memoryEndpoint(workspaceId, memoryAddAsyncPath()),
    customModelImportEndpoint(),
  ];
  for (const requestUrl of mainlandUrls) {
    const plane = classifyServicePlane(requestUrl);
    expect(plane?.site, requestUrl).toBe("domestic");
    const origin = new URL(requestUrl).origin;
    expect(classifyModelHost(origin), `${requestUrl} → ${origin}`).toBe("domestic");
  }
});

test("model-domain paths carry no plane, so the host keeps deciding", () => {
  expect(classifyServicePlane(`https://dashscope.aliyuncs.com${chatPath()}`)).toBeUndefined();
  expect(classifyServicePlane("not a url")).toBeUndefined();
  expect(classifyServicePlane("")).toBeUndefined();
});

test("productSiteOf ignores follow planes and stays conservative on conflict", () => {
  const planes = new Map(SERVICE_PLANES.map((plane) => [plane.key, plane]));
  expect(productSiteOf([planes.get("rag-workspace")!, planes.get("parsex")!])).toBe("domestic");
  expect(productSiteOf([planes.get("parsex")!, planes.get("agentstudio")!])).toBeUndefined();
  expect(productSiteOf([])).toBeUndefined();
  // Two disagreeing fixed verdicts fall back to domestic, the same conservative
  // default the host classifier uses for unknown hosts.
  const syntheticInternationalPlane: ServicePlane = {
    key: "test-international",
    site: "international",
    prefixes: ["/api/test/"],
  };
  expect(productSiteOf([syntheticInternationalPlane])).toBe("international");
  expect(productSiteOf([planes.get("memory")!, syntheticInternationalPlane])).toBe("domestic");
});

/**
 * `lastOrigin` is the signal site routing reads, so it must follow the most
 * recent record. The capped first-seen list is inspection only: A → B → A
 * leaves A as the last used origin while the list still ends on B.
 */
test("lastOrigin tracks the most recent record instead of first-seen order", () => {
  const signals = createRequestSignals();
  const workspaceUrl = `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/indices/rag/index/list`;
  const modelUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

  signals.record(workspaceUrl);
  signals.record(modelUrl);
  signals.record(workspaceUrl);

  expect(signals.lastOrigin()).toBe(`https://${workspaceId}.cn-beijing.maas.aliyuncs.com`);
  expect(signals.origins).toEqual([
    `https://${workspaceId}.cn-beijing.maas.aliyuncs.com`,
    "https://dashscope-intl.aliyuncs.com",
  ]);
  // The cap trims the inspection list only; the deciding signals survive.
  for (let index = 0; index < 12; index += 1) {
    signals.record(`https://proxy-${index}.example.test/api/v1/tasks/task-one`);
  }
  expect(signals.origins).toHaveLength(8);
  expect(signals.lastOrigin()).toBe("https://proxy-11.example.test");
  expect(signals.productSite()).toBe("domestic");
});

test("#349 knowledge list on an international base URL still reports the domestic site", async () => {
  const requestedUrls: string[] = [];
  const transport = vi.spyOn(httpTransport, "fetch").mockImplementation(async (input) => {
    requestedUrls.push(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    return Response.json({ data: { rows: [], total_count: 0 } });
  });
  const client = makeClient("https://dashscope-intl.aliyuncs.com");

  await client.requestJson({ path: ragEndpoint(workspaceId, RAG_PATHS.indexList), method: "GET" });

  expect(transport).toHaveBeenCalledOnce();
  expect(requestedUrls).toEqual([
    "https://ws-review.cn-beijing.maas.aliyuncs.com/api/v1/indices/rag/index/list",
  ]);
  // The request origin is now recorded even though it bypassed Client.url().
  expect(client.lastResolvedOrigin).toBe("https://ws-review.cn-beijing.maas.aliyuncs.com");
  expect(client.productSite).toBe("domestic");
  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      productSite: client.productSite,
      lastResolvedOrigin: client.lastResolvedOrigin,
      baseUrl: client.baseUrl,
      baseUrlIsDefault: client.baseUrlIsDefault,
    }),
  ).toEqual({ site: "domestic", siteReason: "product-domestic" });
});

test("an overridable plane on an international base URL stays international", async () => {
  const transport = vi.spyOn(httpTransport, "fetch").mockResolvedValue(Response.json({ data: {} }));
  const client = makeClient("https://dashscope-intl.aliyuncs.com");

  await client.requestJson({
    path: parsexEndpoint("https://ws.ap-southeast-1.maas.aliyuncs.com", "parse", "submit"),
    method: "POST",
    body: {},
  });

  expect(transport).toHaveBeenCalledOnce();
  expect(client.productSite).toBeUndefined();
  expect(client.lastResolvedOrigin).toBe("https://ws.ap-southeast-1.maas.aliyuncs.com");
  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      productSite: client.productSite,
      lastResolvedOrigin: client.lastResolvedOrigin,
      baseUrl: client.baseUrl,
      baseUrlIsDefault: client.baseUrlIsDefault,
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });
});

test("a run-level record is shared with derived Clients", () => {
  const signals = createRequestSignals();
  const client = new Client({
    identity,
    settings: { telemetry: true, timeout: 30 } as Settings,
    baseUrl: "https://dashscope-intl.aliyuncs.com",
    baseUrlIsDefault: true,
    requestSignals: signals,
  });

  const derived = client.withConsoleSwitchAgent(12345678);
  derived.url("/api/v1/indices/rag/index/list", () => ragEndpoint(workspaceId, ""));

  expect(signals.origins).toEqual([`https://${workspaceId}.cn-beijing.maas.aliyuncs.com`]);
  expect(signals.planes.map((plane) => plane.key)).toEqual(["rag-workspace"]);
  expect(client.productSite).toBe("domestic");
  expect(derived.productSite).toBe("domestic");
  // The outer Client — the one the telemetry stage reads — sees the request the
  // derived Client made instead of falling back to the shared base URL.
  expect(client.lastResolvedOrigin).toBe(`https://${workspaceId}.cn-beijing.maas.aliyuncs.com`);
});
