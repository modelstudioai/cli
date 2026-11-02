import { afterEach, expect, test, vi } from "vite-plus/test";
import { buildIsolatedCliEnv, withIsolatedHome } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import {
  Client,
  defineCommand,
  CredentialError,
  buildSettings,
  describeAuthState,
  httpTransport,
  readConfigFile,
  writeConfigFile,
  type ConfigFile,
  type ResolutionSources,
} from "bailian-cli-core";
import { authStage, type RunContext } from "../src/middleware.ts";
import { createOutputReporter } from "../src/output/reporter.ts";
import { createCli } from "../src/create-cli.ts";

const identity = { binName: "bl", version: "test", npmPackage: "test", clientName: "test" };
const envCredentials = {
  BAILIAN_ACCESS_KEY_ID: "bailian-ak",
  BAILIAN_ACCESS_KEY_SECRET: "bailian-sk",
  BAILIAN_SECURITY_TOKEN: "bailian-sts",
};
const hostCredentials = {
  ALIBABA_CLOUD_ACCESS_KEY_ID: "host-ak",
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: "host-sk",
  ALIBABA_CLOUD_SECURITY_TOKEN: "host-sts",
};
afterEach(() => vi.restoreAllMocks());

async function context(
  file: ConfigFile = {},
  env: NodeJS.ProcessEnv = {},
  flags: ResolutionSources["flags"] = {},
  prepared = false,
) {
  await writeConfigFile({ ...file }, "selected");
  const sources: ResolutionSources = { file, env, flags, configName: "selected" };
  const settings = buildSettings(sources);
  return {
    identity,
    settings,
    sources,
    command: {
      auth: "console",
      ...(prepared
        ? { prepare: async () => ({ data: undefined, preview: {}, risk: null, notices: [] }) }
        : {}),
    },
    client: new Client({ identity, settings, baseUrl: "https://dashscope.aliyuncs.com" }),
    output: createOutputReporter({ settings: { output: "json", quiet: true, verbose: false } })
      .output,
  } as unknown as RunContext;
}

function backend(
  options: {
    rejectNew?: boolean;
    permission?: boolean;
    generationFailure?: boolean;
    generation?: () => Promise<Response>;
    gateway?: (url: URL, headers: Headers) => Promise<Response>;
  } = {},
) {
  const calls: Array<{ url: URL; headers: Headers; body: string }> = [];
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers, body: typeof init?.body === "string" ? init.body : "" });
    if (url.pathname === "/modelstudio/cli/generateAccessToken") {
      if (options.generation) return options.generation();
      return options.generationFailure
        ? Response.json(
            {
              Message: "original generation denial",
              Code: "Denied",
              RequestId: "generation-request",
            },
            { status: 403 },
          )
        : Response.json({ cliAccessToken: "fresh-token" });
    }
    if (url.pathname !== "/cli/api.json") throw new Error(`Unexpected request: ${url.pathname}`);
    if (options.gateway) return options.gateway(url, headers);
    if (options.permission)
      return Response.json({ data: { success: false, errorCode: "Original.Permission.Denied" } });
    if (headers.get("authorization") === "Bearer old-token" || options.rejectNew) {
      return Response.json({
        data: { success: false, errorCode: "BailianGateway.Login.NotLogined" },
      });
    }
    return Response.json({ data: { success: true, value: "result" } });
  });
  return {
    calls,
    generations: () =>
      calls.filter((call) => call.url.pathname === "/modelstudio/cli/generateAccessToken"),
    gateways: () => calls.filter((call) => call.url.pathname === "/cli/api.json"),
  };
}

test.each([
  {
    name: "bailian-env",
    env: { ...envCredentials, ...hostCredentials },
    file: {},
    key: "bailian-ak",
    sts: "bailian-sts",
  },
  {
    name: "config",
    env: hostCredentials,
    file: { access_key_id: "local-ak", access_key_secret: "local-sk" },
    key: "local-ak",
    sts: null,
  },
  { name: "host-env", env: hostCredentials, file: {}, key: "host-ak", sts: "host-sts" },
])(
  "empty token exchanges selected credentials once and stays in memory: $name",
  async ({ env, file, key, sts }) => {
    await withIsolatedHome(async () => {
      const ctx = await context(file, env);
      const before = readConfigFile("selected");
      const requests = backend();
      await authStage(ctx, async () => {
        expect(requests.calls).toHaveLength(0);
        await expect(ctx.client.console("test.api", {})).resolves.toMatchObject({
          data: { value: "result" },
        });
        await ctx.client.console("test.other", {});
      });
      expect(requests.generations()).toHaveLength(1);
      expect(requests.generations()[0]!.headers.get("authorization")).toContain(
        `Credential=${key}`,
      );
      expect(requests.generations()[0]!.headers.get("x-acs-security-token")).toBe(sts);
      expect(requests.gateways().map((call) => call.headers.get("authorization"))).toEqual([
        "Bearer fresh-token",
        "Bearer fresh-token",
      ]);
      expect(readConfigFile("selected")).toEqual(before);
      expect(readConfigFile().access_token).toBeUndefined();
    });
  },
);

test("existing token is used without resolving unused partial AK/SK", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context(
      { access_token: "valid-token" },
      { BAILIAN_ACCESS_KEY_ID: "partial" },
    );
    const requests = backend();
    await authStage(ctx, () => ctx.client.console("test.api", {}).then(() => {}));
    expect(requests.generations()).toHaveLength(0);
    expect(requests.gateways()).toHaveLength(1);
  });
});

test.each([false, true])(
  "expired local token uses environment credentials without persisting them, rejectNew=%s",
  async (rejectNew) => {
    await withIsolatedHome(async () => {
      const file = {
        access_token: "old-token",
        console_region: "ap-southeast-1",
        console_site: "international",
        console_switch_agent: 77,
      } as const;
      const ctx = await context(file, envCredentials);
      const requests = backend({ rejectNew });
      const run = () => authStage(ctx, () => ctx.client.console("test.api", {}).then(() => {}));
      if (rejectNew) await expect(run()).rejects.toBeInstanceOf(CredentialError);
      else await run();
      expect(requests.generations()).toHaveLength(1);
      expect(requests.generations()[0]!.url.hostname).toBe(
        "modelstudio.ap-southeast-1.aliyuncs.com",
      );
      expect(requests.gateways()).toHaveLength(2);
      for (const call of requests.gateways()) {
        expect(call.url.hostname).toBe("bailian-singapore-cs.alibabacloud.com");
        expect(
          JSON.parse(new URLSearchParams(call.body).get("params")!).Data.cornerstoneParam
            .switchAgent,
        ).toBe(77);
      }
      expect(readConfigFile("selected")).toEqual(file);
    });
  },
);

test("a rejected newly acquired token does not trigger another exchange", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, hostCredentials);
    const requests = backend({ rejectNew: true });
    await expect(
      authStage(ctx, () => ctx.client.console("test.api", {}).then(() => {})),
    ).rejects.toBeInstanceOf(CredentialError);
    expect(requests.generations()).toHaveLength(1);
    expect(requests.gateways()).toHaveLength(1);
    expect(readConfigFile("selected").access_token).toBeUndefined();
  });
});

test("no credentials preserves the Console login error before command execution", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context();
    const requests = backend();
    const next = vi.fn(async () => {});
    await expect(authStage(ctx, next)).rejects.toMatchObject({
      reason: "missing-console-token",
      exitCode: 3,
    });
    expect(next).not.toHaveBeenCalled();
    expect(requests.calls).toHaveLength(0);
  });
});

test("permission errors are not treated as expired tokens", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({ access_token: "valid-token" }, hostCredentials);
    const requests = backend({ permission: true });
    await expect(
      authStage(ctx, () => ctx.client.console("test.api", {}).then(() => {})),
    ).rejects.toMatchObject({
      exitCode: 1,
      message: "Console gateway error: Original.Permission.Denied",
    });
    expect(requests.generations()).toHaveLength(0);
  });
});

test("token generation denial passes through without a business request or config write", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, hostCredentials);
    const requests = backend({ generationFailure: true });
    await expect(
      authStage(ctx, () => ctx.client.console("test.api", {}).then(() => {})),
    ).rejects.toMatchObject({ exitCode: 1, message: "Denied - original generation denial" });
    expect(requests.generations()).toHaveLength(1);
    expect(requests.gateways()).toHaveLength(0);
    expect(readConfigFile("selected").access_token).toBeUndefined();
  });
});

test("expired token with partial Bailian credentials fails without falling back to host credentials", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context(
      { access_token: "old-token" },
      { ...hostCredentials, BAILIAN_ACCESS_KEY_ID: "partial" },
    );
    const requests = backend();
    await expect(
      authStage(ctx, () => ctx.client.console("test.api", {}).then(() => {})),
    ).rejects.toMatchObject({
      reason: "incomplete-openapi-env",
      hint: expect.stringContaining("BAILIAN_ACCESS_KEY_SECRET"),
    });
    expect(requests.generations()).toHaveLength(0);
    expect(requests.gateways()).toHaveLength(1);
    expect(readConfigFile("selected").access_token).toBe("old-token");
  });
});

test("prepared dry-run can acquire a token for its required read request", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, hostCredentials, { dryRun: true }, true);
    const requests = backend();
    await authStage(ctx, () => ctx.client.console("test.read", {}).then(() => {}));
    expect(requests.generations()).toHaveLength(1);
    expect(requests.gateways()).toHaveLength(1);
    expect(readConfigFile("selected").access_token).toBeUndefined();
  });
});

test("static dry-run and read-only auth snapshot never exchange tokens", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, envCredentials, { dryRun: true });
    const requests = backend();
    await authStage(ctx, async () => {});
    expect(describeAuthState(ctx.sources)).toMatchObject({ openapi: { source: "env" } });
    expect(describeAuthState(ctx.sources).console).toBeUndefined();
    expect(requests.calls).toHaveLength(0);
  });
});

test("CLI output remains the business result with no extra auth diagnostics", async () => {
  const isolated = buildIsolatedCliEnv({
    overrides: { ...envCredentials, NO_UPDATE_NOTIFIER: "1", DO_NOT_TRACK: "1" },
  });
  const requests = backend();
  const probe = defineCommand({
    auth: "console",
    description: "fixture",
    async run(ctx) {
      ctx.output.result(await ctx.client.console("test.api", {}));
    },
  });
  const args = ["probe", "--output", "json", "--quiet"];
  try {
    const result = await runInProcess(() => createCli({ probe }, identity).run(args), args, {
      env: isolated.env,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ data: { success: true, value: "result" } });
    expect(result.stderr).toBe("");
    expect(requests.generations()).toHaveLength(1);
    expect(requests.gateways()).toHaveLength(1);
  } finally {
    isolated.dispose();
  }
});

test.each([false, true])(
  "automatically acquired config token remains temporary after refresh, clone=%s",
  async (clone) => {
    await withIsolatedHome(async () => {
      const file = { access_key_id: "local-ak", access_key_secret: "local-sk" };
      const ctx = await context(file);
      let generations = 0;
      let gateways = 0;
      vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname === "/modelstudio/cli/generateAccessToken") {
          generations++;
          return Response.json({ cliAccessToken: `token-${generations}` });
        }
        gateways++;
        if (gateways > 1 && new Headers(init?.headers).get("authorization") === "Bearer token-1") {
          return Response.json({
            data: { success: false, errorCode: "BailianGateway.Login.NotLogined" },
          });
        }
        return Response.json({ data: { success: true } });
      });
      await authStage(ctx, async () => {
        await ctx.client.console("test.first", {});
        const client = clone ? ctx.client.withConsoleSwitchAgent(9) : ctx.client;
        await client.console("test.second", {});
      });
      expect(generations).toBe(2);
      expect(gateways).toBe(3);
      expect(readConfigFile("selected")).toEqual(file);
    });
  },
);

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test.each([false, true])(
  "concurrent Console requests share one exchange, expired=%s",
  async (expired) => {
    await withIsolatedHome(async () => {
      const file = expired ? { access_token: "old-token" } : {};
      const ctx = await context(file, hostCredentials);
      const started = deferred<void>();
      const release = deferred<void>();
      const requests = backend({
        generation: async () => {
          started.resolve();
          await release.promise;
          return Response.json({ cliAccessToken: "fresh-token" });
        },
      });
      await authStage(ctx, async () => {
        const results = Promise.all([
          ctx.client.console("test.first", {}),
          ctx.client.console("test.second", {}),
        ]);
        await started.promise;
        release.resolve();
        expect(await results).toHaveLength(2);
        await ctx.client.console("test.cached", {});
      });
      expect(requests.generations()).toHaveLength(1);
      expect(requests.gateways()).toHaveLength(expired ? 5 : 3);
      expect(readConfigFile("selected")).toEqual(file);
    });
  },
);

test("a late expired response reuses the token refreshed by another request", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({ access_token: "old-token" }, hostCredentials);
    const lateStarted = deferred<void>();
    const releaseLate = deferred<void>();
    const requests = backend({
      gateway: async (url, headers) => {
        if (headers.get("authorization") === "Bearer old-token") {
          if (url.searchParams.get("api") === "test.late") {
            lateStarted.resolve();
            await releaseLate.promise;
          }
          return Response.json({
            data: { success: false, errorCode: "BailianGateway.Login.NotLogined" },
          });
        }
        return Response.json({ data: { success: true } });
      },
    });
    await authStage(ctx, async () => {
      const late = ctx.client.console("test.late", {});
      await lateStarted.promise;
      await ctx.client.console("test.fast", {});
      releaseLate.resolve();
      await late;
    });
    expect(requests.generations()).toHaveLength(1);
    expect(requests.gateways()).toHaveLength(4);
  });
});

test("shared exchange does not couple business errors or return another request's result", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, hostCredentials);
    const requests = backend({
      gateway: async (url) =>
        url.searchParams.get("api") === "test.denied"
          ? Response.json({ data: { success: false, errorCode: "Original.Permission.Denied" } })
          : Response.json({ data: { success: true, value: url.searchParams.get("api") } }),
    });
    await authStage(ctx, async () => {
      const results = await Promise.allSettled([
        ctx.client.console("test.denied", {}),
        ctx.client.console("test.allowed", {}),
      ]);
      expect(results[0]).toMatchObject({ status: "rejected" });
      expect(results[1]).toMatchObject({
        status: "fulfilled",
        value: { data: { value: "test.allowed" } },
      });
      await ctx.client.console("test.cached", {});
    });
    expect(requests.generations()).toHaveLength(1);
    expect(requests.gateways()).toHaveLength(3);
    expect(readConfigFile("selected").access_token).toBeUndefined();
  });
});

test("failed shared exchange is released so a later call can retry", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, hostCredentials);
    let attempts = 0;
    const requests = backend({
      generation: async () => {
        attempts++;
        return attempts === 1
          ? Response.json({ Code: "Denied", Message: "exchange denied" }, { status: 403 })
          : Response.json({ cliAccessToken: "fresh-token" });
      },
    });
    await authStage(ctx, async () => {
      const results = await Promise.allSettled([
        ctx.client.console("test.first", {}),
        ctx.client.console("test.second", {}),
      ]);
      expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
      expect(requests.generations()).toHaveLength(1);
      expect(requests.gateways()).toHaveLength(0);
      await ctx.client.console("test.retry", {});
    });
    expect(requests.generations()).toHaveLength(2);
    expect(requests.gateways()).toHaveLength(1);
  });
});

test("concurrent local refresh saves only after a successful business request", async () => {
  await withIsolatedHome(async () => {
    const file = {
      access_token: "old-token",
      access_key_id: "local-ak",
      access_key_secret: "local-sk",
    };
    const ctx = await context(file);
    const requests = backend({
      gateway: async (url, headers) => {
        expect(readConfigFile("selected").access_token).toBe("old-token");
        if (headers.get("authorization") === "Bearer old-token")
          return Response.json({
            data: { success: false, errorCode: "BailianGateway.Login.NotLogined" },
          });
        return url.searchParams.get("api") === "test.denied"
          ? Response.json({ data: { success: false, errorCode: "Original.Permission.Denied" } })
          : Response.json({ data: { success: true } });
      },
    });
    await authStage(ctx, async () => {
      const results = await Promise.allSettled([
        ctx.client.console("test.denied", {}),
        ctx.client.console("test.allowed", {}),
      ]);
      expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    });
    expect(requests.generations()).toHaveLength(1);
    expect(readConfigFile("selected")).toEqual({ ...file, access_token: "fresh-token" });
  });
});

test("rejected shared token is not retried again and leaves no cached credential", async () => {
  await withIsolatedHome(async () => {
    const file = {
      access_token: "old-token",
      access_key_id: "local-ak",
      access_key_secret: "local-sk",
    };
    const ctx = await context(file);
    const requests = backend({ rejectNew: true });
    await authStage(ctx, async () => {
      const results = await Promise.allSettled([
        ctx.client.console("test.first", {}),
        ctx.client.console("test.second", {}),
      ]);
      expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
      expect(requests.generations()).toHaveLength(1);
      expect(requests.gateways()).toHaveLength(4);
      await expect(ctx.client.console("test.retry", {})).rejects.toBeInstanceOf(CredentialError);
    });
    expect(requests.generations()).toHaveLength(2);
    expect(requests.gateways()).toHaveLength(6);
    expect(readConfigFile("selected")).toEqual(file);
  });
});

test("different switch-agent Clients keep their exchanges and target scopes separate", async () => {
  await withIsolatedHome(async () => {
    const ctx = await context({}, hostCredentials);
    const requests = backend();
    await authStage(ctx, async () => {
      const switched = ctx.client.withConsoleSwitchAgent(9);
      await Promise.all([
        ctx.client.console("test.original", {}),
        switched.console("test.switched", {}),
      ]);
    });
    expect(requests.generations()).toHaveLength(2);
    expect(requests.gateways()).toHaveLength(2);
    const switched = requests
      .gateways()
      .find((call) => call.url.searchParams.get("api") === "test.switched")!;
    expect(
      JSON.parse(new URLSearchParams(switched.body).get("params")!).Data.cornerstoneParam
        .switchAgent,
    ).toBe(9);
    expect(readConfigFile("selected").access_token).toBeUndefined();
  });
});
