import type { Config } from "../config/schema.ts";
import type { ApiKeyCredential, ConsoleCredential } from "../auth/types.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { request, requestJson, type RequestOpts } from "./http.ts";
import { resolveFileUrl } from "../files/upload.ts";
import { McpClient } from "./mcp.ts";
import { callConsoleGateway } from "../console/gateway.ts";

/** Like {@link RequestOpts} but with a `path` (Client prepends the credential's baseUrl). */
export interface ClientRequestOpts extends Omit<RequestOpts, "url" | "noAuth"> {
  path: string;
}

/**
 * A command's network surface: call its methods to reach the API — the
 * credential and base URL are already baked in, so commands never handle tokens
 * or baseUrl. Model methods (`request`/`requestJson`/`uploadFile`/`mcp`) need an
 * api key; `console` needs a console token; calling one without its credential
 * throws.
 */
export class Client {
  constructor(
    private readonly config: Config,
    private readonly apiCred?: ApiKeyCredential,
    private readonly consoleCred?: ConsoleCredential,
  ) {}

  private requireApi(): ApiKeyCredential {
    if (!this.apiCred) {
      throw new BailianError("This command needs a model-domain API key.", ExitCode.AUTH);
    }
    return this.apiCred;
  }

  /** Model-domain base URL. Readable without a key (e.g. dry-run preview); real requests still need one. */
  get baseUrl(): string {
    return this.apiCred?.baseUrl ?? this.config.baseUrl;
  }

  /** Full URL for a model-domain {@link path}; build request/display URLs only through this. */
  url(path: string): string {
    return this.baseUrl + path;
  }

  private toOpts({ path, ...rest }: ClientRequestOpts): RequestOpts {
    const cred = this.requireApi();
    return {
      ...rest,
      url: cred.baseUrl + path,
      headers: { ...rest.headers, Authorization: `Bearer ${cred.token}` },
      noAuth: true,
    };
  }

  request(opts: ClientRequestOpts): Promise<Response> {
    return request(this.config, this.toOpts(opts));
  }

  requestJson<T>(opts: ClientRequestOpts): Promise<T> {
    return requestJson<T>(this.config, this.toOpts(opts));
  }

  /** Resolve a file arg: upload a local path to OSS (returns oss:// URL), or pass a URL through. */
  uploadFile(source: string, model: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
    return resolveFileUrl(source, this.requireApi().token, model, opts);
  }

  /** Open an MCP client. Accepts a path (prepended with the model baseUrl) or an absolute URL. */
  mcp(pathOrUrl: string): McpClient {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : this.requireApi().baseUrl + pathOrUrl;
    return new McpClient(this.config, url, this.apiCred?.token);
  }

  console<T>(api: string, data: Record<string, unknown>): Promise<T> {
    if (!this.consoleCred) {
      throw new BailianError("This command needs a console access token.", ExitCode.AUTH);
    }
    // Pass only `api` + `data`; region / site / switchAgent come from config.
    return callConsoleGateway(this.config, this.consoleCred.token, { api, data }) as Promise<T>;
  }
}
