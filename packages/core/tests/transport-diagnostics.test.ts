import { writeFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { validateConsoleAccessToken } from "../src/auth/refresh-token.ts";
import { Client } from "../src/client/client.ts";
import { requestJson, type HttpDeps } from "../src/client/http.ts";
import { createInstrumentedFetch } from "../src/client/instrumented-fetch.ts";
import { McpClient } from "../src/client/mcp.ts";
import { httpTransport } from "../src/client/transport.ts";
import { buildSettings, buildSources } from "../src/config/loader.ts";
import { getConfigPath } from "../src/config/paths.ts";
import type { OutputMessage } from "../src/types/output.ts";
import { withIsolatedHome } from "./helpers/isolation.ts";

const secret = "test-only-sensitive-content";
const endpoint = `https://user:${secret}@dashscope.aliyuncs.com/api/v1/test?key=${secret}#${secret}`;
const deps: HttpDeps = {
  identity: {
    binName: "bl",
    clientName: "bailian-cli",
    version: "0.0.0-test",
    npmPackage: "bailian-cli",
  },
  settings: buildSettings({ flags: { verbose: true }, file: {}, env: {} }),
};

afterEach(() => vi.restoreAllMocks());

test.each(["requestJson", "instrumented fetch", "OpenAPI", "MCP", "console validation"])(
  "%s uses callback diagnostics without printing or exposing credentials and bodies",
  async (transport) => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const diagnostics: OutputMessage[] = [];
    const debug: HttpDeps["debug"] = (diagnostic) => diagnostics.push(diagnostic);
    vi.spyOn(httpTransport, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            Success: true,
            data: { success: true, sensitive: secret },
            jsonrpc: "2.0",
            id: 1,
            result: { sensitive: secret },
          }),
          { status: 200, headers: { "x-request-id": "test-request-id" } },
        ),
    );

    if (transport === "requestJson") {
      await requestJson(
        { ...deps, debug },
        {
          url: endpoint,
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
          body: { sensitive: secret },
        },
      );
    } else if (transport === "instrumented fetch") {
      await createInstrumentedFetch({ ...deps, debug })(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ sensitive: secret }),
      });
    } else if (transport === "OpenAPI") {
      const client = new Client({
        ...deps,
        debug,
        baseUrl: "https://dashscope.aliyuncs.com",
        openApiCred: { accessKeyId: secret, accessKeySecret: secret, source: "flag" },
      });
      await client.openApiJson({
        host: "modelstudio.cn-beijing.aliyuncs.com",
        path: "/modelstudio/test",
        action: "Test",
        version: "2026-02-10",
        method: "POST",
        queryParams: { key: secret },
        body: { sensitive: secret },
      });
    } else if (transport === "MCP") {
      await new McpClient({ ...deps, debug }, endpoint, secret).initialize();
    } else {
      await validateConsoleAccessToken(
        { region: "cn-beijing", site: "domestic", token: secret },
        deps.settings,
        { debug },
      );
    }

    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ details: expect.objectContaining({ method: "POST" }) }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        details: expect.objectContaining({ status: 200, request_id: "test-request-id" }),
      }),
    );
    expect(JSON.stringify(diagnostics)).not.toContain(secret);
  },
);

test("corrupted config reports one callback warning and no terminal output", async () => {
  await withIsolatedHome(async () => {
    writeFileSync(getConfigPath(), "{broken");
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const warnings = vi.fn();
    const sources = buildSources({}, warnings);
    expect(sources.file).toEqual({});
    expect(warnings).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveBeenCalledWith(expect.objectContaining({ code: "CONFIG_CORRUPTED" }));
    expect(stderr).not.toHaveBeenCalled();
  });
});
