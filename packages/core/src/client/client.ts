import type { Identity, Settings } from "../config/schema.ts";
import type { ApiKeyCredential, ConsoleCredential, OpenApiCredential } from "../auth/types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { request, requestJson, type HttpDeps, type RequestOpts } from "./http.ts";
import { buildAcsCanonicalQuery, signAcsRequest, type AcsQueryParams } from "./acs.ts";
import { imageFileToDataUri, isLocalFile, resolveFileUrl } from "../files/upload.ts";
import { McpClient } from "./mcp.ts";
import { callConsoleGateway } from "../console/gateway.ts";
import { refreshAccessToken } from "../auth/refresh-token.ts";
import { maskToken } from "../utils/token.ts";
import { trackingHeaders } from "./headers.ts";

/** Client 的结构化依赖:身份 + 有效配置 + 各域凭证(按命令的 auth 注入)。 */
export interface ClientDeps {
  identity: Identity;
  settings: Settings;
  /** Model 域 base URL(凭证无关链解析,resolveModelBaseUrl;有 apiCred 时两者一致)。 */
  baseUrl: string;
  apiCred?: ApiKeyCredential;
  consoleCred?: ConsoleCredential;
  openApiCred?: OpenApiCredential;
}

/** Like {@link RequestOpts} but with a `path` (credential baseUrl prepended) or an absolute URL. */
export interface ClientRequestOpts extends Omit<RequestOpts, "url" | "noAuth"> {
  path: string;
}

export interface ClientOpenApiQueryOpts {
  host: string;
  path: string;
  action: string;
  version: string;
  method: "GET" | "POST";
  queryParams: AcsQueryParams;
}

export interface ClientOpenApiJsonOpts {
  host: string;
  path: string;
  action: string;
  version: string;
  method: "GET" | "POST";
  /** JSON request body; omit for query-only calls (signed as an empty body). */
  body?: unknown;
  queryParams?: AcsQueryParams;
}

export interface OpenApiResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
}

/**
 * A command's network surface: call its methods to reach the API — the
 * credential and base URL are already baked in, so commands never handle tokens
 * or baseUrl. Model methods (`request`/`requestJson`/`mcp`) need an api key;
 * `uploadFile` only needs one for local files, and passes URLs through without
 * credentials. `console` needs a console token; calling one without its
 * credential throws.
 */
export class Client {
  constructor(private readonly deps: ClientDeps) {}

  private get http(): HttpDeps {
    return { identity: this.deps.identity, settings: this.deps.settings };
  }

  private requireApi(): ApiKeyCredential {
    if (!this.deps.apiCred) {
      throw new BailianError("This command needs a model-domain API key.", ExitCode.AUTH);
    }
    return this.deps.apiCred;
  }

  private requireOpenApi(): OpenApiCredential {
    if (!this.deps.openApiCred) {
      throw new BailianError(
        "This command needs Alibaba Cloud OpenAPI AK/SK credentials.",
        ExitCode.AUTH,
      );
    }
    return this.deps.openApiCred;
  }

  /** Model-domain base URL. Readable without a key (e.g. dry-run preview); real requests still need one. */
  get baseUrl(): string {
    return this.deps.apiCred?.baseUrl ?? this.deps.baseUrl;
  }

  /**
   * Export the model-domain credential for delegation to an embedded SDK that
   * owns its own transport (e.g. @openagentpack/sdk). Deliberate escape hatch:
   * regular commands keep calling {@link request}/{@link requestJson} and never
   * handle tokens — lint restricts callers to managed-agent/_engine. Undefined
   * when no credential resolved (authStage tolerates that only under dry-run).
   */
  exportApiCredential(): ApiKeyCredential | undefined {
    return this.deps.apiCred;
  }

  /** Full URL for a model-domain {@link path}; build request/display URLs only through this. */
  url(path: string): string {
    return this.baseUrl + path;
  }

  private toOpts({ path, ...rest }: ClientRequestOpts): RequestOpts {
    const cred = this.requireApi();
    return {
      ...rest,
      url: /^https?:\/\//.test(path) ? path : cred.baseUrl + path,
      headers: { ...rest.headers, Authorization: `Bearer ${cred.token}` },
    };
  }

  request(opts: ClientRequestOpts): Promise<Response> {
    return request(this.http, this.toOpts(opts));
  }

  requestJson<T>(opts: ClientRequestOpts): Promise<T> {
    return requestJson<T>(this.http, this.toOpts(opts));
  }

  /** Resolve a file arg: upload a local path to OSS (returns oss:// URL), or pass a URL through. */
  uploadFile(source: string, model: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
    if (!isLocalFile(source)) return Promise.resolve(source);
    return resolveFileUrl(source, this.requireApi().token, model, {
      ...opts,
      identity: this.deps.identity,
    });
  }

  /**
   * Resolve an image input while keeping Token Plan's upload limitation isolated.
   * Token Plan local images are sent as Data URIs; every other connection keeps
   * the established temporary OSS upload flow. URLs and existing Data URIs pass through.
   */
  resolveImageInput(
    source: string,
    model: string,
    opts: { signal?: AbortSignal } = {},
  ): Promise<string> {
    if (!isLocalFile(source)) return Promise.resolve(source);
    if (this.usesTokenPlanEndpoint()) {
      return Promise.resolve(imageFileToDataUri(source));
    }
    return this.uploadFile(source, model, { signal: opts.signal });
  }

  usesTokenPlanEndpoint(): boolean {
    if (this.deps.settings.configName === "token-plan") return true;
    try {
      return /^token-plan\.[a-z0-9-]+\.maas\.aliyuncs\.com$/i.test(new URL(this.baseUrl).hostname);
    } catch {
      return false;
    }
  }

  /** Open an MCP client. Accepts a path (prepended with the model baseUrl) or an absolute URL. */
  mcp(pathOrUrl: string): McpClient {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : this.requireApi().baseUrl + pathOrUrl;
    return new McpClient(this.http, url, this.deps.apiCred?.token);
  }

  async console<T>(api: string, data: Record<string, unknown>): Promise<T> {
    if (!this.deps.consoleCred) {
      throw new BailianError("This command needs a console access token.", ExitCode.AUTH);
    }
    const gwOpts = { api, data };
    const { timeout } = this.deps.settings;
    try {
      return (await callConsoleGateway(
        this.deps.consoleCred,
        timeout,
        gwOpts,
        this.deps.settings,
      )) as T;
    } catch (err) {
      if (
        !(err instanceof BailianError) ||
        err.exitCode !== ExitCode.AUTH ||
        !err.message.includes("not logged in")
      ) {
        throw err;
      }
      const newToken = await refreshAccessToken({
        identity: this.deps.identity,
        settings: this.deps.settings,
        baseUrl: this.deps.baseUrl,
      });
      if (!newToken) throw err;
      return (await callConsoleGateway(
        { ...this.deps.consoleCred, token: newToken },
        timeout,
        gwOpts,
        this.deps.settings,
      )) as T;
    }
  }

  openApiQueryJson<T extends OpenApiResponse>(opts: ClientOpenApiQueryOpts): Promise<T> {
    return this.openApiJson<T>(opts);
  }

  async openApiJson<T extends OpenApiResponse>(opts: ClientOpenApiJsonOpts): Promise<T> {
    const cred = this.requireOpenApi();
    const bodyStr = opts.body === undefined ? "" : JSON.stringify(opts.body);
    const queryString = opts.queryParams ? buildAcsCanonicalQuery(opts.queryParams) : "";
    const endpoint = `https://${opts.host}${opts.path}${queryString ? `?${queryString}` : ""}`;
    const headers = signAcsRequest({
      accessKeyId: cred.accessKeyId,
      accessKeySecret: cred.accessKeySecret,
      securityToken: cred.securityToken,
      action: opts.action,
      version: opts.version,
      body: bodyStr,
      host: opts.host,
      pathname: opts.path,
      method: opts.method,
      queryString,
    });

    if (this.deps.settings.verbose) {
      process.stderr.write(`> ${opts.method} ${endpoint}\n`);
      process.stderr.write(`> x-acs-action: ${opts.action} (version ${opts.version})\n`);
      process.stderr.write(`> AK: ${maskToken(cred.accessKeyId)}\n`);
      if (cred.securityToken) {
        process.stderr.write(`> STS token: ${maskToken(cred.securityToken)}\n`);
      }
      if (queryString) process.stderr.write(`> query: ${queryString}\n`);
      if (bodyStr) process.stderr.write(`> body: ${bodyStr}\n`);
    }

    const timeoutMs = this.deps.settings.timeout * 1000;
    const res = await fetch(endpoint, {
      method: opts.method,
      headers: { ...headers, ...trackingHeaders(this.deps.identity) },
      body: bodyStr || undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawText = await res.text();
    if (this.deps.settings.verbose) {
      process.stderr.write(`< ${res.status} ${res.statusText}\n`);
      process.stderr.write(`< ${rawText}\n`);
    }

    let data: T;
    try {
      data = JSON.parse(rawText) as T;
    } catch {
      throw new BailianError(
        `${res.status} ${res.statusText} - ${rawText.slice(0, 500)}`,
        ExitCode.GENERAL,
      );
    }
    if (!res.ok || data.Success === false) {
      throw new BailianError(
        `${data.Code || res.status} - ${data.Message || res.statusText}`,
        ExitCode.GENERAL,
      );
    }

    return data;
  }
}
