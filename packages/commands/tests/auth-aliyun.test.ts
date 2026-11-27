import http from "node:http";
import { PassThrough } from "node:stream";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  ALIYUN_CLI_CLIENT_ID,
  ALIYUN_CLI_SCOPE,
  ALIYUN_OAUTH_BASE_URL,
  PRE_ALIYUN_OAUTH_BASE_URL,
  PRE_MODEL_STUDIO_HOST,
  PRE_BAILIAN_CONTROL_HOST,
  BailianError,
  ExitCode,
  buildSettings,
  consoleCredentialKey,
  httpTransport,
  type AliyunOAuthProfile,
  type AliyunOAuthSession,
  type Identity,
  type LocalizedText,
  type PreControlPlane,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { buildIsolatedCliEnv, enterIsolatedHome, type IsolatedHomeHandle } from "e2e/isolation";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vite-plus/test";
import authRoot, {
  runAliyunOAuthLogin,
  type AliyunOAuthLoginDeps,
  type AliyunOAuthLoginOptions,
} from "../src/commands/auth/aliyun.ts";

// Direct module tests: no CLI or browser child process, actual loopback GET, mocked remote transport.
const ENDPOINTS = {
  authorizationUrl: "https://authorize.oauth-test.example/authorize?channel=cli",
  oauthBaseUrl: "https://tokens.oauth-test.example",
  modelstudioHost: "pop.oauth-test.example",
  consoleGateway: "https://console.oauth-test.example",
  bailiancontrolHost: "control.oauth-test.example",
};
const DEFAULT_ENDPOINTS = {
  modelstudioHost: "modelstudio.cn-beijing.aliyuncs.com",
  consoleGateway: "https://bailian-cs.console.aliyun.com",
};
const PRE_CONSOLE_GATEWAY = "https://pre-bailian-cs.console.aliyun.com";
const SECRETS = {
  code: "test-authorization-code-secret",
  accessToken: "test-oauth-access-token-secret",
  refreshToken: "test-oauth-refresh-token-secret",
  accessKeyId: "test-sts-access-key-id-secret",
  accessKeySecret: "test-sts-access-key-secret-secret",
  securityToken: "test-sts-security-token-secret",
  cliAccessToken: "test-cli-access-token-secret",
};
const STAGES = ["token", "sts", "generate", "gateway"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_PATHS: Record<Stage, string> = {
  token: "/v1/token",
  sts: "/v1/exchange",
  generate: "/modelstudio/cli/generateAccessToken",
  gateway: "/cli/api.json",
};
interface RecordedRequest {
  url: URL;
  init: RequestInit;
}
let isolation: IsolatedHomeHandle;
let requests: RecordedRequest[];
let failStage: Stage | undefined;
let pauseStage:
  | { stage: Stage; hold: (signal: RequestInit["signal"]) => Promise<Response> }
  | undefined;
let revokeFails: boolean;
let stsExpiresAt: number;
let accessTokenIssuedAt: number;
let activeProbes: { controller: AbortController; outcome: Promise<unknown> }[];
let fetchMock: MockInstance<typeof httpTransport.fetch>;
let unexpectedStdout: MockInstance<typeof process.stdout.write>;
let unexpectedStderr: MockInstance<typeof process.stderr.write>;

function deferred<Value>() {
  let resolveValue!: (value: Value) => void;
  const promise = new Promise<Value>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}

function stringBody(body: RequestInit["body"]): string {
  if (typeof body !== "string") throw new Error("Expected a string request body");
  return body;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  isolation = enterIsolatedHome();
  requests = [];
  activeProbes = [];
  failStage = undefined;
  pauseStage = undefined;
  revokeFails = false;
  stsExpiresAt = Date.now() + 3600_000;
  accessTokenIssuedAt = 0;
  // Injected writers own module output; accidental global writes are a regression.
  unexpectedStdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  unexpectedStderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  fetchMock = vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push({ url, init });
    const isOAuth =
      [ENDPOINTS.oauthBaseUrl, PRE_ALIYUN_OAUTH_BASE_URL].includes(url.origin) && !url.search;
    if (isOAuth && url.pathname === "/v1/revoke") {
      return new Response(null, { status: revokeFails ? 503 : 200 });
    }
    let stage: Stage;
    if (isOAuth && url.pathname === "/v1/token") stage = "token";
    else if (isOAuth && url.pathname === "/v1/exchange") stage = "sts";
    else if (
      [ENDPOINTS.modelstudioHost, DEFAULT_ENDPOINTS.modelstudioHost, PRE_MODEL_STUDIO_HOST].some(
        (hostname) => url.href === `https://${hostname}/modelstudio/cli/generateAccessToken`,
      )
    )
      stage = "generate";
    else if (
      [ENDPOINTS.consoleGateway, DEFAULT_ENDPOINTS.consoleGateway, PRE_CONSOLE_GATEWAY].includes(
        url.origin,
      ) &&
      url.pathname === "/cli/api.json"
    )
      stage = "gateway";
    else throw new Error(`Unexpected mocked endpoint: ${url.origin}${url.pathname}`);
    if (pauseStage?.stage === stage) return pauseStage.hold(init.signal);
    if (stage === failStage) {
      if (stage === "gateway")
        return jsonResponse({
          data: {
            success: false,
            errorCode: "ValidationDenied",
            errorMsg: `Denied ${SECRETS.cliAccessToken}`,
            requestId: "mock-request-id",
          },
        });
      const tokenForm = stage === "token" ? new URLSearchParams(stringBody(init.body)) : undefined;
      const echoedSecrets = tokenForm
        ? `${tokenForm.get("code")} ${tokenForm.get("code_verifier")}`
        : stage === "sts"
          ? SECRETS.accessToken
          : `${SECRETS.accessKeyId} ${SECRETS.accessKeySecret} ${SECRETS.securityToken}`;
      return jsonResponse(
        { Success: false, Code: "MockDenied", Message: `Denied ${echoedSecrets}` },
        403,
      );
    }
    switch (stage) {
      case "token":
        accessTokenIssuedAt = Date.now();
        return jsonResponse({
          access_token: SECRETS.accessToken,
          refresh_token: SECRETS.refreshToken,
          expires_in: 1800,
          token_type: "Bearer",
          scope: ALIYUN_CLI_SCOPE,
        });
      case "sts":
        return jsonResponse({
          AccessKeyId: SECRETS.accessKeyId,
          AccessKeySecret: SECRETS.accessKeySecret,
          SecurityToken: SECRETS.securityToken,
          Expiration: new Date(stsExpiresAt).toISOString(),
        });
      case "generate":
        return jsonResponse({ cliAccessToken: SECRETS.cliAccessToken });
      case "gateway":
        return jsonResponse({ data: { success: true } });
    }
  });
});

afterEach(async () => {
  for (const probe of activeProbes) probe.controller.abort();
  await Promise.all(activeProbes.map((probe) => probe.outcome));
  try {
    expect(unexpectedStdout).not.toHaveBeenCalled();
    expect(unexpectedStderr).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    isolation.restore();
  }
});

function localizer(language: "en-US" | "zh-CN") {
  return (text: LocalizedText) => (typeof text === "string" ? text : text[language]);
}

function launch(
  options: AliyunOAuthLoginOptions = {},
  settingsOptions: {
    dryRun?: boolean;
    output?: "text" | "json";
    language?: "en-US" | "zh-CN";
    previous?: AliyunOAuthProfile;
    quiet?: boolean;
    verbose?: boolean;
    omitEndpoints?: boolean;
    preControlPlane?: PreControlPlane;
    stdin?: AliyunOAuthLoginDeps["stdin"];
  } = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const settings = {
    ...buildSettings({
      flags: {
        output: settingsOptions.output ?? "json",
        dryRun: !!settingsOptions.dryRun,
        quiet: !!settingsOptions.quiet,
        verbose: !!settingsOptions.verbose,
      },
      file: {},
      env: {},
      preControlPlane: settingsOptions.preControlPlane,
    }),
    configName: "oauth-test",
  };
  const localize = localizer(settingsOptions.language ?? "en-US");
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
  });
  const describe = vi.fn(() =>
    settingsOptions.previous ? { aliyunOAuth: settingsOptions.previous } : {},
  );
  const save = vi
    .fn<
      (
        profile: Omit<AliyunOAuthProfile, "session_ref">,
        session: AliyunOAuthSession,
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined);
  const controller = new AbortController();
  const url = deferred<string>();
  const browser = vi.fn<(authUrl: string) => void | Promise<void>>().mockResolvedValue(undefined);
  const deps: AliyunOAuthLoginDeps = {
    identity: {
      binName: "bl",
      version: "test",
      clientName: "oauth-test",
      npmPackage: "bailian-cli",
    } as Identity,
    settings,
    localize,
    output: reporter.output,
    writeStderr: (text) => {
      stderr.push(text);
    },
    authStore: { describe, loginAliyun: save },
    onAuthUrl: url.resolve,
    openBrowser: browser,
    stdin: settingsOptions.stdin,
  };
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const resolvedOptions = {
    ...(settingsOptions.preControlPlane ? {} : { clientId: ALIYUN_CLI_CLIENT_ID }),
    ...(settingsOptions.omitEndpoints ? {} : ENDPOINTS),
    callbackTimeoutMs: 1000,
    ...options,
    signal,
  };
  const signalCounts = {
    SIGINT: process.listenerCount("SIGINT"),
    SIGTERM: process.listenerCount("SIGTERM"),
  };
  const outcome = runAliyunOAuthLogin(deps, resolvedOptions).then(
    () => undefined,
    (error: unknown) => error,
  );
  const probe = {
    deps,
    options: resolvedOptions,
    controller,
    browser,
    save,
    describe,
    reporter,
    stdout,
    stderr,
    authUrl: url.promise,
    outcome,
    signalCounts,
  };
  activeProbes.push(probe);
  return probe;
}

function callbackUrl(
  authUrl: string,
  params: Record<string, string> = { code: SECRETS.code },
): URL {
  const authorization = new URL(authUrl);
  const redirectUri = authorization.searchParams.get("redirect_uri");
  if (!redirectUri) throw new Error("Missing redirect_uri");
  const callback = new URL(redirectUri);
  callback.searchParams.set("state", authorization.searchParams.get("state")!);
  for (const [name, value] of Object.entries(params)) callback.searchParams.set(name, value);
  return callback;
}

function localRequest(
  url: URL,
  method = "GET",
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  if (url.hostname !== "127.0.0.1" || url.protocol !== "http:")
    throw new Error("Only actual loopback callbacks are allowed");
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: Number(url.port),
        path: url.pathname + url.search,
        method,
        agent: false,
        headers: { Connection: "close" },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
}

function assertNoSecrets(probe: ReturnType<typeof launch>, extra: string[] = []) {
  const output = [...probe.stdout, ...probe.stderr].join("");
  for (const secret of [...Object.values(SECRETS), ...extra]) expect(output).not.toContain(secret);
}

function assertSignalCleanup(probe: ReturnType<typeof launch>) {
  expect(process.listenerCount("SIGINT")).toBe(probe.signalCounts.SIGINT);
  expect(process.listenerCount("SIGTERM")).toBe(probe.signalCounts.SIGTERM);
}

async function finish(probe: ReturnType<typeof launch>) {
  const authUrl = await probe.authUrl;
  const callback = callbackUrl(authUrl);
  const result = await localRequest(callback);
  expect(result.status).toBe(200);
  const error = await probe.outcome;
  if (error !== undefined) throw error;
  return { authUrl, callback, result };
}

test("根命令声明必填 aliyun 登录方式与双语 flags，不改变旧登录命令", () => {
  expect(authRoot.auth).toBe("none");
  expect(authRoot.flags!.login).toMatchObject({
    type: "string",
    required: true,
    choices: ["aliyun"],
  });
  expect(authRoot.flags!.consoleRegion).toMatchObject({ choices: ["cn-beijing"] });
  for (const definition of Object.values(authRoot.flags!))
    expect(definition.description).toEqual({
      "en-US": expect.any(String),
      "zh-CN": expect.any(String),
    });
  expect(authRoot.flags!).not.toHaveProperty("device");
  expect(authRoot.flags!).not.toHaveProperty("tokenStdin");
});

test("完整 OAuth→STS→显式 POP→显式网关→保存链路使用 PKCE、随机 loopback 端口且不猜 Console TTL", async () => {
  const listen = vi.spyOn(http.Server.prototype, "listen");
  const createServer = vi.spyOn(http, "createServer");
  const probe = launch({}, { quiet: true, verbose: true });
  const { authUrl, callback, result } = await finish(probe);
  expect(listen).toHaveBeenCalledWith(
    { port: 0, host: "127.0.0.1", exclusive: true },
    expect.any(Function),
  );
  expect(Number(callback.port)).toBeGreaterThan(0);
  expect(callback.pathname).toBe("/oauth/callback");
  expect(new URL(authUrl).origin).toBe(new URL(ENDPOINTS.authorizationUrl).origin);
  const query = new URL(authUrl).searchParams;
  expect(query.get("response_type")).toBe("code");
  expect(query.get("client_id")).toBe(ALIYUN_CLI_CLIENT_ID);
  expect(query.get("scope")).toBe(ALIYUN_CLI_SCOPE);
  expect(query.get("channel")).toBe("cli");
  expect(query.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  expect(query.get("code_challenge_method")).toBe("S256");
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.headers["referrer-policy"]).toBe("no-referrer");
  expect(result.body).not.toContain(SECRETS.code);
  expect(requests.map((request) => request.url.pathname)).toEqual([
    "/v1/token",
    "/v1/exchange",
    "/modelstudio/cli/generateAccessToken",
    "/cli/api.json",
  ]);
  for (const request of requests) expect(request.init.method).toBe("POST");
  const token = requests[0]!;
  expect(new Headers(token.init.headers).get("content-type")).toBe(
    "application/x-www-form-urlencoded",
  );
  expect(token.init.redirect).toBe("error");
  const form = new URLSearchParams(stringBody(token.init.body));
  const verifier = form.get("code_verifier")!;
  expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  expect(query.get("code_challenge")).toBe(
    createHash("sha256").update(verifier, "ascii").digest("base64url"),
  );
  expect(Object.fromEntries(form)).toEqual({
    grant_type: "authorization_code",
    client_id: ALIYUN_CLI_CLIENT_ID,
    code: SECRETS.code,
    redirect_uri: `http://127.0.0.1:${callback.port}/oauth/callback`,
    code_verifier: verifier,
  });
  const exchange = requests[1]!;
  expect(new Headers(exchange.init.headers).get("authorization")).toBe(
    `Bearer ${SECRETS.accessToken}`,
  );
  expect(exchange.init.body).toBeUndefined();
  expect(exchange.init.redirect).toBe("error");
  const generate = requests[2]!;
  const generateHeaders = new Headers(generate.init.headers);
  expect(generate.url.host).toBe(ENDPOINTS.modelstudioHost);
  expect(generateHeaders.get("x-acs-action")).toBe("GenerateCLIAccessToken");
  expect(generateHeaders.get("x-acs-version")).toBe("2026-02-10");
  expect(generateHeaders.get("x-acs-security-token")).toBe(SECRETS.securityToken);
  expect(generateHeaders.get("authorization")).toContain(`Credential=${SECRETS.accessKeyId}`);
  expect(generateHeaders.get("authorization")).not.toContain(SECRETS.accessKeySecret);
  expect(generate.init.body).toBeUndefined();
  const gateway = requests[3]!;
  expect(gateway.url.origin).toBe(ENDPOINTS.consoleGateway);
  expect(gateway.url.searchParams.get("api")).toBe(
    "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
  );
  expect(gateway.url.searchParams.get("product")).toBe("sfm_bailian");
  expect(gateway.url.searchParams.get("action")).toBe("BroadScopeAspnGateway");
  expect(gateway.init.redirect).toBe("error");
  expect(new Headers(gateway.init.headers).get("authorization")).toBe(
    `Bearer ${SECRETS.cliAccessToken}`,
  );
  const gatewayForm = new URLSearchParams(stringBody(gateway.init.body));
  expect(gatewayForm.get("region")).toBe("cn-beijing");
  expect(JSON.parse(gatewayForm.get("params")!)).toEqual({
    Api: "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
    V: "1.0",
    Data: {
      cornerstoneParam: {
        protocol: "V2",
        console: "ONE_CONSOLE",
        productCode: "p_efm",
        switchUserType: 3,
        consoleSite: "BAILIAN_ALIYUN",
      },
    },
  });
  expect(probe.save).toHaveBeenCalledTimes(1);
  const [profile, session] = probe.save.mock.calls[0]!;
  expect(profile).toEqual({
    client_id: ALIYUN_CLI_CLIENT_ID,
    scope: ALIYUN_CLI_SCOPE,
    authorization_url: ENDPOINTS.authorizationUrl,
    oauth_base_url: ENDPOINTS.oauthBaseUrl,
    modelstudio_host: ENDPOINTS.modelstudioHost,
    bailiancontrol_host: ENDPOINTS.bailiancontrolHost,
    console_gateway: ENDPOINTS.consoleGateway,
    console_region: "cn-beijing",
    console_enabled: true,
    openapi_enabled: true,
    access_token_expires_at: session.accessTokenExpiresAt,
    sts_expires_at: stsExpiresAt,
  });
  expect(session.accessToken).toBe(SECRETS.accessToken);
  expect(session.refreshToken).toBe(SECRETS.refreshToken);
  expect(session.accessTokenExpiresAt).toBeGreaterThanOrEqual(accessTokenIssuedAt + 1800_000);
  expect(session.accessTokenExpiresAt).toBeLessThanOrEqual(Date.now() + 1800_000);
  expect(session.sts).toEqual({
    accessKeyId: SECRETS.accessKeyId,
    accessKeySecret: SECRETS.accessKeySecret,
    securityToken: SECRETS.securityToken,
    expiresAt: stsExpiresAt,
  });
  expect(session.consoleTokens).toEqual({
    [consoleCredentialKey({
      region: "cn-beijing",
      site: "domestic",
      gateway: ENDPOINTS.consoleGateway,
    })]: { token: SECRETS.cliAccessToken },
  });
  expect(JSON.parse(probe.stdout.join(""))).toEqual({
    authenticated: true,
    method: "aliyun",
    config: "oauth-test",
    console: true,
    openapi: true,
  });
  expect(probe.stderr).toHaveLength(1);
  expect(JSON.parse(probe.stderr[0]!)).toEqual({
    warning: { message: expect.stringContaining(authUrl) },
  });
  expect(probe.stderr[0]).toContain("Waiting for the local OAuth callback");
  assertNoSecrets(probe, [verifier]);
  assertSignalCleanup(probe);
  expect(createServer.mock.results[0]!.value.address()).toBeNull();
  await expect(localRequest(callback)).rejects.toMatchObject({ code: "ECONNREFUSED" });
});

test.each(["text", "json"] as const)(
  "双语成功结果仅含安全状态，登录链接写入对应格式的 stderr (%s)",
  async (output) => {
    const probe = launch({}, { output, language: "zh-CN", quiet: true });
    const { authUrl } = await finish(probe);
    const prompt = `请在本机浏览器中打开以下登录地址：\n${authUrl}\n正在等待本机 OAuth 回调。按 Ctrl+C 取消。`;
    expect(probe.stderr).toHaveLength(1);
    if (output === "text") {
      expect(probe.stderr[0]).toBe(`${prompt}\n`);
      expect(probe.stdout.join("")).toBe(
        "阿里云 OAuth 登录成功（配置：oauth-test；console：true；openapi：true）。\n",
      );
    } else {
      expect(JSON.parse(probe.stderr[0]!)).toEqual({ warning: { message: prompt } });
      expect(JSON.parse(probe.stdout.join("")).authenticated).toBe(true);
    }
    assertNoSecrets(probe);
  },
);

test.each(["en-US", "zh-CN"] as const)(
  "无浏览器模式在其它设备授权后粘回 URL，复用 PKCE 和四段换票且不监听端口 (%s)",
  async (language) => {
    const input = new PassThrough();
    const listen = vi.spyOn(http.Server.prototype, "listen");
    const createServer = vi.spyOn(http, "createServer");
    const probe = launch({ noBrowser: true }, { stdin: input, language });
    const authUrl = await probe.authUrl;
    const callback = callbackUrl(authUrl);
    expect(callback.origin + callback.pathname).toBe("http://127.0.0.1:12345/oauth/callback");
    expect(listen).not.toHaveBeenCalled();
    expect(createServer).not.toHaveBeenCalled();
    expect(probe.browser).not.toHaveBeenCalled();
    input.end(callback.href);
    expect(await probe.outcome).toBeUndefined();
    const form = new URLSearchParams(stringBody(requests[0]!.init.body));
    expect(form.get("redirect_uri")).toBe(callback.origin + callback.pathname);
    expect(form.get("code")).toBe(SECRETS.code);
    expect(new URL(authUrl).searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(form.get("code_verifier")!, "ascii").digest("base64url"),
    );
    expect(requests.map((request) => request.url.pathname)).toEqual(Object.values(STAGE_PATHS));
    expect(probe.save).toHaveBeenCalledTimes(1);
    expect(probe.stderr.map((line) => JSON.parse(line))).toEqual([
      { warning: { message: expect.stringContaining("ssh -t") } },
      { warning: { message: expect.stringContaining(authUrl) } },
      { warning: { message: expect.stringMatching(/Callback URL|回调 URL/u) } },
    ]);
    expect(probe.stderr.join("")).toContain(
      language === "zh-CN" ? "电脑或手机浏览器" : "browser on your computer or phone",
    );
    expect(probe.stderr.join("")).toContain(language === "zh-CN" ? "可能回显" : "may echo");
    expect(probe.stderr.join("")).toContain("ssh -t");
    expect(probe.stderr.join("")).not.toMatch(
      /输入不回显|input hidden|Waiting for the local OAuth callback/u,
    );
    assertNoSecrets(probe, [callback.href, form.get("code_verifier")!]);
    assertSignalCleanup(probe);
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("error")).toBe(0);
  },
);

test("粘贴无效回调仅重试本次会话，不换票、不回显原文", async () => {
  const input = new PassThrough();
  const probe = launch({ noBrowser: true }, { stdin: input });
  const authUrl = await probe.authUrl;
  const callback = callbackUrl(authUrl);
  const invalid = [
    "",
    SECRETS.code,
    "not-a-url",
    callback.href + "#",
    ...["%ZZ", "%FF", "%C3", "%00", "%0A", "%C2%85"].map((suffix) => callback.href + suffix),
  ];
  for (const replacement of [
    "https://127.0.0.1:12345/oauth/callback",
    "http://localhost:12345/oauth/callback",
    "http://127.0.0.1:12346/oauth/callback",
    "http://127.0.0.1:12345/cli/callback",
    "http://127.0.0.1:12345/oauth/callback/",
    "http://127.0.0.1:12345/other/../oauth/callback",
    "http://user@127.0.0.1:12345/oauth/callback",
  ])
    invalid.push(callback.href.replace(callback.origin + callback.pathname, replacement));
  const wrongState = new URL(callback);
  wrongState.searchParams.set("state", "wrong-state");
  wrongState.searchParams.set("error", "access_denied");
  invalid.push(wrongState.href);
  for (const key of ["state", "code"]) {
    const absent = new URL(callback);
    absent.searchParams.delete(key);
    invalid.push(absent.href);
    const duplicate = new URL(callback);
    duplicate.searchParams.append(key, duplicate.searchParams.get(key)!);
    invalid.push(duplicate.href);
  }
  const emptyCode = new URL(callback);
  emptyCode.searchParams.set("code", " ");
  invalid.push(emptyCode.href);
  for (const answer of invalid) input.write(answer + "\n");
  expect(probe.stderr.join("").match(/Invalid OAuth callback address/g)).toHaveLength(
    invalid.length,
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
  input.end(callback.href + "\r\n");
  expect(await probe.outcome).toBeUndefined();
  expect(new URLSearchParams(stringBody(requests[0]!.init.body)).get("code")).toBe(SECRETS.code);
  assertNoSecrets(probe, [callback.href]);
});

test.each(process.platform === "win32" ? ["Ctrl+C"] : ["Ctrl+C", "Ctrl+Z"])(
  "TTY 输入不回显且 %s 取消并清理 raw mode",
  async (key) => {
    const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: vi.fn() });
    const probe = launch({ noBrowser: true }, { stdin: input });
    const callback = callbackUrl(await probe.authUrl);
    expect(probe.stderr.join("")).toContain("input hidden");
    expect(probe.stderr.join("")).not.toContain("may echo");
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    input.write(callback.href);
    expect(fetchMock).not.toHaveBeenCalled();
    input.write(key === "Ctrl+C" ? "\u0003" : "\u001a");
    expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.INTERRUPTED });
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(probe.save).not.toHaveBeenCalled();
    assertNoSecrets(probe, [callback.href]);
    assertSignalCleanup(probe);
    expect(input.listenerCount("data")).toBe(0);
    input.destroy();
  },
);

test.each(["EOF", "error", "oversize", "denied"] as const)(
  "手动回调的%s终止而不换票或保存",
  async (kind) => {
    const input = new PassThrough();
    const probe = launch({ noBrowser: true }, { stdin: input });
    const authUrl = await probe.authUrl;
    if (kind === "EOF") input.end();
    else if (kind === "error") input.emit("error", new Error(SECRETS.refreshToken));
    else if (kind === "oversize") {
      input.write("x".repeat(8192));
      input.write("x".repeat(8192));
    } else
      input.write(
        callbackUrl(authUrl, { error: "access_denied", error_description: SECRETS.refreshToken })
          .href + "\n",
      );
    const error = await probe.outcome;
    expect(error).toMatchObject({
      exitCode: kind === "oversize" ? ExitCode.USAGE : ExitCode.GENERAL,
    });
    probe.reporter.error(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(probe.save).not.toHaveBeenCalled();
    assertNoSecrets(probe);
    assertSignalCleanup(probe);
    expect(input.listenerCount("data")).toBe(0);
    input.destroy();
  },
);

test.each(["abort", "SIGINT", "SIGTERM", "timeout"] as const)(
  "等待手动回调期间%s清理输入和计时器",
  async (kind) => {
    vi.useFakeTimers();
    const input = new PassThrough();
    const probe = launch({ noBrowser: true, callbackTimeoutMs: 100 }, { stdin: input });
    await probe.authUrl;
    await vi.advanceTimersByTimeAsync(99);
    expect(fetchMock).not.toHaveBeenCalled();
    if (kind === "timeout") await vi.advanceTimersByTimeAsync(1);
    else if (kind === "abort") probe.controller.abort();
    else Reflect.apply(process.listeners(kind).at(-1)!, process, []);
    expect(await probe.outcome).toMatchObject({
      exitCode: kind === "timeout" ? ExitCode.TIMEOUT : ExitCode.INTERRUPTED,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(input.listenerCount("data")).toBe(0);
    expect(probe.save).not.toHaveBeenCalled();
    assertSignalCleanup(probe);
    input.destroy();
  },
);

// A real product invocation checks flag routing, stdin EOF and exit without a browser or network fixture.
test("产品子进程的手动登录从 stdin 读取，回调无效后遇到 EOF 退出", async () => {
  const environment = buildIsolatedCliEnv({
    overrides: {
      BAILIAN_PRE: "0",
      NODE_OPTIONS: "",
      NODE_NO_WARNINGS: "1",
      DO_NOT_TRACK: "1",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  try {
    const result = await new Promise<{
      exitCode: number | string | undefined;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          fileURLToPath(new URL("../../cli/src/main.ts", import.meta.url)),
          "auth",
          "--login",
          "aliyun",
          "--no-browser",
          "--client-id",
          "test-client",
          "--authorization-url",
          ENDPOINTS.authorizationUrl,
        ],
        { env: environment.env, encoding: "utf8", timeout: 7000, killSignal: "SIGKILL" },
        (error, stdout, stderr) => resolve({ exitCode: error?.code ?? undefined, stdout, stderr }),
      );
      child.stdin!.once("error", reject);
      child.stdin!.end(SECRETS.code + "\n");
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("your terminal may echo the callback URL");
    expect(result.stderr).not.toContain("input hidden");
    expect(result.stderr).toContain("Paste the complete callback URL");
    expect(result.stderr).toContain("Callback input closed before authorization was received");
    expect(result.stderr).not.toContain(SECRETS.code);
  } finally {
    environment.dispose();
  }
}, 10_000);

test("错误或重复 state、缺失或重复 code 均拒绝并继续等待，有效 state 的拒绝不能被错误 state 伪造", async () => {
  const probe = launch();
  const authUrl = await probe.authUrl;
  const callback = callbackUrl(authUrl);
  const malformed: URL[] = [];
  const wrongState = new URL(callback);
  wrongState.searchParams.set("state", "wrong-state");
  wrongState.searchParams.set("error", "access_denied");
  malformed.push(wrongState);
  const absentState = new URL(callback);
  absentState.searchParams.delete("state");
  malformed.push(absentState);
  const duplicateState = new URL(callback);
  duplicateState.searchParams.append("state", duplicateState.searchParams.get("state")!);
  malformed.push(duplicateState);
  const emptyCode = new URL(callback);
  emptyCode.searchParams.set("code", " ");
  malformed.push(emptyCode);
  const duplicateCode = new URL(callback);
  duplicateCode.searchParams.append("code", SECRETS.code);
  malformed.push(duplicateCode);
  for (const invalid of malformed) expect((await localRequest(invalid)).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
  expect((await localRequest(callback)).status).toBe(200);
  expect(await probe.outcome).toBeUndefined();
  expect(probe.browser).toHaveBeenCalledTimes(1);
  assertNoSecrets(probe);
});

test("回调只接受 /oauth/callback GET，拒绝 POST/OPTIONS 与其它路径而不消费登录", async () => {
  const probe = launch();
  const callback = callbackUrl(await probe.authUrl);
  for (const method of ["POST", "OPTIONS"]) {
    const result = await localRequest(callback, method);
    expect(result.status).toBe(405);
    expect(result.headers.allow).toBe("GET");
  }
  for (const pathname of ["/", "/callback", "/oauth/callback/"]) {
    const otherPath = new URL(callback);
    otherPath.pathname = pathname;
    expect((await localRequest(otherPath)).status).toBe(404);
  }
  expect(fetchMock).not.toHaveBeenCalled();
  await finish(probe);
});

test("有效 state 的 OAuth 拒绝结束失败，error_description 不回显且不请求或保存", async () => {
  const probe = launch();
  const callback = callbackUrl(await probe.authUrl, {
    error: "access_denied",
    error_description: SECRETS.refreshToken,
  });
  expect((await localRequest(callback)).status).toBe(400);
  const error = await probe.outcome;
  expect(error).toBeInstanceOf(BailianError);
  expect(error).toMatchObject({ exitCode: ExitCode.GENERAL });
  probe.reporter.error(error);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
  assertNoSecrets(probe);
  assertSignalCleanup(probe);
});

test.each(["hang", "reject", "throw"] as const)(
  "浏览器启动%s不阻止本机回调与清理",
  async (behavior) => {
    const probe = launch();
    probe.browser.mockImplementation(() => {
      if (behavior === "throw") throw new Error(SECRETS.refreshToken);
      if (behavior === "reject") return Promise.reject(new Error(SECRETS.refreshToken));
      return new Promise<void>(() => {});
    });
    await finish(probe);
    expect(probe.browser).toHaveBeenCalledTimes(1);
    if (behavior !== "hang") expect(probe.stderr.join("")).toContain("Open the URL above manually");
    assertNoSecrets(probe);
    assertSignalCleanup(probe);
  },
);

test("打开浏览器时即刻回调不会漏掉完成事件", async () => {
  const probe = launch();
  const browserCallback = deferred<number>();
  probe.browser.mockImplementation(async (authUrl) => {
    browserCallback.resolve((await localRequest(callbackUrl(authUrl))).status);
  });
  expect(await probe.outcome).toBeUndefined();
  expect(await browserCallback.promise).toBe(200);
  expect(probe.save).toHaveBeenCalledTimes(1);
});

test("真实短超时关闭服务器且不产生请求、保存或遗留信号监听器", async () => {
  const probe = launch({ callbackTimeoutMs: 20 });
  const callback = callbackUrl(await probe.authUrl);
  expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.TIMEOUT });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
  assertSignalCleanup(probe);
  await expect(localRequest(callback)).rejects.toMatchObject({ code: "ECONNREFUSED" });
});

test("受控时间推进覆盖超时边界并清除本次定时器", async () => {
  vi.useFakeTimers();
  const probe = launch({ callbackTimeoutMs: 100 });
  await probe.authUrl;
  await vi.advanceTimersByTimeAsync(99);
  expect(probe.save).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.TIMEOUT });
  expect(vi.getTimerCount()).toBe(0);
  assertSignalCleanup(probe);
});

test.each(["abort", "SIGINT", "SIGTERM"] as const)(
  "等待回调期间%s取消并清理服务器",
  async (kind) => {
    const probe = launch();
    const callback = callbackUrl(await probe.authUrl);
    if (kind === "abort") probe.controller.abort(new Error(SECRETS.accessToken));
    else {
      // Invoke only this module's new handler; never send a real OS signal to the test worker.
      const handler = process.listeners(kind).at(-1)!;
      Reflect.apply(handler, process, []);
    }
    const error = await probe.outcome;
    expect(error).toMatchObject({ exitCode: ExitCode.INTERRUPTED });
    probe.reporter.error(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(probe.save).not.toHaveBeenCalled();
    assertNoSecrets(probe);
    assertSignalCleanup(probe);
    await expect(localRequest(callback)).rejects.toMatchObject({ code: "ECONNREFUSED" });
  },
);

test("预先取消的信号在 proof/监听/浏览器/网络之前失败", async () => {
  const signal = AbortSignal.abort();
  const listen = vi.spyOn(http.Server.prototype, "listen");
  const probe = launch({ signal });
  expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.INTERRUPTED });
  expect(listen).not.toHaveBeenCalled();
  expect(probe.browser).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
  assertSignalCleanup(probe);
});

test.each(STAGES)("%s 请求在途时 Ctrl+C 中止换票，仅撤销已获得的 RT", async (stage) => {
  const started = deferred<RequestInit["signal"]>();
  const released = deferred<void>();
  const timeout = vi.spyOn(AbortSignal, "timeout");
  revokeFails = stage === "gateway";
  pauseStage = {
    stage,
    async hold(signal) {
      const onAbort = () => released.resolve(undefined);
      signal?.addEventListener("abort", onAbort, { once: true });
      started.resolve(signal);
      try {
        await released.promise;
        throw new DOMException(SECRETS.accessToken, "AbortError");
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
  const probe = launch();
  try {
    expect((await localRequest(callbackUrl(await probe.authUrl))).status).toBe(200);
    const requestSignal = await Promise.race([
      started.promise,
      probe.outcome.then(() => {
        throw new Error("Login ended before the target request started");
      }),
    ]);
    expect(requestSignal?.aborted).toBe(false);
    expect(timeout).toHaveBeenLastCalledWith(probe.deps.settings.timeout * 1000);
    // Invoke the registered Ctrl+C handler without delivering an OS signal to the test worker.
    Reflect.apply(process.listeners("SIGINT").at(-1)!, process, []);
    expect(requestSignal?.aborted).toBe(true);

    const error = await probe.outcome;
    expect(error).toMatchObject({ exitCode: ExitCode.INTERRUPTED });
    expect(probe.reporter.error(error)).toBe(130);
    expect(probe.save).not.toHaveBeenCalled();
    expect(probe.stdout).toEqual([]);
    const expectedPaths = STAGES.slice(0, STAGES.indexOf(stage) + 1).map(
      (requestStage) => STAGE_PATHS[requestStage],
    );
    if (stage !== "token") {
      expectedPaths.push("/v1/revoke");
      const revoke = requests.at(-1)!;
      expect(revoke.init.signal?.aborted).toBe(false);
      expect(timeout).toHaveBeenLastCalledWith(5000);
      expect(new URLSearchParams(stringBody(revoke.init.body)).get("token")).toBe(
        SECRETS.refreshToken,
      );
    }
    expect(requests.map(({ url }) => url.pathname)).toEqual(expectedPaths);
    assertNoSecrets(probe);
    assertSignalCleanup(probe);
  } finally {
    // Unblock after a failed assertion even if a regression dropped cancellation from fetch.
    released.resolve(undefined);
  }
});

test.each(STAGES)("%s下游失败不保存 Profile；已获得 RT 时尽力撤销且不泄漏凭据", async (stage) => {
  failStage = stage;
  const probe = launch();
  expect((await localRequest(callbackUrl(await probe.authUrl))).status).toBe(200);
  const error = await probe.outcome;
  expect(error).toBeInstanceOf(BailianError);
  expect(error).toMatchObject({ exitCode: ExitCode.GENERAL });
  expect(probe.save).not.toHaveBeenCalled();
  expect(probe.stdout).toEqual([]);
  const revocations = requests.filter((request) => request.url.pathname === "/v1/revoke");
  expect(revocations).toHaveLength(stage === "token" ? 0 : 1);
  if (stage !== "token") {
    expect(Object.fromEntries(new URLSearchParams(stringBody(revocations[0]!.init.body)))).toEqual({
      client_id: ALIYUN_CLI_CLIENT_ID,
      token: SECRETS.refreshToken,
    });
    expect(revocations[0]!.init.redirect).toBe("error");
  }
  if (stage === "gateway")
    expect(error).toMatchObject({
      api: { apiCode: "ValidationDenied", requestId: "mock-request-id" },
    });
  probe.reporter.error(error);
  expect(
    requests
      .filter((request) => request.url.pathname !== "/v1/revoke")
      .map((request) => request.url.pathname),
  ).toEqual(
    STAGES.slice(0, STAGES.indexOf(stage) + 1).map((requestStage) => STAGE_PATHS[requestStage]),
  );
  assertNoSecrets(probe);
  assertSignalCleanup(probe);
});

test.each(["network", "timeout"] as const)(
  "传输%s错误保留 runtime 分类且脱敏 cause",
  async (kind) => {
    const probe = launch();
    const cause = Object.assign(new Error(`lookup ${SECRETS.code}`), { code: "ENOTFOUND" });
    const failure =
      kind === "network"
        ? new TypeError("fetch failed", { cause })
        : Object.assign(new Error(`request timed out ${SECRETS.code}`), { name: "TimeoutError" });
    fetchMock.mockRejectedValueOnce(failure);
    await localRequest(callbackUrl(await probe.authUrl));
    const error = await probe.outcome;
    expect(probe.reporter.error(error)).toBe(
      kind === "network" ? ExitCode.NETWORK : ExitCode.TIMEOUT,
    );
    expect(probe.save).not.toHaveBeenCalled();
    assertNoSecrets(probe);
    assertSignalCleanup(probe);
  },
);

test("保存失败时撤销新 RT，撤销失败不掩盖主错误或打印凭据", async () => {
  revokeFails = true;
  const probe = launch();
  probe.save.mockRejectedValue(
    new BailianError(
      `Store failed ${SECRETS.refreshToken}`,
      ExitCode.GENERAL,
      `Do not expose ${SECRETS.accessKeySecret}`,
      { cause: new Error(SECRETS.securityToken) },
    ),
  );
  await localRequest(callbackUrl(await probe.authUrl));
  const error = await probe.outcome;
  expect(error).toMatchObject({
    message: "Store failed [REDACTED]",
    hint: "Do not expose [REDACTED]",
  });
  expect(String(error)).not.toContain("revocation");
  probe.reporter.error(error);
  expect(probe.stdout).toEqual([]);
  expect(requests.at(-1)!.url.pathname).toBe("/v1/revoke");
  assertNoSecrets(probe);
  assertSignalCleanup(probe);
});

test("下游阶段取消不保存，并撤销已经获得的 RT", async () => {
  const probe = launch();
  fetchMock.mockImplementationOnce(async () => {
    probe.controller.abort();
    return jsonResponse({
      access_token: SECRETS.accessToken,
      refresh_token: SECRETS.refreshToken,
      expires_in: 1800,
    });
  });
  await localRequest(callbackUrl(await probe.authUrl));
  expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.INTERRUPTED });
  expect(probe.save).not.toHaveBeenCalled();
  expect(requests.map((request) => request.url.pathname)).toEqual(["/v1/revoke"]);
  assertSignalCleanup(probe);
});

test("已开始持久化时取消，不撤销成功保存的会话", async () => {
  const probe = launch();
  probe.save.mockImplementation(async () => probe.controller.abort());
  await finish(probe);
  expect(probe.save).toHaveBeenCalledTimes(1);
  expect(requests.map(({ url }) => url.pathname)).not.toContain("/v1/revoke");
  expect(JSON.parse(probe.stdout.join(""))).toMatchObject({ authenticated: true });
  assertNoSecrets(probe);
  assertSignalCleanup(probe);
});

test.each([false, true])(
  "既有 OAuth 端点优先于默认值，显式端点覆盖优先于 Profile (%s)",
  async (overrideEndpoints) => {
    const previous: AliyunOAuthProfile = {
      client_id: "stored-client",
      scope: "openid",
      authorization_url: ENDPOINTS.authorizationUrl,
      oauth_base_url: ENDPOINTS.oauthBaseUrl,
      modelstudio_host: ENDPOINTS.modelstudioHost,
      console_gateway: ENDPOINTS.consoleGateway,
      console_region: "cn-beijing",
      session_ref: "test-session-reference",
      console_enabled: false,
      openapi_enabled: false,
    };
    const probe = launch(
      {
        clientId: "override-client",
        scope: "openid",
        ...(overrideEndpoints ? DEFAULT_ENDPOINTS : {}),
      },
      { previous, omitEndpoints: true },
    );
    const authUrl = await probe.authUrl;
    expect(new URL(authUrl).searchParams.get("client_id")).toBe("override-client");
    expect(new URL(authUrl).searchParams.get("scope")).toBe("openid");
    await finish(probe);
    expect(probe.save.mock.calls[0]![0]).toMatchObject({
      client_id: "override-client",
      scope: "openid",
      modelstudio_host: overrideEndpoints
        ? DEFAULT_ENDPOINTS.modelstudioHost
        : ENDPOINTS.modelstudioHost,
      console_gateway: overrideEndpoints
        ? DEFAULT_ENDPOINTS.consoleGateway
        : ENDPOINTS.consoleGateway,
      console_enabled: true,
      openapi_enabled: true,
    });
    expect(new URLSearchParams(stringBody(requests[0]!.init.body)).get("client_id")).toBe(
      "override-client",
    );
    expect(requests[2]!.url.host).toBe(
      overrideEndpoints ? DEFAULT_ENDPOINTS.modelstudioHost : ENDPOINTS.modelstudioHost,
    );
    expect(requests[3]!.url.origin).toBe(
      overrideEndpoints ? DEFAULT_ENDPOINTS.consoleGateway : ENDPOINTS.consoleGateway,
    );
    expect(probe.describe).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { authorizationUrl: "http://external.example/authorize" },
  { authorizationUrl: "https://user:secret@authorize.example/authorize" },
  { authorizationUrl: "https://authorize.example/authorize#fragment" },
  { authorizationUrl: "not-a-url" },
  { oauthBaseUrl: "http://external.example" },
  { oauthBaseUrl: "https://tokens.example/path" },
  { oauthBaseUrl: "https://tokens.example/?query=1" },
  { consoleGateway: "https://console.example/cli/api.json" },
  { consoleGateway: "http://external.example" },
  { consoleGateway: "" },
  { modelstudioHost: "" },
  { modelstudioHost: "https://pop.example" },
  { modelstudioHost: "pop.example/path" },
  { bailiancontrolHost: "user@control.example" },
  { consoleRegion: "ap-southeast-1" },
  { clientId: " " },
  { scope: " " },
])("非法 URL/hostname/地域/空覆盖在监听和请求前拒绝：%j", async (options) => {
  const listen = vi.spyOn(http.Server.prototype, "listen");
  const probe = launch(options);
  expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.USAGE });
  expect(listen).not.toHaveBeenCalled();
  expect(probe.browser).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
});

test("首次登录缺授权地址在监听和请求前拒绝", async () => {
  const listen = vi.spyOn(http.Server.prototype, "listen");
  const probe = launch({ authorizationUrl: undefined });
  expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.USAGE });
  expect(listen).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.browser).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
});

test.each([
  { modelstudioHost: undefined },
  { consoleGateway: undefined },
  { modelstudioHost: undefined, consoleGateway: undefined },
])("首次登录省略 POP/网关复用既有默认值，单独覆盖仍生效：%j", async (options) => {
  const probe = launch(options);
  await finish(probe);
  const modelstudioHost =
    "modelstudioHost" in options ? DEFAULT_ENDPOINTS.modelstudioHost : ENDPOINTS.modelstudioHost;
  const consoleGateway =
    "consoleGateway" in options ? DEFAULT_ENDPOINTS.consoleGateway : ENDPOINTS.consoleGateway;
  expect(requests.map((request) => request.url.pathname)).toEqual([
    "/v1/token",
    "/v1/exchange",
    "/modelstudio/cli/generateAccessToken",
    "/cli/api.json",
  ]);
  expect(requests[2]!.url.host).toBe(modelstudioHost);
  expect(new Headers(requests[2]!.init.headers).get("x-acs-security-token")).toBe(
    SECRETS.securityToken,
  );
  expect(requests[3]!.url.origin).toBe(consoleGateway);
  expect(new Headers(requests[3]!.init.headers).get("authorization")).toBe(
    `Bearer ${SECRETS.cliAccessToken}`,
  );
  expect(probe.save).toHaveBeenCalledTimes(1);
  const [profile, session] = probe.save.mock.calls[0]!;
  expect(profile).toMatchObject({
    modelstudio_host: modelstudioHost,
    console_gateway: consoleGateway,
  });
  expect(session.consoleTokens).toEqual({
    [consoleCredentialKey({ region: "cn-beijing", site: "domestic", gateway: consoleGateway })]: {
      token: SECRETS.cliAccessToken,
    },
  });
  assertNoSecrets(probe);
  assertSignalCleanup(probe);
});

test.each([true, false])(
  "dry-run 零秘密读取/监听/浏览器/请求/保存，允许缺端点 (%s)",
  async (omitEndpoints) => {
    const listen = vi.spyOn(http.Server.prototype, "listen");
    const input = new PassThrough();
    const probe = launch(
      { noBrowser: omitEndpoints },
      { dryRun: true, omitEndpoints, stdin: input },
    );
    expect(await probe.outcome).toBeUndefined();
    expect(input.listenerCount("data")).toBe(0);
    expect(probe.describe).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(probe.browser).not.toHaveBeenCalled();
    expect(probe.save).not.toHaveBeenCalled();
    expect(probe.stderr).toEqual([]);
    const data = JSON.parse(probe.stdout.join(""));
    expect(data.method).toBe("aliyun");
    expect(data.no_browser).toBe(omitEndpoints);
    expect(data.missing).toEqual(omitEndpoints ? ["--authorization-url"] : []);
    expect(data.plan.modelstudio_host).toBe(
      omitEndpoints ? DEFAULT_ENDPOINTS.modelstudioHost : ENDPOINTS.modelstudioHost,
    );
    expect(data.plan.console_gateway).toBe(
      omitEndpoints ? DEFAULT_ENDPOINTS.consoleGateway : ENDPOINTS.consoleGateway,
    );
    expect(data.plan.client_id).toBe(ALIYUN_CLI_CLIENT_ID);
    expect(data.plan.scope).toBe(ALIYUN_CLI_SCOPE);
    expect(data.plan.oauth_base_url).toBe(
      omitEndpoints ? ALIYUN_OAUTH_BASE_URL : ENDPOINTS.oauthBaseUrl,
    );
    assertNoSecrets(probe);
    assertSignalCleanup(probe);
  },
);

test.each([
  [false, "en-US", "with a random loopback port"],
  [true, "en-US", "by pasting the callback URL without listening on a port"],
  [false, "zh-CN", "通过随机回环端口"],
  [true, "zh-CN", "通过粘贴回调 URL（不监听端口）"],
] as const)("OAuth 文本预览按模式显示回调方式 (%s, %s)", async (noBrowser, language, text) => {
  const probe = launch({ noBrowser }, { dryRun: true, output: "text", language });
  expect(await probe.outcome).toBeUndefined();
  expect(probe.stdout.join("")).toContain(text);
  if (noBrowser) expect(probe.stdout.join("")).not.toMatch(/random loopback port|随机回环端口/u);
  expect(probe.stderr).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(probe.save).not.toHaveBeenCalled();
});

test("预发 OAuth 首次登录预览列出预设端点和未确认的 Console 网关", async () => {
  const probe = launch({}, { dryRun: true, omitEndpoints: true, preControlPlane: {} });
  expect(await probe.outcome).toBeUndefined();
  expect(JSON.parse(probe.stdout.join(""))).toMatchObject({
    environment: "pre",
    missing: ["BAILIAN_PRE_CONSOLE_GATEWAY"],
    plan: {
      oauth_base_url: PRE_ALIYUN_OAUTH_BASE_URL,
      modelstudio_host: PRE_MODEL_STUDIO_HOST,
      bailiancontrol_host: PRE_BAILIAN_CONTROL_HOST,
    },
  });
  expect(probe.describe).not.toHaveBeenCalled();
  expect(probe.browser).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("预发 OAuth 登录绑定预设端点，不请求线上网关", async () => {
  const probe = launch(
    {},
    { omitEndpoints: true, preControlPlane: { consoleGateway: PRE_CONSOLE_GATEWAY } },
  );
  await finish(probe);
  expect(requests.map(({ url }) => url.origin)).toEqual([
    PRE_ALIYUN_OAUTH_BASE_URL,
    PRE_ALIYUN_OAUTH_BASE_URL,
    `https://${PRE_MODEL_STUDIO_HOST}`,
    PRE_CONSOLE_GATEWAY,
  ]);
  expect(probe.save).toHaveBeenCalledWith(
    expect.objectContaining({
      modelstudio_host: PRE_MODEL_STUDIO_HOST,
      console_gateway: PRE_CONSOLE_GATEWAY,
      bailiancontrol_host: PRE_BAILIAN_CONTROL_HOST,
    }),
    expect.any(Object),
  );
  assertNoSecrets(probe);
});

test.each([{}, { consoleGateway: PRE_CONSOLE_GATEWAY }])(
  "预发预检拒绝缺失网关或线上 OAuth 覆盖，零请求、零落盘 (%j)",
  async (preControlPlane) => {
    const listen = vi.spyOn(http.Server.prototype, "listen");
    const probe = launch(
      { oauthBaseUrl: ALIYUN_OAUTH_BASE_URL },
      { omitEndpoints: true, preControlPlane },
    );
    expect(await probe.outcome).toMatchObject({ exitCode: ExitCode.USAGE });
    expect(listen).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(probe.save).not.toHaveBeenCalled();
  },
);

test("dry-run 只对 HTTP loopback 端点放行，拒绝外部 HTTP", async () => {
  const probe = launch(
    {
      authorizationUrl: "http://127.0.0.1:43210/authorize",
      oauthBaseUrl: "http://localhost:43211",
      consoleGateway: "http://[::1]:43212",
    },
    { dryRun: true },
  );
  expect(await probe.outcome).toBeUndefined();
  expect(JSON.parse(probe.stdout.join("")).plan).toMatchObject({
    authorization_url: "http://127.0.0.1:43210/authorize",
    oauth_base_url: "http://localhost:43211",
    console_gateway: "http://[::1]:43212",
  });
  const invalid = launch({ consoleGateway: "http://external.example" }, { dryRun: true });
  expect(await invalid.outcome).toMatchObject({ exitCode: ExitCode.USAGE });
  expect(fetchMock).not.toHaveBeenCalled();
});
