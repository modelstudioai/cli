import http from "node:http";
import {
  ALIYUN_CLI_CLIENT_ID,
  ALIYUN_CLI_SCOPE,
  ALIYUN_OAUTH_BASE_URL,
  BailianError,
  ExitCode,
  PRE_ALIYUN_AUTHORIZATION_URL,
  PRE_ALIYUN_OAUTH_BASE_URL,
  PRE_BAILIAN_CONTROL_HOST,
  PRE_MODEL_STUDIO_HOST,
  UsageError,
  aliyunAuthorizationUrl,
  consoleCredentialKey,
  createOAuthProofKey,
  defineCommand,
  exchangeAliyunCode,
  exchangeAliyunSts,
  generateCLIAccessToken,
  normalizeOAuthUrl,
  normalizeOpenApiHost,
  parseAliyunCallback,
  requirePreConsoleGateway,
  resolveConsoleGatewayOrigin,
  resolveModelStudioHost,
  revokeAliyunTokens,
  validateConsoleAccessToken,
  type AliyunOAuthProfile,
  type AliyunOAuthSession,
  type AuthStore,
  type CommandOutput,
  type Identity,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { registerInterruptHandler } from "bailian-cli-runtime";
import { listenLocalServer, openInBrowser } from "../shared/local-server.ts";

export interface AliyunOAuthLoginDeps {
  identity: Identity;
  settings: Settings;
  authStore: Pick<AuthStore, "describe" | "loginAliyun">;
  output: Pick<CommandOutput, "result">;
  localize?: (text: LocalizedText) => string;
  writeStderr?: (text: string) => void;
  openBrowser?: (url: string) => void | Promise<void>;
  onAuthUrl?: (url: string) => void | Promise<void>;
}

export interface AliyunOAuthLoginOptions {
  clientId?: string;
  scope?: string;
  oauthBaseUrl?: string;
  authorizationUrl?: string;
  modelstudioHost?: string;
  consoleGateway?: string;
  bailiancontrolHost?: string;
  consoleRegion?: string;
  noBrowser?: boolean;
  callbackTimeoutMs?: number;
  signal?: AbortSignal;
}

type LoginProfile = Omit<AliyunOAuthProfile, "session_ref">;
const CALLBACK_TIMEOUT_MS = 15 * 60 * 1000;
const OAUTH_CALLBACK_PATH = "/oauth/callback";
const DEFAULT_MODEL_STUDIO_HOST = resolveModelStudioHost("cn-beijing")!;
const DEFAULT_CONSOLE_GATEWAY = resolveConsoleGatewayOrigin("cn-beijing", "domestic");

function localize(deps: AliyunOAuthLoginDeps, text: LocalizedText): string {
  return deps.localize ? deps.localize(text) : typeof text === "string" ? text : text["en-US"];
}

function nonempty(value: string, flag: string): string {
  if (!value.trim()) throw new UsageError(`${flag} must not be empty. / ${flag} 不能为空。`);
  return value.trim();
}

function trustedPreEndpoint(
  explicit: string | undefined,
  stored: string | undefined,
  trusted: string | undefined,
  flag: string,
  normalize: (value: string) => string,
): void {
  // Check stored metadata independently: an explicit override must not hide a mismatched profile.
  if ([explicit, stored].some((value) => value !== undefined && normalize(value) !== trusted)) {
    throw new UsageError(
      `${flag} must match the trusted pre-release endpoint in both flags and saved OAuth metadata. / 参数及已保存的 OAuth 配置中，${flag} 必须与可信预发端点一致。`,
    );
  }
}

function loginPlan(
  settings: Settings,
  options: AliyunOAuthLoginOptions,
  previous?: AliyunOAuthProfile,
) {
  const pre = settings.preControlPlane;
  const clientId =
    options.clientId ?? previous?.client_id ?? (pre ? ALIYUN_CLI_CLIENT_ID : undefined);
  const scope = nonempty(options.scope ?? previous?.scope ?? ALIYUN_CLI_SCOPE, "--scope");
  const region = nonempty(
    options.consoleRegion ??
      (pre && settings.consoleRegion) ??
      previous?.console_region ??
      "cn-beijing",
    "--console-region",
  );
  if (region !== "cn-beijing" || (pre && previous && previous.console_region !== "cn-beijing")) {
    throw new UsageError(
      "Aliyun OAuth currently supports only cn-beijing. / 阿里云 OAuth 目前仅支持 cn-beijing。",
    );
  }
  const normalizedClientId = clientId === undefined ? undefined : nonempty(clientId, "--client-id");
  const domains = { console_region: region, console_enabled: true, openapi_enabled: true };
  if (pre) {
    const target = { region, site: settings.consoleSite ?? "domestic" };
    const gateway =
      settings.dryRun && !pre.consoleGateway && target.site === "domestic"
        ? undefined
        : requirePreConsoleGateway(pre, target);
    const normalizeOrigin = (value: string) => normalizeOAuthUrl(value, true);
    trustedPreEndpoint(
      options.authorizationUrl,
      previous?.authorization_url,
      PRE_ALIYUN_AUTHORIZATION_URL,
      "--authorization-url",
      normalizeOAuthUrl,
    );
    trustedPreEndpoint(
      options.oauthBaseUrl,
      previous?.oauth_base_url,
      PRE_ALIYUN_OAUTH_BASE_URL,
      "--oauth-base-url",
      normalizeOrigin,
    );
    trustedPreEndpoint(
      options.modelstudioHost,
      previous?.modelstudio_host,
      PRE_MODEL_STUDIO_HOST,
      "--modelstudio-host",
      normalizeOpenApiHost,
    );
    trustedPreEndpoint(
      options.bailiancontrolHost,
      previous?.bailiancontrol_host,
      PRE_BAILIAN_CONTROL_HOST,
      "--bailiancontrol-host",
      normalizeOpenApiHost,
    );
    trustedPreEndpoint(
      options.consoleGateway,
      previous?.console_gateway,
      gateway,
      "--console-gateway",
      normalizeOrigin,
    );
    return {
      client_id: normalizedClientId,
      scope,
      oauth_base_url: PRE_ALIYUN_OAUTH_BASE_URL,
      authorization_url: PRE_ALIYUN_AUTHORIZATION_URL,
      modelstudio_host: PRE_MODEL_STUDIO_HOST,
      console_gateway: gateway,
      bailiancontrol_host: PRE_BAILIAN_CONTROL_HOST,
      ...domains,
    };
  }
  const authorizationUrl = options.authorizationUrl ?? previous?.authorization_url;
  const modelstudioHost =
    options.modelstudioHost ?? previous?.modelstudio_host ?? DEFAULT_MODEL_STUDIO_HOST;
  const consoleGateway =
    options.consoleGateway ?? previous?.console_gateway ?? DEFAULT_CONSOLE_GATEWAY;
  const bailiancontrolHost = options.bailiancontrolHost ?? previous?.bailiancontrol_host;
  return {
    client_id: normalizedClientId,
    scope,
    oauth_base_url: normalizeOAuthUrl(
      options.oauthBaseUrl ?? previous?.oauth_base_url ?? ALIYUN_OAUTH_BASE_URL,
      true,
    ),
    authorization_url:
      authorizationUrl === undefined ? undefined : normalizeOAuthUrl(authorizationUrl),
    modelstudio_host: normalizeOpenApiHost(modelstudioHost),
    console_gateway: normalizeOAuthUrl(consoleGateway, true),
    ...(bailiancontrolHost === undefined
      ? {}
      : { bailiancontrol_host: normalizeOpenApiHost(bailiancontrolHost) }),
    ...domains,
  };
}

function interrupted(deps: AliyunOAuthLoginDeps): BailianError {
  return new BailianError(
    localize(deps, {
      "en-US": "Aliyun OAuth login was cancelled.",
      "zh-CN": "阿里云 OAuth 登录已取消。",
    }),
    ExitCode.INTERRUPTED,
  );
}

function assertActive(signal: AbortSignal, deps: AliyunOAuthLoginDeps): void {
  if (signal.aborted) throw interrupted(deps);
}

/** Only this process's callback server and listeners are owned by this function. */
async function receiveCode(
  deps: AliyunOAuthLoginDeps,
  profile: LoginProfile,
  proof: ReturnType<typeof createOAuthProofKey>,
  options: AliyunOAuthLoginOptions,
  signal: AbortSignal,
): Promise<{ code: string; redirectUri: string }> {
  assertActive(signal, deps);
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: unknown) => void;
  const completion = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Binding and announcing the URL are asynchronous; rejection must already be observed.
  void completion.catch(() => {});
  const settle = (code?: string, error?: unknown) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (error !== undefined) rejectCode(error);
    else resolveCode(code!);
  };
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end(
        localize(deps, { "en-US": "Only GET is allowed.\n", "zh-CN": "仅允许 GET 请求。\n" }),
      );
      return;
    }
    let callback: URL;
    try {
      callback = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      response.writeHead(400);
      response.end(localize(deps, { "en-US": "Invalid callback.\n", "zh-CN": "无效的回调。\n" }));
      return;
    }
    if (callback.pathname !== OAUTH_CALLBACK_PATH) {
      response.writeHead(404);
      response.end(localize(deps, { "en-US": "Not found.\n", "zh-CN": "路径不存在。\n" }));
      return;
    }
    if (finished) {
      response.writeHead(409);
      response.end(
        localize(deps, { "en-US": "Login is no longer waiting.\n", "zh-CN": "登录已结束等待。\n" }),
      );
      return;
    }
    let code: string;
    try {
      code = parseAliyunCallback(callback, proof.state);
    } catch (error) {
      response.writeHead(400);
      // Invalid state/code must not consume the pending login; a valid-state denial does.
      const denied =
        callback.searchParams.getAll("state").length === 1 &&
        callback.searchParams.get("state") === proof.state &&
        callback.searchParams.has("error");
      if (denied) {
        response.once("finish", () => settle(undefined, error));
        response.once("close", () => settle(undefined, error));
      }
      response.end(
        localize(deps, { "en-US": "OAuth callback rejected.\n", "zh-CN": "OAuth 回调被拒绝。\n" }),
      );
      return;
    }
    // Flush the browser response before cleanup; a disconnected browser must not lose the code.
    response.once("finish", () => settle(code));
    response.once("close", () => settle(code));
    response.end(
      localize(deps, {
        "en-US": "Authorization received. You can close this page and return to the terminal.\n",
        "zh-CN": "已收到授权，请关闭本页并返回终端查看登录结果。\n",
      }),
    );
  });
  const onError = (error: Error) => settle(undefined, error);
  const onAbort = () => settle(undefined, interrupted(deps));
  server.on("error", onError);
  signal.addEventListener("abort", onAbort, { once: true });
  const writeStderr =
    deps.writeStderr ??
    ((text: string) => {
      process.stderr.write(text);
    });
  try {
    const port = await listenLocalServer(server, 0);
    assertActive(signal, deps);
    const redirectUri = normalizeOAuthUrl(`http://127.0.0.1:${port}${OAUTH_CALLBACK_PATH}`);
    const authUrl = normalizeOAuthUrl(aliyunAuthorizationUrl(profile, redirectUri, proof));
    timer = setTimeout(
      () =>
        settle(
          undefined,
          new BailianError(
            localize(deps, {
              "en-US": "Aliyun OAuth login timed out waiting for the local callback.",
              "zh-CN": "阿里云 OAuth 登录等待本机回调超时。",
            }),
            ExitCode.TIMEOUT,
          ),
        ),
      options.callbackTimeoutMs ?? CALLBACK_TIMEOUT_MS,
    );
    writeStderr(
      `${localize(deps, {
        "en-US": "Open this login URL in a browser on this machine:",
        "zh-CN": "请在本机浏览器中打开以下登录地址：",
      })}\n${authUrl}\n${localize(deps, {
        "en-US": "Waiting for the local OAuth callback. Press Ctrl+C to cancel.",
        "zh-CN": "正在等待本机 OAuth 回调。按 Ctrl+C 取消。",
      })}\n`,
    );
    if (deps.onAuthUrl)
      void Promise.resolve()
        .then(() => deps.onAuthUrl!(authUrl))
        .catch(onError);
    if (!options.noBrowser) {
      // Never await browser launch: it can fail, hang, or deliver an immediate callback.
      void Promise.resolve()
        .then(() => (deps.openBrowser ?? openInBrowser)(authUrl))
        .catch(() => {
          if (!finished)
            writeStderr(
              `${localize(deps, {
                "en-US": "Could not open the browser. Open the URL above manually.",
                "zh-CN": "无法自动打开浏览器，请手动打开上方地址。",
              })}\n`,
            );
        });
    }
    return { code: await completion, redirectUri };
  } finally {
    finished = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    server.off("error", onError);
  }
}

/** Preserve the primary failure and its API context, but never expose known login secrets. */
function safeLoginError(error: unknown, secrets: string[]): unknown {
  const scrub = (value: string | undefined) => {
    if (value === undefined) return undefined;
    for (const secret of secrets) if (secret) value = value.replaceAll(secret, "[REDACTED]");
    return value;
  };
  if (!(error instanceof Error)) return new BailianError(scrub(String(error))!, ExitCode.GENERAL);
  const original = error instanceof BailianError ? error : undefined;
  const cause =
    error.cause instanceof Error
      ? {
          message: scrub(error.cause.message),
          code: scrub((error.cause as NodeJS.ErrnoException).code),
        }
      : typeof error.cause === "string"
        ? scrub(error.cause)
        : undefined;
  if (!original) {
    // Keep runtime's transport/timeout/errno classification without retaining secret-bearing stacks.
    const sanitized =
      error instanceof TypeError
        ? new TypeError(scrub(error.message), { cause })
        : new Error(scrub(error.message), { cause });
    sanitized.name = scrub(error.name)!;
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === "string") (sanitized as NodeJS.ErrnoException).code = scrub(code);
    return sanitized;
  }
  return new BailianError(
    scrub(error.message)!,
    original?.exitCode ?? ExitCode.GENERAL,
    scrub(original?.hint),
    {
      ...(original?.api
        ? {
            api: {
              ...original.api,
              apiCode: scrub(original.api.apiCode),
              requestId: scrub(original.api.requestId),
            },
          }
        : {}),
      rawResponse: scrub(original?.rawResponse),
      cause,
    },
  );
}

export async function runAliyunOAuthLogin(
  deps: AliyunOAuthLoginDeps,
  options: AliyunOAuthLoginOptions = {},
): Promise<void> {
  // Static dry-run never describes existing credentials, generates proof, binds, or reads secrets.
  const { dryRun, preControlPlane } = deps.settings;
  const plan = loginPlan(
    deps.settings,
    options,
    dryRun ? undefined : deps.authStore.describe().aliyunOAuth,
  );
  const missing = [
    ...(!plan.authorization_url ? ["--authorization-url"] : []),
    ...(!plan.client_id ? ["--client-id"] : []),
    ...(!plan.console_gateway ? ["BAILIAN_PRE_CONSOLE_GATEWAY"] : []),
  ];
  const config = deps.settings.configName ?? "default";
  if (dryRun) {
    const missingClientId = missing.includes("--client-id");
    const preEndpoints = preControlPlane
      ? `\n${localize(deps, { "en-US": "Pre-release endpoints", "zh-CN": "预发端点" })}: ${[
          plan.authorization_url,
          plan.oauth_base_url,
          plan.modelstudio_host,
          plan.bailiancontrol_host,
          plan.console_gateway,
        ]
          .filter(Boolean)
          .join(", ")}`
      : "";
    deps.output.result(
      {
        action: "auth.login",
        method: "aliyun",
        config,
        no_browser: !!options.noBrowser,
        ...(preControlPlane ? { environment: "pre" } : {}),
        plan,
        missing,
      },
      {
        text: localize(deps, {
          "en-US": `Would authorize Aliyun OAuth with a random loopback port, exchange STS, validate Console access and save the session. ${missingClientId ? "Missing required options" : "Missing endpoints"}: ${missing.join(", ") || "none"}.${preEndpoints}`,
          "zh-CN": `将通过随机回环端口完成阿里云 OAuth 授权、置换 STS、校验控制台并保存会话。${missingClientId ? "缺少必填选项" : "缺少端点"}：${missing.join("、") || "无"}。${preEndpoints}`,
        }),
      },
    );
    return;
  }
  if (!plan.client_id) {
    throw new UsageError(
      localize(deps, {
        "en-US": `Provide ${missing.join(" and ")} for the first login outside the pre-release control plane.`,
        "zh-CN": `非预发控制面首次登录请提供 ${missing.join(" 和 ")}。`,
      }),
    );
  }
  if (!plan.authorization_url) {
    throw new UsageError(
      localize(deps, {
        "en-US":
          "Provide --authorization-url for the first login; the authorization endpoint will not be guessed.",
        "zh-CN": "首次登录请提供 --authorization-url；不会猜测授权地址。",
      }),
    );
  }
  if (
    options.callbackTimeoutMs !== undefined &&
    (!Number.isFinite(options.callbackTimeoutMs) || options.callbackTimeoutMs <= 0)
  ) {
    throw new UsageError("callbackTimeoutMs must be positive. / callbackTimeoutMs 必须为正数。");
  }
  const profile: LoginProfile = {
    ...plan,
    client_id: plan.client_id,
    authorization_url: plan.authorization_url,
    // The live preflight above requires a configured gateway; only dry-run may omit it.
    console_gateway: plan.console_gateway!,
  };
  const cancellation = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, cancellation.signal])
    : cancellation.signal;
  const onSignal = () => cancellation.abort();
  const releaseInterrupt = registerInterruptHandler(onSignal);
  process.once("SIGTERM", onSignal);
  const oauthDeps = { identity: deps.identity, timeout: deps.settings.timeout };
  const secrets: string[] = [];
  let session: AliyunOAuthSession | undefined;
  let saved = false;
  try {
    assertActive(signal, deps);
    const proof = createOAuthProofKey();
    secrets.push(proof.verifier);
    const { code, redirectUri } = await receiveCode(deps, profile, proof, options, signal);
    secrets.push(code);
    assertActive(signal, deps);
    session = await exchangeAliyunCode(profile, code, proof.verifier, redirectUri, oauthDeps);
    secrets.push(session.accessToken, session.refreshToken);
    assertActive(signal, deps);
    session.sts = await exchangeAliyunSts(profile, session.accessToken, oauthDeps);
    secrets.push(session.sts.accessKeyId, session.sts.accessKeySecret, session.sts.securityToken);
    assertActive(signal, deps);
    const settings: Settings = {
      ...deps.settings,
      consoleRegion: "cn-beijing",
      consoleSite: "domestic",
      consoleSwitchAgent: undefined,
    };
    const { cliAccessToken } = await generateCLIAccessToken({
      identity: deps.identity,
      settings,
      baseUrl: normalizeOAuthUrl(`https://${profile.modelstudio_host}`, true),
      modelStudioHost: profile.modelstudio_host,
      accessKeyId: session.sts.accessKeyId,
      accessKeySecret: session.sts.accessKeySecret,
      securityToken: session.sts.securityToken,
    });
    secrets.push(cliAccessToken);
    assertActive(signal, deps);
    const target = {
      region: "cn-beijing",
      site: "domestic" as const,
      gateway: profile.console_gateway,
    };
    await validateConsoleAccessToken({ ...target, token: cliAccessToken }, settings);
    assertActive(signal, deps);
    // Console TTL is intentionally absent: GenerateCLIAccessToken has no confirmed TTL field.
    session.consoleTokens = { [consoleCredentialKey(target)]: { token: cliAccessToken } };
    profile.access_token_expires_at = session.accessTokenExpiresAt;
    profile.sts_expires_at = session.sts.expiresAt;
    await deps.authStore.loginAliyun(profile, session);
    saved = true;
    deps.output.result(
      { authenticated: true, method: "aliyun", config, console: true, openapi: true },
      {
        text: localize(deps, {
          "en-US": `Authenticated with Aliyun OAuth (config: ${config}; console: true; openapi: true).`,
          "zh-CN": `阿里云 OAuth 登录成功（配置：${config}；console：true；openapi：true）。`,
        }),
      },
    );
  } catch (error) {
    if (!saved && session?.refreshToken) {
      // Cleanup failure must not replace the exchange/validation/persistence error.
      await revokeAliyunTokens(profile, session.refreshToken, {
        ...oauthDeps,
        timeout: Math.min(oauthDeps.timeout, 5),
      }).catch(() => {});
    }
    throw safeLoginError(error, secrets);
  } finally {
    releaseInterrupt();
    process.off("SIGTERM", onSignal);
  }
}

export default defineCommand({
  description: { "en-US": "Authenticate with Aliyun OAuth", "zh-CN": "通过阿里云 OAuth 登录" },
  auth: "none",
  usageArgs:
    "--login aliyun [--client-id <id>] [--authorization-url <url>] [--modelstudio-host <hostname>] [--console-gateway <origin>]",
  exampleArgs: [
    "--login aliyun --client-id <id> --authorization-url <url>",
    "--login aliyun --client-id <id> --authorization-url <url> --modelstudio-host <hostname> --console-gateway <origin>",
  ],
  flags: {
    login: {
      type: "string",
      required: true,
      choices: ["aliyun"] as const,
      valueHint: "<aliyun>",
      description: { "en-US": "Login method: aliyun", "zh-CN": "登录方式：aliyun" },
    },
    clientId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "OAuth client ID; required for the first login outside pre-release",
        "zh-CN": "OAuth 客户端 ID；非预发环境首次登录必须提供",
      },
    },
    scope: {
      type: "string",
      valueHint: "<scope>",
      description: {
        "en-US": `OAuth scope (default: ${ALIYUN_CLI_SCOPE})`,
        "zh-CN": `OAuth 授权范围（默认：${ALIYUN_CLI_SCOPE}）`,
      },
    },
    oauthBaseUrl: {
      type: "string",
      valueHint: "<origin>",
      description: {
        "en-US": `OAuth token service origin (production default: ${ALIYUN_OAUTH_BASE_URL})`,
        "zh-CN": `OAuth 令牌服务源站（线上默认：${ALIYUN_OAUTH_BASE_URL}）`,
      },
    },
    authorizationUrl: {
      type: "string",
      valueHint: "<url>",
      description: {
        "en-US": "Explicit authorization URL; required for the first login outside pre-release",
        "zh-CN": "显式授权地址；非预发环境首次登录必须提供",
      },
    },
    modelstudioHost: {
      type: "string",
      valueHint: "<hostname>",
      description: {
        "en-US": `Model Studio POP hostname override (production default: ${DEFAULT_MODEL_STUDIO_HOST})`,
        "zh-CN": `Model Studio POP 主机名覆盖（线上默认：${DEFAULT_MODEL_STUDIO_HOST}）`,
      },
    },
    consoleGateway: {
      type: "string",
      valueHint: "<origin>",
      description: {
        "en-US": `Console gateway origin override (production default: ${DEFAULT_CONSOLE_GATEWAY})`,
        "zh-CN": `控制台网关源站覆盖（线上默认：${DEFAULT_CONSOLE_GATEWAY}）`,
      },
    },
    bailiancontrolHost: {
      type: "string",
      valueHint: "<hostname>",
      description: {
        "en-US": "Optional Bailian Control OpenAPI hostname",
        "zh-CN": "可选 Bailian Control OpenAPI 主机名",
      },
    },
    consoleRegion: {
      type: "string",
      choices: ["cn-beijing"] as const,
      valueHint: "<cn-beijing>",
      description: {
        "en-US": "Console region (only cn-beijing; default: cn-beijing)",
        "zh-CN": "控制台地域（仅支持 cn-beijing；默认：cn-beijing）",
      },
    },
    noBrowser: {
      type: "switch",
      description: {
        "en-US": "Do not open the browser automatically; still wait for the local callback",
        "zh-CN": "不自动打开浏览器；仍等待本机回调",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Outside pre-release, first login requires an explicit client ID and a confirmed authorization URL. In pre-release, endpoint overrides must match the trusted endpoints, and the CLI gateway must be configured. No device flow or remote callback import is supported.",
      "zh-CN":
        "非预发环境首次登录需要显式指定客户端 ID 和已确认的授权地址。预发端点覆盖必须与可信端点一致，并且必须配置 CLI 网关。不支持设备授权或导入远程回调。",
    },
    {
      "en-US":
        "Register http://127.0.0.1:12345/oauth/callback as the IAM redirect URI. NativeApp loopback ports may vary; scheme, host and path must match.",
      "zh-CN":
        "IAM 重定向 URI 登记为 http://127.0.0.1:12345/oauth/callback。NativeApp 回环端口可随机，协议、主机和路径必须一致。",
    },
  ],
  async run(ctx) {
    await runAliyunOAuthLogin(
      {
        identity: ctx.identity,
        settings: ctx.settings,
        authStore: ctx.authStore,
        output: ctx.output,
        localize: ctx.localize,
      },
      ctx.flags,
    );
  },
});
