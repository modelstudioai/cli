import { spawn, type ChildProcess } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vite-plus/test";
import type { AliyunOAuthDeps } from "../src/auth/aliyun-oauth.ts";
import type { AliyunOAuthProfile, AliyunOAuthSession } from "../src/auth/aliyun-types.ts";
import {
  consoleCredentialKey,
  createOpenApiCredentialProvider,
  oauthConfigurationFingerprint,
} from "../src/auth/openapi-provider.ts";
import type { OAuthSecretStore } from "../src/auth/secure-store.ts";
import { makeAuthStore } from "../src/auth/store.ts";
import type { ConsoleCredential } from "../src/auth/types.ts";
import { Client } from "../src/client/client.ts";
import { httpTransport } from "../src/client/transport.ts";
import { anonymousConsoleCall } from "../src/console/gateway.ts";
import { PRE_MODEL_STUDIO_HOST, resolvePreControlPlane } from "../src/config/control-plane.ts";
import { getConfigPath } from "../src/config/paths.ts";
import {
  activateConfigProfile,
  buildSettings,
  buildSources,
  deleteConfigProfile,
  readConfigFile,
  readConfigProfiles,
  writeConfigFile,
  type ResolutionSources,
} from "../src/config/loader.ts";
import type { ConfigFile } from "../src/config/schema.ts";
import { BailianError, UsageError } from "../src/errors/base.ts";
import { CredentialError } from "../src/errors/credential.ts";
import { enterIsolatedHome, type IsolatedHomeHandle } from "./helpers/isolation.ts";

const NOW = Date.UTC(2026, 0, 1);
const REFERENCE = "11111111-1111-4111-8111-111111111111";
const OTHER_REFERENCE = "22222222-2222-4222-8222-222222222222";
const ACCESS = "fixture-oauth-access";
const REFRESH = "fixture-oauth-refresh";
const ROTATED_ACCESS = "fixture-rotated-access";
const ROTATED_REFRESH = "fixture-rotated-refresh";
const MODEL_KEY = "fixture-model-api-key";
const TARGET: Omit<ConsoleCredential, "token" | "source"> = {
  region: "cn-beijing",
  site: "domestic",
};

function profile(patch: Partial<AliyunOAuthProfile> = {}): AliyunOAuthProfile {
  return {
    client_id: "fixture-native-client",
    scope: "openid /internal/bailian/cli",
    authorization_url: "https://authorize.example.test/authorize",
    oauth_base_url: "https://oauth.example.test",
    modelstudio_host: "modelstudio.example.test",
    bailiancontrol_host: "bailiancontrol.example.test",
    console_gateway: "https://console.example.test",
    console_region: "cn-beijing",
    session_ref: REFERENCE,
    console_enabled: true,
    openapi_enabled: true,
    ...patch,
  };
}

function session(patch: Partial<AliyunOAuthSession> = {}): AliyunOAuthSession {
  return {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    accessTokenExpiresAt: NOW + 3600_000,
    configurationFingerprint: oauthConfigurationFingerprint(profile()),
    ...patch,
  };
}

function sts(expiresAt = NOW + 3600_000): NonNullable<AliyunOAuthSession["sts"]> {
  return {
    accessKeyId: "fixture-sts-id",
    accessKeySecret: "fixture-sts-secret",
    securityToken: "fixture-sts-token",
    expiresAt,
  };
}

function memoryStore() {
  const values = new Map<string, string>();
  const store = {
    read: vi.fn(async (reference: string) => values.get(reference)),
    write: vi.fn(async (reference: string, raw: string) => {
      values.set(reference, raw);
    }),
    remove: vi.fn(async (reference: string) => {
      values.delete(reference);
    }),
  } satisfies OAuthSecretStore;
  const saved = (reference = REFERENCE): AliyunOAuthSession =>
    JSON.parse(values.get(reference)!) as AliyunOAuthSession;
  return { store, values, saved };
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

function endpointUrl(input: Parameters<typeof httpTransport.fetch>[0]): string {
  expect(typeof input).toBe("string");
  if (typeof input !== "string") throw new Error("OAuth endpoint must be a string");
  return input;
}

function formBody(init?: RequestInit): URLSearchParams {
  expect(typeof init?.body).toBe("string");
  if (typeof init?.body !== "string") throw new Error("OAuth form body must be a string");
  return new URLSearchParams(init.body);
}

function tokenResponse() {
  return json({
    access_token: ROTATED_ACCESS,
    refresh_token: ROTATED_REFRESH,
    expires_in: 3600,
    token_type: "Bearer",
  });
}

function stsResponse() {
  const credential = sts();
  return json({
    accessKeyId: credential.accessKeyId,
    accessKeySecret: credential.accessKeySecret,
    securityToken: credential.securityToken,
    expiration: new Date(credential.expiresAt).toISOString(),
  });
}

let isolation: IsolatedHomeHandle;
let clock: number;
let deps: AliyunOAuthDeps;
let transport: MockInstance<typeof httpTransport.fetch>;
beforeEach(() => {
  isolation = enterIsolatedHome();
  clock = NOW;
  deps = {
    identity: {
      binName: "fixture-cli",
      version: "0.0.0-test",
      npmPackage: "fixture-package",
      clientName: "fixture-client",
    },
    timeout: 5,
    now: () => clock,
  };
  transport = vi
    .spyOn(httpTransport, "fetch")
    .mockRejectedValue(new Error("Unexpected OAuth/API request"));
});
afterEach(() => {
  vi.restoreAllMocks();
  isolation.restore();
});

async function setup(
  options: {
    file?: ConfigFile;
    flags?: ResolutionSources["flags"];
    env?: NodeJS.ProcessEnv;
    configName?: string;
    oauthSession?: AliyunOAuthSession;
  } = {},
) {
  const file = options.file ?? { aliyun_oauth: profile() };
  await writeConfigFile({ language: "en-US", ...file }, options.configName);
  const sources: ResolutionSources = {
    flags: options.flags ?? {},
    env: options.env ?? {},
    file: readConfigFile(options.configName),
    configName: options.configName,
    configPath: join(isolation.configDir, "config.json"),
  };
  const fake = memoryStore();
  if (file.aliyun_oauth)
    fake.values.set(
      file.aliyun_oauth.session_ref,
      JSON.stringify({
        ...(options.oauthSession ?? session()),
        configurationFingerprint: oauthConfigurationFingerprint(file.aliyun_oauth),
      }),
    );
  const storage = { store: fake.store, directory: isolation.configDir };
  return {
    ...fake,
    sources,
    provider: createOpenApiCredentialProvider(sources, deps, storage),
    auth: makeAuthStore(sources, deps, storage),
  };
}

async function configText() {
  return readFile(join(isolation.configDir, "config.json"), "utf8");
}

function expectNoPlaintextConfig(raw: string) {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  expect(parsed.access_token).toBeUndefined();
  expect(parsed.access_key_id).toBeUndefined();
  expect(parsed.access_key_secret).toBeUndefined();
  expect(parsed.security_token).toBeUndefined();
  for (const forbidden of [
    ACCESS,
    REFRESH,
    ROTATED_ACCESS,
    ROTATED_REFRESH,
    sts().accessKeyId,
    sts().accessKeySecret,
    sts().securityToken,
    "fixture-console-token",
  ]) {
    expect(raw).not.toContain(forbidden);
  }
}

describe("pre-release control-plane isolation", () => {
  test("uses an independent same-name Profile; ignores inherited credentials and validates the file marker", async () => {
    const flags = { config: "team" };
    const pre = resolvePreControlPlane({ BAILIAN_PRE: "true" })!;
    const onlinePath = getConfigPath();
    await writeConfigFile({ access_key_id: "online-ak", access_key_secret: "online-sk" }, "team");
    process.env.BAILIAN_ACCESS_KEY_ID = "fixture-inherited-ak";
    process.env.BAILIAN_ACCESS_KEY_SECRET = "fixture-inherited-sk";
    process.env.BAILIAN_WORKSPACE_ID = "fixture-online-workspace";
    const sources = buildSources(flags, undefined, pre);
    expect(sources.configPath).not.toBe(onlinePath);
    expect(sources.file).toEqual({});
    expect(buildSettings(sources).workspaceId).toBeUndefined();
    expect(() => createOpenApiCredentialProvider(sources, deps).assertAvailable()).toThrow(
      CredentialError,
    );
    const auth = makeAuthStore(sources, deps);
    await auth.login({ access_key_id: "pre-ak", access_key_secret: "pre-sk" });
    const preFile = JSON.parse(await readFile(auth.path, "utf8"));
    expect(preFile).toMatchObject({ control_environment: "pre", active_config: "team" });
    const markerCopy = join(isolation.configDir, "copied-online.json");
    await writeFile(markerCopy, JSON.stringify(preFile));
    expect(() => readConfigFile("team", markerCopy)).toThrow(/environment/i);
    const selected = buildSources({}, undefined, pre);
    expect(selected.configName).toBe("team");
    expect(selected.file.access_key_id).toBe("pre-ak");
    expect(buildSources({ config: "default" }, undefined, pre).file.access_key_id).toBeUndefined();
    expect(await auth.logout("all")).toBe(true);
    expect(readConfigFile("team", onlinePath).access_key_id).toBe("online-ak");
    expect(transport).not.toHaveBeenCalled();
  });

  test("routes a static OpenAPI pair to pre-release and refuses unverified services before transport", async () => {
    const sources = buildSources(
      { accessKeyId: "fixture-pre-ak", accessKeySecret: "fixture-pre-sk" },
      undefined,
      {},
    );
    const client = new Client({
      identity: deps.identity,
      baseUrl: "https://dashscope.aliyuncs.com",
      settings: buildSettings(sources),
      openApiProvider: createOpenApiCredentialProvider(sources, deps),
    });
    const request = {
      host: "modelstudio.cn-beijing.aliyuncs.com",
      path: "/readonly",
      action: "ListFixture",
      version: "2026-01-01",
      method: "GET" as const,
    };
    await expect(
      client.openApiJson({ ...request, host: "other.cn-beijing.aliyuncs.com" }),
    ).rejects.toThrow(/pre-release/);
    await expect(
      anonymousConsoleCall(buildSettings(sources))("fixture.catalog", {}),
    ).rejects.toThrow("BAILIAN_PRE_CONSOLE_GATEWAY");
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValueOnce(json({ Success: true }));
    await expect(client.openApiJson(request)).resolves.toEqual({ Success: true });
    const [endpoint, init] = transport.mock.calls[0]!;
    expect(endpoint).toBe(`https://${PRE_MODEL_STUDIO_HOST}/readonly`);
    expect(new Headers(init?.headers).get("authorization")).toContain("Credential=fixture-pre-ak");
    expect(init?.redirect).toBe("error");
  });
});

describe("OpenAPI credential source selection and pure preflight", () => {
  const env = {
    BAILIAN_ACCESS_KEY_ID: " fixture-bailian-id ",
    BAILIAN_ACCESS_KEY_SECRET: " fixture-bailian-secret ",
    BAILIAN_SECURITY_TOKEN: " fixture-bailian-token ",
    ALIBABA_CLOUD_ACCESS_KEY_ID: "fixture-aliyun-id",
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fixture-aliyun-secret",
    ALIBABA_CLOUD_SECURITY_TOKEN: "fixture-aliyun-token",
  };
  test.each([
    {
      label: "flag over Bailian env and OAuth",
      flags: {
        accessKeyId: "fixture-flag-id",
        accessKeySecret: "fixture-flag-secret",
        securityToken: "fixture-flag-token",
      },
      env,
      file: { aliyun_oauth: profile() },
      expected: {
        accessKeyId: "fixture-flag-id",
        accessKeySecret: "fixture-flag-secret",
        securityToken: "fixture-flag-token",
        source: "flag",
      },
    },
    {
      label: "Bailian env over OAuth",
      env,
      file: { aliyun_oauth: profile() },
      expected: {
        accessKeyId: "fixture-bailian-id",
        accessKeySecret: "fixture-bailian-secret",
        securityToken: "fixture-bailian-token",
        source: "env",
      },
    },
    {
      label: "selected static config over Aliyun env",
      env: {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "fixture-aliyun-id",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fixture-aliyun-secret",
        ALIBABA_CLOUD_SECURITY_TOKEN: "fixture-aliyun-token",
      },
      file: { access_key_id: "fixture-file-id", access_key_secret: "fixture-file-secret" },
      expected: {
        accessKeyId: "fixture-file-id",
        accessKeySecret: "fixture-file-secret",
        securityToken: undefined,
        source: "config",
      },
    },
    {
      label: "Aliyun env when selected file has no credentials",
      env: {
        ALIBABA_CLOUD_ACCESS_KEY_ID: " fixture-aliyun-id ",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: " fixture-aliyun-secret ",
        ALIBABA_CLOUD_SECURITY_TOKEN: "fixture-aliyun-token",
      },
      file: {},
      expected: {
        accessKeyId: "fixture-aliyun-id",
        accessKeySecret: "fixture-aliyun-secret",
        securityToken: "fixture-aliyun-token",
        source: "env",
      },
    },
  ])("$label uses one complete source without secret storage or network", async (fixture) => {
    const instance = await setup(fixture);
    const before = await configText();
    instance.provider.assertAvailable();
    expect(await instance.provider.getCredential()).toEqual(fixture.expected);
    expect(instance.store.read).not.toHaveBeenCalled();
    expect(instance.store.write).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(await configText()).toBe(before);
  });

  test("selected named OAuth profile wins over Aliyun env and stale file AK/SK", async () => {
    await writeConfigFile({
      access_key_id: "fixture-default-id",
      access_key_secret: "fixture-default-secret",
    });
    const instance = await setup({
      configName: "work",
      env: {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "fixture-env-id",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fixture-env-secret",
      },
      file: {
        aliyun_oauth: profile(),
        access_key_id: "fixture-old-id",
        access_key_secret: "fixture-old-secret",
      },
      oauthSession: session({ sts: sts() }),
    });
    expect(await instance.provider.getCredential()).toMatchObject({
      ...sts(),
      method: "aliyun-oauth",
      sessionRef: REFERENCE,
      source: "config",
    });
    expect(readConfigFile().access_key_id).toBe("fixture-default-id");
    expect(transport).not.toHaveBeenCalled();
  });

  test.each([
    {
      label: "partial ID flag",
      flags: { accessKeyId: "fixture-partial-id" },
      env,
      file: { aliyun_oauth: profile() },
    },
    {
      label: "partial secret flag",
      flags: { accessKeySecret: "fixture-partial-secret" },
      env,
      file: { aliyun_oauth: profile() },
    },
    {
      label: "explicit blank flag",
      flags: { accessKeyId: " " },
      env,
      file: { aliyun_oauth: profile() },
    },
    {
      label: "partial Bailian ID env",
      env: {
        BAILIAN_ACCESS_KEY_ID: "fixture-partial-id",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fixture-other-secret",
      },
      file: { aliyun_oauth: profile() },
    },
    {
      label: "partial Bailian secret env",
      env: { BAILIAN_ACCESS_KEY_SECRET: "fixture-partial-secret" },
      file: { access_key_id: "fixture-file-id", access_key_secret: "fixture-file-secret" },
    },
    {
      label: "partial file pair",
      env: {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "fixture-env-id",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fixture-env-secret",
      },
      file: { access_key_id: "fixture-file-id" },
    },
    {
      label: "partial Aliyun env",
      env: { ALIBABA_CLOUD_ACCESS_KEY_ID: "fixture-partial-id" },
      file: {},
    },
  ])("$label never borrows the missing half from another source", async (fixture) => {
    const instance = await setup(fixture);
    expect(() => instance.provider.assertAvailable()).toThrow(CredentialError);
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(instance.store.read).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  test("security token alone does not select a source or leak into a lower-priority pair", async () => {
    const instance = await setup({
      file: {},
      flags: { securityToken: "fixture-unpaired-flag-token" },
      env: {
        BAILIAN_SECURITY_TOKEN: "fixture-unpaired-bailian-token",
        ALIBABA_CLOUD_ACCESS_KEY_ID: "fixture-aliyun-id",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fixture-aliyun-secret",
      },
    });
    expect(await instance.provider.getCredential()).toEqual({
      accessKeyId: "fixture-aliyun-id",
      accessKeySecret: "fixture-aliyun-secret",
      securityToken: undefined,
      source: "env",
    });
  });

  test("assert/describe/stored/static dry-run inspect metadata only, even with a missing secret", async () => {
    const instance = await setup({
      file: { aliyun_oauth: profile(), api_key: MODEL_KEY },
      flags: { dryRun: true },
    });
    instance.values.clear();
    const before = await configText();
    instance.provider.assertAvailable();
    instance.provider.assertAvailable("console");
    expect(instance.auth.describe()).toMatchObject({
      aliyunOAuth: profile(),
      apiKey: { token: MODEL_KEY },
    });
    expect(instance.auth.stored()).toMatchObject({
      aliyunOAuth: true,
      console: true,
      openapi: true,
      apiKey: true,
    });
    expect(buildSettings(instance.sources).dryRun).toBe(true);
    expect(instance.provider.resolveConsoleTarget(TARGET)).toEqual({
      ...TARGET,
      gateway: profile().console_gateway,
    });
    expect(instance.store.read).not.toHaveBeenCalled();
    expect(instance.store.write).not.toHaveBeenCalled();
    expect(instance.store.remove).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(await configText()).toBe(before);
  });

  test("absent named profile never falls back to the default profile's secrets", async () => {
    await writeConfigFile({ aliyun_oauth: profile(), api_key: MODEL_KEY });
    const instance = await setup({ configName: "empty", file: {} });
    expect(() => instance.provider.assertAvailable()).toThrow(CredentialError);
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(instance.store.read).not.toHaveBeenCalled();
  });
});

describe("OAuth STS lifecycle, durable rotation and single-flight", () => {
  test("valid STS is reused across calls and provider recreation without refreshing expired AT", async () => {
    const instance = await setup({
      oauthSession: session({ accessTokenExpiresAt: NOW - 1, sts: sts() }),
    });
    const before = await configText();
    const first = await instance.provider.getCredential();
    expect(await instance.provider.getCredential("console")).toEqual(first);
    const recreated = createOpenApiCredentialProvider(instance.sources, deps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    expect(await recreated.getCredential()).toEqual(first);
    expect(instance.store.read).toHaveBeenCalledTimes(2);
    expect(instance.store.write).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(await configText()).toBe(before);
  });

  test.each([30_001, 30_000, 29_999])(
    "STS expiry margin %i ms has a strict 30-second boundary",
    async (remaining) => {
      const instance = await setup({ oauthSession: session({ sts: sts(NOW + remaining) }) });
      transport.mockImplementation(async () => stsResponse());
      await instance.provider.getCredential();
      expect(transport).toHaveBeenCalledTimes(remaining > 30_000 ? 0 : 1);
      if (remaining <= 30_000)
        expect(endpointUrl(transport.mock.calls[0]![0])).toMatch(/\/v1\/exchange$/);
    },
  );

  test("valid AT exchanges STS only and writes expiry metadata, never plaintext credentials", async () => {
    const instance = await setup();
    transport.mockResolvedValue(stsResponse());
    expect(await instance.provider.getCredential()).toMatchObject({
      ...sts(),
      method: "aliyun-oauth",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [endpoint, init] = transport.mock.calls[0]!;
    expect(endpointUrl(endpoint)).toBe(`${profile().oauth_base_url}/v1/exchange`);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${ACCESS}`);
    expect(instance.saved()).toMatchObject({ refreshToken: REFRESH, sts: sts() });
    expect(readConfigFile().aliyun_oauth).toMatchObject({
      access_token_expires_at: NOW + 3600_000,
      sts_expires_at: sts().expiresAt,
    });
    expectNoPlaintextConfig(await configText());
  });

  test.each([30_001, 30_000, 0, -1])(
    "AT expiry margin %i ms refreshes only when needed before STS",
    async (remaining) => {
      const instance = await setup({
        oauthSession: session({ accessTokenExpiresAt: NOW + remaining }),
      });
      transport.mockImplementation(async (endpoint) =>
        endpointUrl(endpoint).endsWith("/v1/token") ? tokenResponse() : stsResponse(),
      );
      await instance.provider.getCredential();
      expect(
        transport.mock.calls.map(([endpoint]) => new URL(endpointUrl(endpoint)).pathname),
      ).toEqual(remaining > 30_000 ? ["/v1/exchange"] : ["/v1/token", "/v1/exchange"]);
      expect(instance.saved().refreshToken).toBe(remaining > 30_000 ? REFRESH : ROTATED_REFRESH);
      expect(instance.saved().refreshPending).not.toBe(true);
      expectNoPlaintextConfig(await configText());
    },
  );

  test("in-memory cache expires against injected now and refreshes STS without sleeping", async () => {
    const instance = await setup({
      oauthSession: session({ accessTokenExpiresAt: NOW + 7200_000, sts: sts() }),
    });
    await instance.provider.getCredential();
    clock = NOW + 3600_000 - 30_000;
    transport.mockResolvedValue(
      json({
        accessKeyId: sts().accessKeyId,
        accessKeySecret: sts().accessKeySecret,
        securityToken: sts().securityToken,
        expiration: new Date(clock + 3600_000).toISOString(),
      }),
    );
    await instance.provider.getCredential();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(instance.saved().sts?.expiresAt).toBe(clock + 3600_000);
  });

  test("parallel callers share one refresh/exchange and keep a rotated RT durable before STS", async () => {
    const instance = await setup({ oauthSession: session({ accessTokenExpiresAt: NOW }) });
    const refreshEntered = deferred<void>();
    const allowRefresh = deferred<void>();
    transport.mockImplementation(async (endpoint, init) => {
      if (endpointUrl(endpoint).endsWith("/v1/token")) {
        expect(instance.saved().refreshPending).toBe(true);
        expect(formBody(init).get("refresh_token")).toBe(REFRESH);
        refreshEntered.resolve();
        await allowRefresh.promise;
        return tokenResponse();
      }
      expect(instance.saved()).toMatchObject({
        refreshToken: ROTATED_REFRESH,
        refreshPending: false,
        accessToken: ROTATED_ACCESS,
      });
      return stsResponse();
    });
    const calls = [
      instance.provider.getCredential(),
      instance.provider.getCredential("console"),
      instance.provider.getCredential(),
    ];
    try {
      await refreshEntered.promise;
    } finally {
      allowRefresh.resolve();
    }
    const credentials = await Promise.all(calls);
    expect(credentials).toEqual([credentials[0], credentials[0], credentials[0]]);
    expect(
      transport.mock.calls.map(([endpoint]) => new URL(endpointUrl(endpoint)).pathname),
    ).toEqual(["/v1/token", "/v1/exchange"]);
    expect(instance.store.read).toHaveBeenCalledTimes(1);
    expect(instance.store.write).toHaveBeenCalledTimes(3);
  });

  test("rotated RT survives a dependent STS business failure and provider recreation never replays old RT", async () => {
    const instance = await setup({ oauthSession: session({ accessTokenExpiresAt: NOW }) });
    transport.mockImplementation(async (endpoint) => {
      if (endpointUrl(endpoint).endsWith("/v1/token")) return tokenResponse();
      expect(instance.saved().refreshToken).toBe(ROTATED_REFRESH);
      return json(
        {
          error: "fixture_business_error",
          error_description: "STS unavailable verbatim",
          requestId: "fixture-sts-request",
        },
        503,
      );
    });
    await expect(instance.provider.getCredential()).rejects.toMatchObject({
      message: "STS unavailable verbatim",
      api: { httpStatus: 503, apiCode: "fixture_business_error", requestId: "fixture-sts-request" },
    });
    expect(instance.saved()).toMatchObject({
      refreshToken: ROTATED_REFRESH,
      refreshPending: false,
    });
    const recreated = createOpenApiCredentialProvider(instance.sources, deps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    transport.mockClear().mockResolvedValue(stsResponse());
    await recreated.getCredential();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(endpointUrl(transport.mock.calls[0]![0])).toMatch(/\/v1\/exchange$/);
    expect(new Headers(transport.mock.calls[0]![1]?.headers).get("authorization")).toBe(
      `Bearer ${ROTATED_ACCESS}`,
    );
  });

  test("refresh failure leaves a durable pending marker; same and new providers refuse RT replay", async () => {
    const instance = await setup({ oauthSession: session({ accessTokenExpiresAt: NOW }) });
    const recoveryDeps = { ...deps, recoveryHint: "fixture-recovery-hint" };
    const provider = createOpenApiCredentialProvider(instance.sources, recoveryDeps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    transport.mockResolvedValue(
      json(
        {
          error: "invalid_grant",
          error_description: "Refresh rejected verbatim",
          requestId: "fixture-refresh-request",
        },
        400,
      ),
    );
    await expect(provider.getCredential()).rejects.toMatchObject({
      message: "Refresh rejected verbatim",
      hint: "fixture-recovery-hint",
      api: { httpStatus: 400, apiCode: "invalid_grant", requestId: "fixture-refresh-request" },
    });
    expect(instance.saved().refreshPending).toBe(true);
    await expect(provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    const recreated = createOpenApiCredentialProvider(instance.sources, deps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    await expect(recreated.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("failure to save rotated RT blocks business requests and leaves old RT marked unsafe", async () => {
    const instance = await setup({ oauthSession: session({ accessTokenExpiresAt: NOW }) });
    const write = instance.store.write.getMockImplementation()!;
    instance.store.write.mockImplementation(async (reference, raw) => {
      if ((JSON.parse(raw) as AliyunOAuthSession).refreshToken === ROTATED_REFRESH)
        throw new Error("fixture-storage-failed");
      await write(reference, raw);
    });
    transport.mockResolvedValue(tokenResponse());
    await expect(instance.provider.getCredential()).rejects.toThrow("fixture-storage-failed");
    expect(instance.saved()).toMatchObject({ refreshToken: REFRESH, refreshPending: true });
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    const recreated = createOpenApiCredentialProvider(instance.sources, deps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    await expect(recreated.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(endpointUrl(transport.mock.calls[0]![0])).toMatch(/\/v1\/token$/);
  });

  test("failure to save pending marker sends no refresh or business request", async () => {
    const instance = await setup({ oauthSession: session({ accessTokenExpiresAt: NOW }) });
    instance.store.write.mockRejectedValue(new Error("fixture-pending-save-failed"));
    await expect(instance.provider.getCredential()).rejects.toThrow("fixture-pending-save-failed");
    expect(instance.saved().refreshPending).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
  });

  test("preexisting pending state rejects even otherwise-valid STS", async () => {
    const instance = await setup({ oauthSession: session({ refreshPending: true, sts: sts() }) });
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(instance.store.write).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  test.each(
    [
      undefined,
      "not-json",
      "null",
      "[]",
      "{}",
      JSON.stringify(session({ accessTokenExpiresAt: Infinity })),
      JSON.stringify(session({ sts: { ...sts(), securityToken: "" } })),
    ].map((raw) => ({ raw })),
  )("missing or corrupt opaque session $raw fails before requests", async ({ raw }) => {
    const instance = await setup();
    if (raw === undefined) instance.values.clear();
    else instance.values.set(REFERENCE, raw);
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(transport).not.toHaveBeenCalled();
    expect(instance.store.write).not.toHaveBeenCalled();
  });
});

describe("Console cache and endpoint isolation", () => {
  test("Console tokens are scoped by switchAgent and gateway and survive provider recreation only in opaque storage", async () => {
    const instance = await setup();
    const target = instance.provider.resolveConsoleTarget(TARGET);
    const credential: ConsoleCredential = {
      ...target,
      token: "fixture-console-token",
      method: "aliyun-oauth",
      sessionRef: REFERENCE,
      configurationFingerprint: oauthConfigurationFingerprint(profile()),
      expiresAt: NOW + 3600_000,
      source: "config",
    };
    await instance.provider.saveConsoleCredential(credential);
    await instance.provider.saveConsoleCredential({
      ...credential,
      token: "fixture-agent-console-token",
      switchAgent: 7,
    });
    expect(await instance.provider.getConsoleCredential(TARGET)).toEqual(credential);
    expect(
      await instance.provider.getConsoleCredential({ ...TARGET, switchAgent: 7 }),
    ).toMatchObject({ token: "fixture-agent-console-token" });
    expect(
      await instance.provider.getConsoleCredential({ ...TARGET, switchAgent: 8 }),
    ).toBeUndefined();
    const recreated = createOpenApiCredentialProvider(instance.sources, deps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    expect(await recreated.getConsoleCredential(TARGET)).toEqual(credential);
    expect(Object.keys(instance.saved().consoleTokens!)).toHaveLength(2);
    expect(transport).not.toHaveBeenCalled();
    expectNoPlaintextConfig(await configText());
  });

  test.each([
    { ...TARGET, region: "cn-shanghai" },
    { ...TARGET, site: "international" as const },
    { ...TARGET, gateway: "https://different-console.example.test" },
  ])("rejects mismatched Console target %j without reading secrets", async (target) => {
    const instance = await setup();
    expect(() => instance.provider.resolveConsoleTarget(target)).toThrow(UsageError);
    await expect(instance.provider.getConsoleCredential(target)).rejects.toBeInstanceOf(UsageError);
    await expect(
      instance.provider.saveConsoleCredential({
        ...target,
        token: "fixture-console-token",
        method: "aliyun-oauth",
        sessionRef: REFERENCE,
        configurationFingerprint: oauthConfigurationFingerprint(profile()),
        source: "config",
      }),
    ).rejects.toBeInstanceOf(UsageError);
    expect(instance.store.read).not.toHaveBeenCalled();
    expect(instance.store.write).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  test("cache keys distinguish gateway, region, site and switchAgent including zero", () => {
    const targets = [
      TARGET,
      { ...TARGET, gateway: profile().console_gateway },
      { ...TARGET, region: "cn-shanghai" },
      { ...TARGET, site: "international" as const },
      { ...TARGET, switchAgent: 0 },
      { ...TARGET, switchAgent: 1 },
    ];
    expect(new Set(targets.map(consoleCredentialKey)).size).toBe(targets.length);
  });

  test("changing explicit gateway on the same session cannot reuse tokens from the old gateway", async () => {
    const instance = await setup();
    await instance.provider.saveConsoleCredential({
      ...TARGET,
      token: "fixture-console-token",
      method: "aliyun-oauth",
      sessionRef: REFERENCE,
      configurationFingerprint: oauthConfigurationFingerprint(profile()),
      source: "config",
    });
    await writeConfigFile({
      aliyun_oauth: profile({ console_gateway: "https://other-console.example.test" }),
    });
    await expect(instance.provider.getConsoleCredential(TARGET)).rejects.toBeInstanceOf(
      CredentialError,
    );
    expect(instance.provider.resolveConsoleTarget(TARGET).gateway).toBe(
      "https://other-console.example.test",
    );
  });

  test.each([30_001, 30_000, 0])(
    "Console cached expiry %i ms returns only a valid token and never writes plaintext",
    async (remaining) => {
      const instance = await setup();
      await instance.provider.saveConsoleCredential({
        ...TARGET,
        token: "fixture-console-token",
        expiresAt: NOW + remaining,
        method: "aliyun-oauth",
        sessionRef: REFERENCE,
        configurationFingerprint: oauthConfigurationFingerprint(profile()),
        source: "config",
      });
      const before = await configText();
      const credential = await instance.provider.getConsoleCredential(TARGET);
      expect(credential?.token).toBe(remaining > 30_000 ? "fixture-console-token" : undefined);
      expect(await configText()).toBe(before);
      expectNoPlaintextConfig(before);
      expect(transport).not.toHaveBeenCalled();
    },
  );

  test("unexpired Console token becomes unavailable when injected time enters safety margin", async () => {
    const instance = await setup();
    await instance.provider.saveConsoleCredential({
      ...TARGET,
      token: "fixture-console-token",
      expiresAt: NOW + 60_000,
      method: "aliyun-oauth",
      sessionRef: REFERENCE,
      configurationFingerprint: oauthConfigurationFingerprint(profile()),
      source: "config",
    });
    expect(await instance.provider.getConsoleCredential(TARGET)).toBeDefined();
    clock += 30_000;
    expect(await instance.provider.getConsoleCredential(TARGET)).toBeUndefined();
    expectNoPlaintextConfig(await configText());
  });

  test("separate providers merge Console cache writes under the real session lock", async () => {
    const instance = await setup();
    const second = createOpenApiCredentialProvider(instance.sources, deps, {
      store: instance.store,
      directory: isolation.configDir,
    });
    await Promise.all([
      instance.provider.saveConsoleCredential({
        ...TARGET,
        token: "fixture-console-token",
        method: "aliyun-oauth",
        sessionRef: REFERENCE,
        configurationFingerprint: oauthConfigurationFingerprint(profile()),
        source: "config",
      }),
      second.saveConsoleCredential({
        ...TARGET,
        switchAgent: 7,
        token: "fixture-agent-token",
        method: "aliyun-oauth",
        sessionRef: REFERENCE,
        configurationFingerprint: oauthConfigurationFingerprint(profile()),
        source: "config",
      }),
    ]);
    expect(Object.keys(instance.saved().consoleTokens!)).toHaveLength(2);
  });

  test("temporary static credentials and their derived Console token never persist into OAuth storage", async () => {
    const instance = await setup({
      file: {},
      env: {
        BAILIAN_ACCESS_KEY_ID: "fixture-temp-id",
        BAILIAN_ACCESS_KEY_SECRET: "fixture-temp-secret",
        BAILIAN_SECURITY_TOKEN: "fixture-temp-token",
      },
    });
    const before = await configText();
    await instance.provider.getCredential("console");
    await instance.provider.saveConsoleCredential({
      ...TARGET,
      token: "fixture-console-token",
      source: "env",
    });
    expect(await instance.provider.getConsoleCredential(TARGET)).toBeUndefined();
    expect(instance.store.read).not.toHaveBeenCalled();
    expect(instance.store.write).not.toHaveBeenCalled();
    expect(await configText()).toBe(before);
  });

  test("routes ModelStudio/BailianControl only to explicit profile hosts, leaving unknown hosts alone", async () => {
    const instance = await setup({ oauthSession: session({ sts: sts() }) });
    const credential = await instance.provider.getCredential();
    expect(instance.provider.resolveHost("modelstudio.aliyuncs.com", credential)).toBe(
      profile().modelstudio_host,
    );
    expect(
      instance.provider.resolveHost("modelstudio.cn-beijing.aliyuncs.com", credential, "console"),
    ).toBe(profile().modelstudio_host);
    expect(instance.provider.resolveHost("bailiancontrol.aliyuncs.com", credential)).toBe(
      profile().bailiancontrol_host,
    );
    expect(
      instance.provider.resolveHost("bailiancontrol.cn-beijing.aliyuncs.com", credential),
    ).toBe(profile().bailiancontrol_host);
    expect(instance.provider.resolveHost("unknown.example.test", credential)).toBe(
      "unknown.example.test",
    );
  });

  test("BailianControl without an explicit host fails locally instead of guessing endpoints", async () => {
    const instance = await setup({
      file: { aliyun_oauth: profile({ bailiancontrol_host: undefined }) },
    });
    expect(() => instance.provider.resolveHost("bailiancontrol.aliyuncs.com")).toThrow(UsageError);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("Profile references, login and domain-specific logout", () => {
  test("the default file store survives new providers, persists rotated tokens and removes only the session on logout", async () => {
    const configPath = join(isolation.configDir, "config.json");
    const sources: ResolutionSources = { flags: {}, env: {}, file: {}, configPath };
    const auth = makeAuthStore(sources, deps);
    await writeConfigFile({ api_key: MODEL_KEY });
    await auth.loginAliyun(profile(), session({ accessTokenExpiresAt: NOW, sts: sts(NOW) }));

    const file = readConfigFile(undefined, configPath);
    const metadata = file.aliyun_oauth!;
    const sessionPath = join(isolation.configDir, "oauth", `${metadata.session_ref}.json`);
    expect(JSON.parse(await readFile(sessionPath, "utf8"))).toMatchObject({
      reference: metadata.session_ref,
      session: { accessToken: ACCESS, refreshToken: REFRESH },
    });
    expectNoPlaintextConfig(await configText());
    const provider = createOpenApiCredentialProvider({ ...sources, file }, deps);
    transport
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(stsResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await provider.getCredential()).toMatchObject({
      method: "aliyun-oauth",
      expiresAt: NOW + 3600_000,
    });
    expect(JSON.parse(await readFile(sessionPath, "utf8"))).toMatchObject({
      session: { refreshToken: ROTATED_REFRESH, refreshPending: false },
    });
    expectNoPlaintextConfig(await configText());
    expect(await makeAuthStore(sources, deps).logout("aliyun")).toBe(true);
    expect(transport.mock.calls.map(([input]) => new URL(endpointUrl(input)).pathname)).toEqual([
      "/v1/token",
      "/v1/exchange",
      "/v1/revoke",
    ]);
    expect(formBody(transport.mock.calls[2]?.[1]).get("token")).toBe(ROTATED_REFRESH);
    await expect(readFile(sessionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(readConfigFile()).toEqual({
      api_key: MODEL_KEY,
      console_region: "cn-beijing",
      console_site: "domestic",
    });
  });

  test("named login stores only metadata, activates selected profile and preserves model key and other profiles", async () => {
    await writeConfigFile({ api_key: MODEL_KEY });
    const instance = await setup({ file: {}, configName: "work", flags: { config: "work" } });
    await instance.auth.loginAliyun(profile(), session({ sts: sts() }));
    const named = readConfigFile("work").aliyun_oauth!;
    expect(named.session_ref).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(named.session_ref).not.toBe(REFERENCE);
    expect(instance.values.get(named.session_ref)).toBe(JSON.stringify(session({ sts: sts() })));
    expect(readConfigProfiles().active).toBe("work");
    expect(readConfigFile().api_key).toBe(MODEL_KEY);
    expect(readConfigFile("work")).toMatchObject({
      console_region: "cn-beijing",
      console_site: "domestic",
    });
    expectNoPlaintextConfig(await configText());
  });

  test("secure login write failure leaves previous metadata and session untouched", async () => {
    const instance = await setup();
    const before = await configText();
    instance.store.write.mockRejectedValue(new Error("fixture-login-storage-failed"));
    await expect(instance.auth.loginAliyun(profile(), session())).rejects.toThrow(
      "fixture-login-storage-failed",
    );
    expect(await configText()).toBe(before);
    expect(instance.saved()).toEqual(session());
    expect(instance.store.remove).not.toHaveBeenCalled();
  });

  test("relogin uses a new reference and invalidates credentials held by the old provider", async () => {
    const instance = await setup({ oauthSession: session({ sts: sts() }) });
    const previous = await instance.provider.getCredential();
    await instance.auth.loginAliyun(
      profile(),
      session({
        accessToken: ROTATED_ACCESS,
        refreshToken: ROTATED_REFRESH,
        sts: { ...sts(), accessKeyId: "fixture-new-sts-id" },
      }),
    );
    const nextReference = readConfigFile().aliyun_oauth!.session_ref;
    expect(nextReference).not.toBe(REFERENCE);
    expect(instance.values.has(REFERENCE)).toBe(false);
    expect(() => instance.provider.resolveHost("modelstudio.aliyuncs.com", previous)).toThrow(
      CredentialError,
    );
    const next = await instance.provider.getCredential();
    expect(next.sessionRef).toBe(nextReference);
    expect(next.accessKeyId).toBe("fixture-new-sts-id");
    expect(transport).not.toHaveBeenCalled();
  });

  test("provider is pinned to its selected profile even when active profile changes", async () => {
    const instance = await setup({ configName: "first", oauthSession: session({ sts: sts() }) });
    await writeConfigFile({ aliyun_oauth: profile({ session_ref: OTHER_REFERENCE }) }, "second");
    instance.values.set(
      OTHER_REFERENCE,
      JSON.stringify(session({ sts: { ...sts(), accessKeyId: "fixture-other-profile-id" } })),
    );
    await activateConfigProfile("second");
    expect((await instance.provider.getCredential()).sessionRef).toBe(REFERENCE);
    await expect(deleteConfigProfile("first")).rejects.toThrow(/OAuth/);
    transport.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await instance.auth.logout("aliyun");
    await deleteConfigProfile("first");
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(readConfigFile("first").aliyun_oauth).toBeUndefined();
  });

  test("reference removal during an exchange never restores old metadata or returns old credentials", async () => {
    const instance = await setup();
    const exchangeEntered = deferred<void>();
    const allowExchange = deferred<void>();
    transport.mockImplementation(async () => {
      exchangeEntered.resolve();
      await allowExchange.promise;
      return stsResponse();
    });
    const outcome = instance.provider.getCredential().then(
      () => undefined,
      (error: unknown) => error,
    );
    try {
      await exchangeEntered.promise;
      await writeConfigFile({ api_key: MODEL_KEY });
    } finally {
      allowExchange.resolve();
    }
    expect(await outcome).toBeInstanceOf(CredentialError);
    expect(readConfigFile().aliyun_oauth).toBeUndefined();
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(readConfigFile().api_key).toBe(MODEL_KEY);
  });

  test("failed revoke preserves retryable local state; successful OAuth logout preserves model API key", async () => {
    const instance = await setup({
      file: { aliyun_oauth: profile(), api_key: MODEL_KEY, base_url: "https://model.example.test" },
      oauthSession: session({ sts: sts() }),
    });
    const credential = await instance.provider.getCredential();
    const before = await configText();
    const secretBefore = instance.values.get(REFERENCE);
    transport.mockResolvedValue(
      json({ error: "temporarily_unavailable", error_description: "fixture-revoke-error" }, 503),
    );
    await expect(instance.auth.logout("aliyun")).rejects.toBeInstanceOf(BailianError);
    expect(await configText()).toBe(before);
    expect(instance.values.get(REFERENCE)).toBe(secretBefore);
    expect(instance.store.remove).not.toHaveBeenCalled();
    transport.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await instance.auth.logout("aliyun")).toBe(true);
    expect(readConfigFile()).toMatchObject({
      api_key: MODEL_KEY,
      base_url: "https://model.example.test",
    });
    expect(readConfigFile().aliyun_oauth).toBeUndefined();
    expect(instance.values.has(REFERENCE)).toBe(false);
    expect(() => instance.provider.resolveHost("modelstudio.aliyuncs.com", credential)).toThrow(
      CredentialError,
    );
    await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
    expect(await instance.auth.logout("aliyun")).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  test.each(["console", "openapi"] as const)(
    "%s logout disables only its own OAuth domain and does not revoke shared RT",
    async (scope) => {
      const cacheKey = consoleCredentialKey({ ...TARGET, gateway: profile().console_gateway });
      const instance = await setup({
        file: {
          aliyun_oauth: profile(),
          api_key: MODEL_KEY,
          access_token: "fixture-static-console",
          access_key_id: "fixture-static-id",
          access_key_secret: "fixture-static-secret",
          security_token: "fixture-static-token",
        },
        oauthSession: session({
          sts: sts(),
          consoleTokens: {
            [cacheKey]: { token: "fixture-console-token", expiresAt: NOW + 3600_000 },
          },
        }),
      });
      await instance.provider.getCredential();
      expect(await instance.auth.logout(scope)).toBe(true);
      expect(readConfigFile().aliyun_oauth).toMatchObject({
        session_ref: REFERENCE,
        console_enabled: scope !== "console",
        openapi_enabled: scope !== "openapi",
      });
      expect(readConfigFile().api_key).toBe(MODEL_KEY);
      expect(instance.saved().refreshToken).toBe(REFRESH);
      expect(instance.store.remove).not.toHaveBeenCalled();
      if (scope === "console") {
        expect(readConfigFile().access_token).toBeUndefined();
        expect(instance.saved().consoleTokens).toEqual({});
        expect(await instance.provider.getConsoleCredential(TARGET)).toBeUndefined();
        expect((await instance.provider.getCredential()).method).toBe("aliyun-oauth");
      } else {
        expect(readConfigFile().access_key_id).toBeUndefined();
        expect(readConfigFile().access_key_secret).toBeUndefined();
        expect(readConfigFile().security_token).toBeUndefined();
        expect((await instance.provider.getCredential("console")).method).toBe("aliyun-oauth");
        expect((await instance.provider.getConsoleCredential(TARGET))?.token).toBe(
          "fixture-console-token",
        );
        await expect(instance.provider.getCredential()).rejects.toBeInstanceOf(CredentialError);
      }
      expect(transport).not.toHaveBeenCalled();
    },
  );

  test.each(["console", "openapi"] as const)(
    "static %s login disables only the replaced OAuth domain",
    async (domain) => {
      const instance = await setup({ oauthSession: session({ sts: sts() }) });
      await instance.auth.login(
        domain === "console"
          ? { access_token: "fixture-static-console" }
          : { access_key_id: "fixture-static-id", access_key_secret: "fixture-static-secret" },
      );
      expect(readConfigFile().aliyun_oauth).toMatchObject({
        console_enabled: domain !== "console",
        openapi_enabled: domain !== "openapi",
        session_ref: REFERENCE,
      });
      expect(instance.values.has(REFERENCE)).toBe(true);
      expect(instance.store.remove).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );

  test("all logout clears every credential, while preserving unrelated settings and other profiles", async () => {
    const instance = await setup({
      file: {
        aliyun_oauth: profile(),
        api_key: MODEL_KEY,
        base_url: "https://model.example.test",
        access_token: "fixture-static-console",
        access_key_id: "fixture-static-id",
        access_key_secret: "fixture-static-secret",
        security_token: "fixture-static-token",
        workspace_id: "fixture-workspace",
        output: "json",
      },
    });
    await writeConfigFile({ api_key: "fixture-other-model-key" }, "other");
    transport.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await instance.auth.logout("all")).toBe(true);
    const file = readConfigFile();
    for (const field of [
      "api_key",
      "base_url",
      "aliyun_oauth",
      "access_token",
      "access_key_id",
      "access_key_secret",
      "security_token",
    ] as const)
      expect(file[field]).toBeUndefined();
    expect(file).toMatchObject({ workspace_id: "fixture-workspace", output: "json" });
    expect(readConfigFile("other").api_key).toBe("fixture-other-model-key");
    expect(instance.values.size).toBe(0);
    expect(await instance.auth.logout("all")).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

interface FixtureChild {
  process: ChildProcess;
  completion: Promise<{ code: number | null; stdout: string; stderr: string }>;
  contended: Promise<void>;
}

function startLockContender(sources: ResolutionSources, fakeFile: string): FixtureChild {
  const providerUrl = new URL("../src/auth/openapi-provider.ts", import.meta.url).href;
  const transportUrl = new URL("../src/client/transport.ts", import.meta.url).href;
  const loaderUrl = new URL("../src/config/loader.ts", import.meta.url).href;
  const script = `
    import files from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { createOpenApiCredentialProvider, oauthSessionLockPath } from ${JSON.stringify(providerUrl)};
    import { httpTransport } from ${JSON.stringify(transportUrl)};
    import { readConfigFile } from ${JSON.stringify(loaderUrl)};
    const sources = ${JSON.stringify(sources)};
    sources.file = readConfigFile(sources.configName);
    const directory = ${JSON.stringify(isolation.configDir)};
    const fakeFile = ${JSON.stringify(fakeFile)};
    const lockPath = oauthSessionLockPath(directory, sources.file.aliyun_oauth.session_ref);
    const actualOpen = files.open;
    files.open = async (...args) => {
      try { return await actualOpen(...args); }
      catch (error) {
        if (String(args[0]) === lockPath && error.code === 'EEXIST') process.send({ type: 'contended' });
        throw error;
      }
    };
    syncBuiltinESMExports();
    httpTransport.fetch = async () => { throw new Error('A second process must reuse durable STS, not replay RT'); };
    const store = {
      read: async () => files.readFile(fakeFile, 'utf8'),
      write: async () => { throw new Error('A second process must not overwrite this fixture session'); },
      remove: async () => { throw new Error('Unexpected removal'); },
    };
    const provider = createOpenApiCredentialProvider(sources, {
      identity: ${JSON.stringify(deps.identity)}, timeout: 5, now: () => ${NOW},
    }, { store, directory });
    const credential = await provider.getCredential();
    process.stdout.write(JSON.stringify({ accessKeyId: credential.accessKeyId, sessionRef: credential.sessionRef }));
    process.disconnect();
  `;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      // Explicit environment: never inherit HOME credentials, proxy or NODE_OPTIONS/preload.
      env: {
        PATH: process.env.PATH,
        HOME: isolation.home,
        USERPROFILE: isolation.home,
        XDG_CONFIG_HOME: join(isolation.home, ".config"),
        BAILIAN_CONFIG_DIR: isolation.configDir,
        BL_SKIP_HOST_AGENTS: "1",
        DO_NOT_TRACK: "1",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  const deadline = setTimeout(() => child.kill(), 10_000);
  child.once("close", () => clearTimeout(deadline));
  child.once("error", () => clearTimeout(deadline));
  let stdout = "";
  let stderr = "";
  child.stdout!.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const completion = new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveCompletion, rejectCompletion) => {
      child.once("error", rejectCompletion);
      child.once("close", (code) => resolveCompletion({ code, stdout, stderr }));
    },
  );
  const contended = new Promise<void>((resolveContention, rejectContention) => {
    child.on("message", (message: unknown) => {
      if ((message as { type?: string }).type === "contended") resolveContention();
    });
    child.once("error", rejectContention);
    child.once("close", () =>
      rejectContention(new Error(`Child closed before lock contention: ${stderr}`)),
    );
  });
  return { process: child, completion, contended };
}

describe("OAuth credential binding regressions", () => {
  test("a late Console token cannot overwrite a newly signed-in session", async () => {
    const instance = await setup({ oauthSession: session({ sts: sts() }) });
    const oldCredential: ConsoleCredential = {
      ...TARGET,
      gateway: profile().console_gateway,
      token: "old-console",
      source: "config",
      method: "aliyun-oauth",
      sessionRef: REFERENCE,
      configurationFingerprint: oauthConfigurationFingerprint(profile()),
    };
    await instance.auth.loginAliyun(
      profile(),
      session({
        sts: sts(),
        consoleTokens: {
          [consoleCredentialKey({ ...TARGET, gateway: profile().console_gateway })]: {
            token: "new-console",
          },
        },
      }),
    );
    const nextReference = readConfigFile().aliyun_oauth!.session_ref;
    const before = instance.values.get(nextReference);
    await instance.provider.saveConsoleCredential(oldCredential);
    expect(instance.values.get(nextReference)).toBe(before);
    expect((await instance.provider.getConsoleCredential(TARGET))?.token).toBe("new-console");
    expect(transport).not.toHaveBeenCalled();
  });

  test("endpoint changes during STS exchange stop the caller and preserve new metadata", async () => {
    const instance = await setup();
    const entered = deferred<void>();
    const release = deferred<void>();
    transport.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return stsResponse();
    });
    const result = instance.provider.getCredential();
    await entered.promise;
    await writeConfigFile({ aliyun_oauth: profile({ modelstudio_host: "changed.example.test" }) });
    const before = await configText();
    release.resolve();
    await expect(result).rejects.toBeInstanceOf(CredentialError);
    expect(await configText()).toBe(before);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("credential endpoint fingerprint is checked again before signing", async () => {
    const instance = await setup({ oauthSession: session({ sts: sts() }) });
    const credential = await instance.provider.getCredential();
    await writeConfigFile({ aliyun_oauth: profile({ modelstudio_host: "changed.example.test" }) });
    expect(() =>
      instance.provider.resolveHost("modelstudio.cn-beijing.aliyuncs.com", credential),
    ).toThrow(CredentialError);
    expect(transport).not.toHaveBeenCalled();
  });

  test("provider and auth store stay in their original configuration directory", async () => {
    const instance = await setup({ configName: "first", oauthSession: session({ sts: sts() }) });
    const another = enterIsolatedHome();
    try {
      await writeConfigFile({ aliyun_oauth: profile({ session_ref: OTHER_REFERENCE }) });
      const before = readConfigFile();
      expect((await instance.provider.getCredential()).sessionRef).toBe(REFERENCE);
      await instance.auth.login({ workspace_id: "first-workspace" });
      expect(readConfigFile()).toEqual(before);
      expect(readConfigFile("first", instance.sources.configPath).workspace_id).toBe(
        "first-workspace",
      );
      expect(instance.auth.describe().aliyunOAuth?.session_ref).toBe(REFERENCE);
    } finally {
      another.restore();
    }
    expect(transport).not.toHaveBeenCalled();
  });

  test("environment credential inputs are snapshotted for the invocation", async () => {
    const instance = await setup({
      file: {},
      env: { BAILIAN_ACCESS_KEY_ID: "first-id", BAILIAN_ACCESS_KEY_SECRET: "first-secret" },
    });
    instance.sources.env.BAILIAN_ACCESS_KEY_ID = "second-id";
    instance.sources.env.BAILIAN_ACCESS_KEY_SECRET = "second-secret";
    expect((await instance.provider.getCredential()).accessKeyId).toBe("first-id");
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("cross-process OAuth session serialization", () => {
  test("a real child waits on the shared session lock and reuses the parent's rotated session without RT replay", async () => {
    // Necessary process boundary: a per-provider single-flight Map cannot protect a second CLI process.
    // One parent/child pair exercises the actual EEXIST lock path and durable refresh recovery;
    // the on-disk store contains only synthetic fixture JSON, never an OS key or real credentials.
    const instance = await setup({ oauthSession: session({ accessTokenExpiresAt: NOW }) });
    const fakeFile = join(isolation.configDir, "fixture-session.json");
    await writeFile(fakeFile, JSON.stringify(session({ accessTokenExpiresAt: NOW })), {
      mode: 0o600,
    });
    const store: OAuthSecretStore = {
      read: async () => readFile(fakeFile, "utf8"),
      write: async (_reference, raw) => {
        await writeFile(fakeFile, raw, { mode: 0o600 });
      },
      remove: async () => {
        throw new Error("Unexpected fixture removal");
      },
    };
    const provider = createOpenApiCredentialProvider(instance.sources, deps, {
      store,
      directory: isolation.configDir,
    });
    const refreshEntered = deferred<void>();
    const allowRefresh = deferred<void>();
    transport.mockImplementation(async (endpoint) => {
      if (endpointUrl(endpoint).endsWith("/v1/token")) {
        refreshEntered.resolve();
        await allowRefresh.promise;
        return tokenResponse();
      }
      expect(JSON.parse(await readFile(fakeFile, "utf8"))).toMatchObject({
        refreshToken: ROTATED_REFRESH,
        refreshPending: false,
      });
      return stsResponse();
    });
    const parentResult = provider.getCredential();
    let child: FixtureChild | undefined;
    try {
      await refreshEntered.promise;
      child = startLockContender(instance.sources, fakeFile);
      await child.contended;
      expect(JSON.parse(await readFile(fakeFile, "utf8"))).toMatchObject({
        refreshPending: true,
        refreshToken: REFRESH,
      });
      allowRefresh.resolve();
      const [parent, result] = await Promise.all([parentResult, child.completion]);
      expect(result.code, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        accessKeyId: parent.accessKeyId,
        sessionRef: parent.sessionRef,
      });
      expect(
        transport.mock.calls.map(([endpoint]) => new URL(endpointUrl(endpoint)).pathname),
      ).toEqual(["/v1/token", "/v1/exchange"]);
      expect(JSON.parse(await readFile(fakeFile, "utf8"))).toMatchObject({
        refreshToken: ROTATED_REFRESH,
        refreshPending: false,
        sts: sts(),
      });
      expect(await readdir(join(isolation.configDir, "oauth"))).toEqual([]);
      expectNoPlaintextConfig(await configText());
    } finally {
      allowRefresh.resolve();
      await parentResult.catch(() => {});
      if (child) {
        if (child.process.exitCode === null) child.process.kill();
        await child.completion.catch(() => {});
      }
    }
  });
});
