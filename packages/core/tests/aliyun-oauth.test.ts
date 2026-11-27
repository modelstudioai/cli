import { createHash } from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vite-plus/test";
import {
  aliyunAuthorizationUrl,
  createOAuthProofKey,
  exchangeAliyunCode,
  exchangeAliyunSts,
  parseAliyunCallback,
  refreshAliyunTokens,
  revokeAliyunTokens,
  type AliyunOAuthDeps,
} from "../src/auth/aliyun-oauth.ts";
import { httpTransport } from "../src/client/transport.ts";
import { BailianError, UsageError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";

const NOW = Date.UTC(2026, 0, 1);
const PROFILE = {
  client_id: "fixture-native-client",
  scope: "openid /internal/bailian/cli",
  authorization_url: "https://authorize.example.test/authorize?audience=fixture",
  oauth_base_url: "https://oauth.example.test",
};
const REDIRECT = "http://127.0.0.1:43123/callback";
const CODE = "fixture-code+with&encoding";
const VERIFIER = "fixture-verifier-with-encoding+&";
const ACCESS = "fixture-oauth-access";
const REFRESH = "fixture-oauth-refresh";
const TOKEN = {
  access_token: ACCESS,
  refresh_token: REFRESH,
  expires_in: 3600,
  token_type: "Bearer",
  scope: PROFILE.scope,
};
const STS = {
  accessKeyId: "fixture-sts-id",
  accessKeySecret: "fixture-sts-secret",
  securityToken: "fixture-sts-token",
  expiration: new Date(NOW + 3600_000).toISOString(),
};
const PASCAL_CASE_STS = {
  AccessKeyId: STS.accessKeyId,
  AccessKeySecret: STS.accessKeySecret,
  SecurityToken: STS.securityToken,
  Expiration: STS.expiration,
};

function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

const debug = vi.fn();
const deps: AliyunOAuthDeps = {
  identity: {
    binName: "fixture-cli",
    version: "0.0.0-test",
    clientName: "fixture-client",
    npmPackage: "fixture-package",
  },
  timeout: 5,
  now: () => NOW,
  debug,
};
let transport: MockInstance<typeof httpTransport.fetch>;
beforeEach(() => {
  debug.mockClear();
  // Every protocol request is intercepted; no real OAuth/API or OS secret backend is used.
  transport = vi.spyOn(httpTransport, "fetch").mockRejectedValue(new Error("Unexpected request"));
});
afterEach(() => vi.restoreAllMocks());

function request() {
  expect(transport).toHaveBeenCalledTimes(1);
  const [endpoint, init] = transport.mock.calls[0]!;
  expect(init?.method).toBe("POST");
  expect(init?.redirect).toBe("error");
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  const headers = new Headers(init?.headers);
  expect(headers.get("x-dashscope-openapisource")).toBe("BailianCLI");
  expect(JSON.parse(headers.get("x-dashscope-source-config")!)).toMatchObject({
    tags: { t2: "fixture-cli", t3: "0.0.0-test" },
  });
  expect(typeof endpoint).toBe("string");
  if (typeof endpoint !== "string") throw new Error("OAuth endpoint must be a string");
  return { endpoint, init, headers };
}

function formFields(init?: RequestInit) {
  expect(typeof init?.body).toBe("string");
  if (typeof init?.body !== "string") throw new Error("OAuth form body must be a string");
  return Object.fromEntries(new URLSearchParams(init.body));
}

async function caughtError(operation: Promise<unknown>): Promise<BailianError> {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(BailianError);
  return error as BailianError;
}

function expectNoSecrets(error?: BailianError) {
  const visible = JSON.stringify({ diagnostics: debug.mock.calls, error: error?.toJSON() });
  for (const secret of [CODE, VERIFIER, ACCESS, REFRESH, STS.accessKeySecret, STS.securityToken]) {
    expect(visible).not.toContain(secret);
  }
}

describe("Aliyun OAuth authorization and callback", () => {
  test("creates independent high-entropy state and RFC 7636 S256 proof keys", () => {
    const first = createOAuthProofKey();
    const second = createOAuthProofKey();
    for (const proof of [first, second]) {
      expect(proof.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(proof.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(proof.state).not.toBe(proof.verifier);
      expect(proof.challenge).toBe(
        createHash("sha256").update(proof.verifier, "ascii").digest("base64url"),
      );
    }
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(second.verifier);
    expect(transport).not.toHaveBeenCalled();
  });

  test("authorization URL has exact public fields, preserves audience and never exposes verifier", () => {
    const proof = createOAuthProofKey();
    const url = new URL(aliyunAuthorizationUrl(PROFILE, REDIRECT, proof));
    expect(url.origin + url.pathname).toBe("https://authorize.example.test/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      audience: "fixture",
      response_type: "code",
      client_id: PROFILE.client_id,
      scope: PROFILE.scope,
      redirect_uri: REDIRECT,
      state: proof.state,
      code_challenge: proof.challenge,
      code_challenge_method: "S256",
    });
    expect(url.toString()).not.toContain(proof.verifier);
    expect(url.searchParams.has("code_verifier")).toBe(false);
  });

  test("overwrites existing reserved query fields rather than appending duplicates", () => {
    const proof = createOAuthProofKey();
    const url = new URL(
      aliyunAuthorizationUrl(
        {
          ...PROFILE,
          authorization_url: `${PROFILE.authorization_url}&state=old&state=duplicate&code_challenge=old`,
        },
        REDIRECT,
        proof,
      ),
    );
    expect(url.searchParams.getAll("state")).toEqual([proof.state]);
    expect(url.searchParams.getAll("code_challenge")).toEqual([proof.challenge]);
  });

  test("accepts a single matching state and returns decoded code verbatim", () => {
    const url = new URL(REDIRECT);
    url.searchParams.set("state", "fixture-state");
    url.searchParams.set("code", CODE);
    expect(parseAliyunCallback(url, "fixture-state")).toBe(CODE);
  });

  test.each([
    "code=fixture-code",
    "state=wrong&code=fixture-code",
    "state=fixture-state&state=fixture-state&code=fixture-code",
    "state=fixture-state&state=wrong&code=fixture-code",
    "state=fixture-state",
    "state=fixture-state&code=",
    "state=fixture-state&code=%20%09",
    "state=fixture-state&code=first&code=second",
  ])("rejects malformed callback %s without requests", (query) => {
    expect(() => parseAliyunCallback(new URL(`${REDIRECT}?${query}`), "fixture-state")).toThrow(
      UsageError,
    );
    expect(transport).not.toHaveBeenCalled();
  });

  test("authorization denial is generic and does not echo callback secrets", () => {
    let failure: unknown;
    try {
      parseAliyunCallback(
        new URL(
          `${REDIRECT}?state=fixture-state&error=access_denied&error_description=${REFRESH}&code=${ACCESS}`,
        ),
        "fixture-state",
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(BailianError);
    expect(failure).toMatchObject({ exitCode: ExitCode.GENERAL });
    expectNoSecrets(failure as BailianError);
  });

  test("invalid state is rejected before interpreting an error callback", () => {
    expect(() =>
      parseAliyunCallback(new URL(`${REDIRECT}?state=wrong&error=access_denied`), "fixture-state"),
    ).toThrow(UsageError);
  });
});

describe("Aliyun OAuth token and STS wire protocol", () => {
  test("code exchange POSTs only native OAuth form fields, never client_secret or Bearer", async () => {
    transport.mockResolvedValue(response(TOKEN));
    expect(await exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps)).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      accessTokenExpiresAt: NOW + 3600_000,
    });
    const sent = request();
    expect(sent.endpoint).toBe(`${PROFILE.oauth_base_url}/v1/token`);
    expect(sent.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(sent.headers.has("authorization")).toBe(false);
    expect(formFields(sent.init)).toEqual({
      grant_type: "authorization_code",
      client_id: PROFILE.client_id,
      code: CODE,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    });
    expectNoSecrets();
  });

  test("refresh POSTs old RT and retains it when rotation field is omitted", async () => {
    transport.mockResolvedValue(
      response({ access_token: ACCESS, expires_in: "120", token_type: "Bearer" }),
    );
    expect(await refreshAliyunTokens(PROFILE, REFRESH, deps)).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      accessTokenExpiresAt: NOW + 120_000,
    });
    const sent = request();
    expect(sent.endpoint).toBe(`${PROFILE.oauth_base_url}/v1/token`);
    expect(sent.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(sent.headers.has("authorization")).toBe(false);
    expect(formFields(sent.init)).toEqual({
      grant_type: "refresh_token",
      client_id: PROFILE.client_id,
      refresh_token: REFRESH,
    });
    expectNoSecrets();
  });

  test("refresh accepts and returns a rotated RT", async () => {
    transport.mockResolvedValue(response({ ...TOKEN, refresh_token: "fixture-rotated-refresh" }));
    expect(await refreshAliyunTokens(PROFILE, REFRESH, deps)).toMatchObject({
      refreshToken: "fixture-rotated-refresh",
    });
  });

  test.each([
    { casing: "camelCase", payload: STS },
    { casing: "PascalCase", payload: PASCAL_CASE_STS },
  ])("normalizes $casing STS fields from an empty-body Bearer POST", async ({ payload }) => {
    transport.mockResolvedValue(response(payload));
    expect(await exchangeAliyunSts(PROFILE, ACCESS, deps)).toEqual({
      accessKeyId: STS.accessKeyId,
      accessKeySecret: STS.accessKeySecret,
      securityToken: STS.securityToken,
      expiresAt: NOW + 3600_000,
    });
    const sent = request();
    expect(sent.endpoint).toBe(`${PROFILE.oauth_base_url}/v1/exchange`);
    expect(sent.headers.get("authorization")).toBe(`Bearer ${ACCESS}`);
    expect(sent.headers.get("content-type")).toBe("application/json");
    expect(sent.init?.body).toBeUndefined();
    expect(new URL(sent.endpoint).search).toBe("");
    expectNoSecrets();
  });

  test("revoke sends only client_id and RT in a form and accepts an empty 204", async () => {
    transport.mockResolvedValue(new Response(null, { status: 204 }));
    await revokeAliyunTokens(PROFILE, REFRESH, deps);
    const sent = request();
    expect(sent.endpoint).toBe(`${PROFILE.oauth_base_url}/v1/revoke`);
    expect(sent.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(sent.headers.has("authorization")).toBe(false);
    expect(formFields(sent.init)).toEqual({
      client_id: PROFILE.client_id,
      token: REFRESH,
    });
    expectNoSecrets();
  });
});

describe("token, scope and expiry validation", () => {
  test.each(
    [
      { access_token: undefined },
      { access_token: "" },
      { access_token: "  " },
      { access_token: 42 },
      { refresh_token: undefined },
      { refresh_token: "" },
      { refresh_token: " " },
      { refresh_token: null },
      { refresh_token: 42 },
      { expires_in: undefined },
      { expires_in: 0 },
      { expires_in: -1 },
      { expires_in: "NaN" },
      { expires_in: "Infinity" },
      { expires_in: "invalid" },
      { token_type: "Basic" },
      { token_type: "bearer" },
    ].map((patch) => ({ patch, field: Object.keys(patch)[0], value: Object.values(patch)[0] })),
  )("rejects invalid login token $field=$value", async ({ patch }) => {
    transport.mockResolvedValue(response({ ...TOKEN, ...patch }));
    const error = await caughtError(exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps));
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expectNoSecrets(error);
  });

  test.each([true, [], [1], Number.MAX_VALUE].map((expiresIn) => ({ expiresIn })))(
    "rejects nonnumeric or overflowing TTL $expiresIn",
    async ({ expiresIn }) => {
      transport.mockResolvedValue(response({ ...TOKEN, expires_in: expiresIn }));
      const error = await caughtError(exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps));
      expect(error.exitCode).toBe(ExitCode.GENERAL);
      expectNoSecrets(error);
    },
  );

  test("supports positive subsecond TTL against injected time", async () => {
    transport.mockResolvedValue(response({ ...TOKEN, expires_in: 0.5 }));
    expect(await exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps)).toMatchObject({
      accessTokenExpiresAt: NOW + 500,
    });
  });

  test.each(["openid", "/internal/bailian/cli", "", "openid /internal/bailian/cli-extra"])(
    "rejects insufficient explicitly granted scope %j",
    async (scope) => {
      transport.mockResolvedValue(response({ ...TOKEN, scope }));
      const error = await caughtError(exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps));
      expect(error.message).toContain("scope");
      expectNoSecrets(error);
    },
  );

  test("scope comparison is set-based and allows an explicitly granted superset", async () => {
    transport.mockResolvedValue(
      response({ ...TOKEN, scope: " extra\t/internal/bailian/cli\nopenid " }),
    );
    await expect(
      exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps),
    ).resolves.toMatchObject({ accessToken: ACCESS });
  });

  test("omitted scope and token_type remain compatible with token endpoint responses", async () => {
    transport.mockResolvedValue(response({ ...TOKEN, scope: undefined, token_type: undefined }));
    await expect(
      exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps),
    ).resolves.toMatchObject({ refreshToken: REFRESH });
  });

  test.each(
    [
      { accessKeyId: undefined },
      { accessKeyId: "" },
      { accessKeyId: " " },
      { accessKeySecret: undefined },
      { accessKeySecret: "" },
      { accessKeySecret: 42 },
      { securityToken: undefined },
      { securityToken: " " },
      { expiration: undefined },
      { expiration: "not-a-date" },
      { expiration: NOW + 3600_000 },
      { expiration: new Date(NOW).toISOString() },
      { expiration: new Date(NOW - 1).toISOString() },
    ].map((patch) => ({ patch, field: Object.keys(patch)[0], value: Object.values(patch)[0] })),
  )("rejects invalid STS response $field=$value", async ({ patch }) => {
    transport.mockResolvedValue(response({ ...STS, ...patch }));
    const error = await caughtError(exchangeAliyunSts(PROFILE, ACCESS, deps));
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expectNoSecrets(error);
  });

  test.each([
    { reason: "blank secret", patch: { AccessKeySecret: " " } },
    { reason: "non-string token", patch: { SecurityToken: 42 } },
    { reason: "invalid expiration", patch: { Expiration: "not-a-date" } },
    { reason: "expired credential", patch: { Expiration: new Date(NOW).toISOString() } },
    {
      reason: "mixed field names",
      patch: { AccessKeySecret: undefined, accessKeySecret: STS.accessKeySecret },
    },
  ])("rejects PascalCase STS response with $reason", async ({ patch }) => {
    transport.mockResolvedValue(response({ ...PASCAL_CASE_STS, ...patch }));
    const error = await caughtError(exchangeAliyunSts(PROFILE, ACCESS, deps));
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expectNoSecrets(error);
  });

  test("accepts STS expiry one millisecond beyond now", async () => {
    transport.mockResolvedValue(response({ ...STS, expiration: new Date(NOW + 1).toISOString() }));
    await expect(exchangeAliyunSts(PROFILE, ACCESS, deps)).resolves.toMatchObject({
      expiresAt: NOW + 1,
    });
  });
});

describe("OAuth failures preserve API context without credentials", () => {
  test.each([
    {
      status: 400,
      data: {
        error: "invalid_grant",
        error_description: "Service rejected this grant verbatim",
        requestId: "fixture-request",
      },
    },
    {
      status: 200,
      data: {
        Success: false,
        Code: "FixtureDenied",
        Message: "Service business error verbatim",
        RequestId: "fixture-request",
      },
    },
    { status: 503, data: { message: "Service unavailable verbatim" } },
  ])("passes service message and context through for HTTP $status", async ({ status, data }) => {
    transport.mockResolvedValue(
      response(data, status, { "x-request-id": "fixture-header-request" }),
    );
    const error = await caughtError(refreshAliyunTokens(PROFILE, REFRESH, deps));
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expect(error.message).toBe(
      "error_description" in data
        ? data.error_description
        : "Message" in data
          ? data.Message
          : data.message,
    );
    expect(error.api).toEqual({
      httpStatus: status,
      apiCode: "error" in data ? data.error : "Code" in data ? data.Code : undefined,
      requestId:
        "requestId" in data || "RequestId" in data ? "fixture-request" : "fixture-header-request",
    });
    expect(error.toJSON().error).toMatchObject({ http_status: status, message: error.message });
    expectNoSecrets(error);
  });

  test.each(["code", "refresh", "sts"] as const)(
    "redacts reflected %s secrets in service errors and diagnostics",
    async (operation) => {
      const reflected =
        operation === "code" ? [CODE, VERIFIER] : operation === "refresh" ? [REFRESH] : [ACCESS];
      transport.mockResolvedValue(
        response(
          {
            error: "fixture_error",
            error_description: `Rejected ${reflected.join(" / ")} twice ${reflected.join(" / ")}`,
          },
          400,
        ),
      );
      const error = await caughtError(
        operation === "code"
          ? exchangeAliyunCode(PROFILE, CODE, VERIFIER, REDIRECT, deps)
          : operation === "refresh"
            ? refreshAliyunTokens(PROFILE, REFRESH, deps)
            : exchangeAliyunSts(PROFILE, ACCESS, deps),
      );
      expect(error.message).toBe(
        `Rejected ${reflected.map(() => "[REDACTED]").join(" / ")} twice ${reflected.map(() => "[REDACTED]").join(" / ")}`,
      );
      expectNoSecrets(error);
    },
  );

  test.each([null, [], "fixture-response-secret", 42].map((data) => ({ data })))(
    "rejects nonobject JSON response $data without echoing it",
    async ({ data }) => {
      transport.mockResolvedValue(response(data));
      const error = await caughtError(refreshAliyunTokens(PROFILE, REFRESH, deps));
      expect(error.exitCode).toBe(ExitCode.GENERAL);
      expect(JSON.stringify(error.toJSON())).not.toContain("fixture-response-secret");
      expectNoSecrets(error);
    },
  );

  test("rejects non-JSON response without echoing HTML or secrets", async () => {
    transport.mockResolvedValue(new Response(`<html>${ACCESS} ${REFRESH}</html>`, { status: 502 }));
    const error = await caughtError(refreshAliyunTokens(PROFILE, REFRESH, deps));
    expect(error.message).toContain("HTTP 502");
    expectNoSecrets(error);
  });

  test("revoke failure preserves service text and API context, redacting a reflected RT", async () => {
    transport.mockResolvedValue(
      response(
        {
          error: "temporarily_unavailable",
          error_description: `Service cannot revoke ${REFRESH} yet`,
          requestId: "fixture-revoke-request",
        },
        503,
      ),
    );
    const error = await caughtError(revokeAliyunTokens(PROFILE, REFRESH, deps));
    expect(error.message).toBe("Service cannot revoke [REDACTED] yet");
    expect(error.api).toEqual({
      httpStatus: 503,
      apiCode: "temporarily_unavailable",
      requestId: "fixture-revoke-request",
    });
    expectNoSecrets(error);
  });
});
