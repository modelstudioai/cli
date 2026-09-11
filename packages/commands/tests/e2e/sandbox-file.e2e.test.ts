import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "./helpers.ts";
import { SANDBOX_ROUTES } from "./topic-routes.ts";

const directories: string[] = [];
const servers: Server[] = [];
const FILE_PATH = "/api/v1/agentstudio/files";
const UPLOAD_COMMAND = ["sandbox", "file", "upload"];
const RESPONSE = {
  id: "file_sandbox_test",
  filename: "config.json",
  type: "file",
  status: "available",
  mime_type: "application/json",
  size_bytes: 12,
  requestId: "request-test",
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function setup(config: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "bl-sandbox-file-"));
  directories.push(directory);
  writeFileSync(join(directory, "config.json"), JSON.stringify(config));
  return {
    directory,
    env: {
      BAILIAN_CONFIG_DIR: directory,
      DASHSCOPE_API_KEY: "",
      DASHSCOPE_BASE_URL: "",
      BAILIAN_WORKSPACE_ID: "",
    },
  };
}

async function gateway(responseBody: unknown = RESPONSE, status = 200) {
  const received: {
    method?: string;
    path?: string;
    headers: IncomingHttpHeaders;
    body: Buffer;
  }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(responseBody));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
  return { origin: `http://127.0.0.1:${address.port}`, received };
}

describe("e2e: Sandbox template file upload", () => {
  test("help documents upload auth, source, mount mapping, and the runtime boundary", async () => {
    const result = await runCommandHelp(SANDBOX_ROUTES, [...UPLOAD_COMMAND, "--help"]);
    expect(result.exitCode).toBe(0);
    for (const text of [
      "bl sandbox file upload",
      "--path",
      "--filename",
      "--mime-type",
      "--base-url",
      "--workspace-id",
      "source=sandbox_template",
      FILE_PATH,
      "mntConfig[].originFileId",
      "status=checking",
      "running instance",
    ]) {
      expect(result.stderr).toContain(text);
    }
    expect(result.stderr).not.toContain("--console-site");
    expect(result.stderr).not.toContain("--yes");
  });

  test("requires --path and does not expose a source override", async () => {
    const { env } = setup();
    for (const args of [[], ["--path", "unused", "--source", "other"]]) {
      const result = await runCommandE2e(
        SANDBOX_ROUTES,
        [...UPLOAD_COMMAND, ...args, "--output", "json"],
        env,
      );
      expect(result.exitCode).toBe(2);
    }
  });

  test.each(["flag", "env", "profile", "workspace"])(
    "%s determines the upload origin; dry-run does not read the local file or need credentials",
    async (source) => {
      const selectedOrigin = `https://${source}.example.test:8443`;
      const { directory, env } = setup(
        source === "profile"
          ? { active_config: "sandbox", sandbox: { base_url: selectedOrigin } }
          : {},
      );
      const path = join(directory, "does-not-exist.json");
      const args =
        source === "flag"
          ? ["--base-url", `${selectedOrigin}/api/v1/agentstudio/sandbox?ignored=1#fragment`]
          : source === "workspace"
            ? ["--workspace-id", "ws-files"]
            : [];
      const result = await runCommandE2e(
        SANDBOX_ROUTES,
        [...UPLOAD_COMMAND, "--path", path, ...args, "--dry-run", "--output", "json"],
        { ...env, DASHSCOPE_BASE_URL: source === "env" ? selectedOrigin : "" },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toEqual({
        method: "POST",
        endpoint:
          (source === "workspace"
            ? "https://ws-files.cn-beijing.maas.aliyuncs.com"
            : selectedOrigin) + FILE_PATH,
        request: {
          source: "sandbox_template",
          file: { path, filename: "does-not-exist.json", mimeType: "application/octet-stream" },
        },
      });
    },
  );

  test("uploads exact multipart bytes and source with saved Bearer credentials, then reuses the ID in a template mount", async () => {
    const { origin, received } = await gateway();
    const { directory, env } = setup({
      active_config: "sandbox",
      sandbox: { api_key: "sk-upload-test-only", base_url: origin },
    });
    const path = join(directory, "local data.bin");
    const content = Buffer.from([0, 1, 255, 13, 10, 65]);
    writeFileSync(path, content);
    const result = await runCommandE2e(
      SANDBOX_ROUTES,
      [
        ...UPLOAD_COMMAND,
        "--path",
        path,
        "--filename",
        "config.json",
        "--mime-type",
        "application/json",
        "--output",
        "json",
        "--verbose",
      ],
      env,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toEqual(RESPONSE);
    expect(result.stdout + result.stderr).not.toContain("sk-upload-test-only");
    expect(received).toHaveLength(1);
    const request = received[0];
    expect(request.method).toBe("POST");
    expect(request.path).toBe(FILE_PATH);
    expect(request.headers.authorization).toBe("Bearer sk-upload-test-only");
    expect(request.headers["x-api-key"]).toBeUndefined();
    expect(request.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    const form = await new Request(`${origin}${FILE_PATH}`, {
      method: "POST",
      headers: { "content-type": request.headers["content-type"]! },
      body: new Uint8Array(request.body),
    }).formData();
    expect([...form.keys()].sort()).toEqual(["file", "source"]);
    expect(form.get("source")).toBe("sandbox_template");
    const file = form.get("file");
    if (!file || typeof file === "string") throw new Error("Expected a multipart file.");
    expect(file.name).toBe("config.json");
    expect(file.type).toBe("application/json");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(content);

    const mount = {
      originFileId: RESPONSE.id,
      originFileName: RESPONSE.filename,
      mountPath: "/home/user/config.json",
    };
    const template = await runCommandE2e(
      SANDBOX_ROUTES,
      [
        "sandbox",
        "template",
        "create",
        "--name",
        "files",
        "--cpu-count",
        "1",
        "--memory-mb",
        "2048",
        "--body",
        JSON.stringify({ mntConfig: [mount] }),
        "--dry-run",
        "--output",
        "json",
      ],
      env,
    );
    expect(template.exitCode, template.stderr).toBe(0);
    expect(parseStdoutJson(template.stdout)).toMatchObject({ request: { mntConfig: [mount] } });
    expect(received).toHaveLength(1);
  });

  test.each(["json", "text", "quiet"])(
    "%s output returns checking status or the bare ID without polling or creating a template",
    async (output) => {
      const pending = { ...RESPONSE, status: "checking" };
      const { origin, received } = await gateway(pending);
      const { directory, env } = setup({ api_key: "sk-upload-test-only", base_url: origin });
      const path = join(directory, "notes.txt");
      writeFileSync(path, "Only synthetic test data.");
      const result = await runCommandE2e(
        SANDBOX_ROUTES,
        [
          ...UPLOAD_COMMAND,
          "--path",
          path,
          ...(output === "quiet" ? ["--quiet"] : ["--output", output]),
        ],
        env,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      if (output === "quiet") expect(result.stdout.trim()).toBe(RESPONSE.id);
      else {
        expect(result.stdout).toContain("checking");
        expect(result.stdout).toContain(RESPONSE.id);
      }
      expect(received).toHaveLength(1);
    },
  );

  test("missing files fail locally without an upload request", async () => {
    const { origin, received } = await gateway();
    const { directory, env } = setup({ api_key: "sk-upload-test-only", base_url: origin });
    const result = await runCommandE2e(
      SANDBOX_ROUTES,
      [...UPLOAD_COMMAND, "--path", join(directory, "missing.txt"), "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ENOENT");
    expect(received).toHaveLength(0);
  });

  test("server errors are passed through without translating them", async () => {
    const { origin, received } = await gateway(
      { code: "InvalidSource", message: "source rejected by server", request_id: "req-error" },
      400,
    );
    const { directory, env } = setup({ api_key: "sk-upload-test-only", base_url: origin });
    const path = join(directory, "notes.txt");
    writeFileSync(path, "test");
    const result = await runCommandE2e(
      SANDBOX_ROUTES,
      [...UPLOAD_COMMAND, "--path", path, "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        message: "source rejected by server",
        http_status: 400,
        api_code: "InvalidSource",
        request_id: "req-error",
      },
    });
    expect(received).toHaveLength(1);
  });

  test("a response without an ID is not reported as a successful upload", async () => {
    const { origin } = await gateway({ status: "checking" });
    const { directory, env } = setup({ api_key: "sk-upload-test-only", base_url: origin });
    const path = join(directory, "notes.txt");
    writeFileSync(path, "test");
    const result = await runCommandE2e(
      SANDBOX_ROUTES,
      [...UPLOAD_COMMAND, "--path", path, "--quiet", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("File ID");
  });
});
