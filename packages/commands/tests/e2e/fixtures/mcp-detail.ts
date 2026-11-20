import { createServer } from "node:http";
import { afterAll, beforeAll } from "vite-plus/test";

/** Read-only detail endpoint shared by the native Agent subprocess smoke tests. */
export function activeMcpFixture(code: string) {
  const endpoint = `https://workspace.fixture.example/api/v1/mcps/${code}/mcp`;
  const fixture = { baseUrl: "", endpoint };
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== `/api/v1/mcp/servers/${code}`) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: {
          mcp_code: code,
          type: "OFFICIAL",
          server_status: "ACTIVATED",
          dashscope_endpoint: endpoint,
        },
      }),
    );
  });
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP port");
    fixture.baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return fixture;
}
