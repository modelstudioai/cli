import { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { apply, type Config } from "../src/index.js";

vi.mock("../src/bl-cli.js", () => ({ readBlCliConfig: () => ({}) }));
vi.mock("../src/skill.js", () => ({ registerSkill: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it("guards the route and saves a verified pair without echoing secrets", async () => {
  const root = new Context();
  const values: Record<string, unknown> = { configInitialized: true, workspaceId: "old-workspace" };
  const config = Object.fromEntries(
    [
      "workspaceId",
      "configInitialized",
      "defaultRetrieveAgentId",
      "defaultChatAgentId",
      "agentVersion",
      "chatTimeoutMs",
    ].map((field) => [field, { get: () => values[field] }]),
  ) as unknown as Config;
  let key = "old-key";
  let rejected: 403 | undefined = 403;
  const routes = new Map<
    string,
    (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  >();
  const update = vi.fn(async (_namespace: string, patch: object) => {
    Object.assign(values, patch);
  });
  root.provide("settings", { configure: () => () => undefined, update });
  root.provide("credentials", {
    resolve: async (reference: string) => {
      expect(reference).toBe("BAILIAN_KB_API_KEY");
      return { value: key };
    },
    set: async (reference: string, value: string) => {
      expect(reference).toBe("BAILIAN_KB_API_KEY");
      key = value;
    },
    unset: vi.fn(),
    describe: async () => ({ configured: true, writable: true }),
  });
  root.provide("tools", { register: vi.fn() });
  root.provide("connection", { requestRejection: () => rejected });
  root.provide("webServer", {
    register: (route: {
      path: string;
      handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
    }) => {
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    },
  });
  const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toContain("new-workspace.cn-beijing.maas.aliyuncs.com");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer new-key");
    expect(key).toBe("old-key");
    expect(values.workspaceId).toBe("old-workspace");
    return Response.json({ data: { rows: [] } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const plugin = root.plugin((ctx) => apply(ctx, config));
  async function request(body: string) {
    let result = "";
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: (value?: string) => {
        result = value ?? "";
      },
    };
    const req = Object.assign(Readable.from([Buffer.from(body)]), { method: "POST", headers: {} });
    await routes.get("/bailian-kb/credentials")!(
      req as IncomingMessage,
      response as unknown as ServerResponse,
    );
    return { status: response.statusCode, body: result };
  }
  try {
    await plugin.await();
    await vi.waitFor(() => expect(routes.has("/bailian-kb/credentials")).toBe(true));
    const forbidden = await request('{"apiKey":"new-key","workspaceId":"new-workspace"}');
    expect(forbidden.status).toBe(403);
    expect(JSON.parse(forbidden.body).error).toContain("dsh rejected");
    expect(fetchMock).not.toHaveBeenCalled();
    rejected = undefined;
    const result = await request('{"apiKey":"new-key","workspaceId":"new-workspace"}');
    expect(result).toEqual({ status: 200, body: '{"saved":true}' });
    expect(key).toBe("new-key");
    expect(values.workspaceId).toBe("new-workspace");
    expect(update).toHaveBeenCalledWith("tool-bailian-kb", { workspaceId: "new-workspace" });
    const malformed = await request("new-key");
    expect(malformed.status).toBe(400);
    expect(malformed.body).not.toContain("new-key");
  } finally {
    await plugin.dispose();
  }
});
