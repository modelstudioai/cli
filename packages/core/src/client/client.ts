import type { Identity, Settings } from "../config/schema.ts";
import type { ApiKeyCredential, ConsoleCredential } from "../auth/types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { request, requestJson, type HttpDeps, type RequestOpts } from "./http.ts";
import { isLocalFile, resolveFileUrl } from "../files/upload.ts";
import { McpClient } from "./mcp.ts";
import { callConsoleGateway } from "../console/gateway.ts";

/** Client 的结构化依赖:身份 + 有效配置 + 各域凭证(按命令的 auth 注入)。 */
export interface ClientDeps {
  identity: Identity;
  settings: Settings;
  /** Model 域 base URL(凭证无关链解析,resolveModelBaseUrl;有 apiCred 时两者一致)。 */
  baseUrl: string;
  apiCred?: ApiKeyCredential;
  consoleCred?: ConsoleCredential;
}

/** Like {@link RequestOpts} but with a `path` (credential baseUrl prepended) or an absolute URL. */
export interface ClientRequestOpts extends Omit<RequestOpts, "url" | "noAuth"> {
  path: string;
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

  /** Model-domain base URL. Readable without a key (e.g. dry-run preview); real requests still need one. */
  get baseUrl(): string {
    return this.deps.apiCred?.baseUrl ?? this.deps.baseUrl;
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
    return resolveFileUrl(source, this.requireApi().token, model, opts);
  }

  /** Open an MCP client. Accepts a path (prepended with the model baseUrl) or an absolute URL. */
  mcp(pathOrUrl: string): McpClient {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : this.requireApi().baseUrl + pathOrUrl;
    return new McpClient(this.http, url, this.deps.apiCred?.token);
  }

  console<T>(api: string, data: Record<string, unknown>): Promise<T> {
    if (!this.deps.consoleCred) {
      throw new BailianError("This command needs a console access token.", ExitCode.AUTH);
    }
    // region / site / switchAgent 已解析在 consoleCred 里,gateway 不再回读 config。
    return callConsoleGateway(this.deps.consoleCred, this.deps.settings.timeout, {
      api,
      data,
    }) as Promise<T>;
  }
}
