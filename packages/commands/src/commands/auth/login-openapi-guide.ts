import { formatCommand, type Identity, type LocalizedText } from "bailian-cli-core";
import { akskGuidePage } from "bailian-cli-runtime";
import { openInBrowser } from "../shared/local-server.ts";
import { resolveConsoleOrigin, type LoginDeps } from "./login-console.ts";

export interface OpenApiGuideOptions {
  site?: string;
  /** Profile name to echo as `--config` in the paste-ready command. */
  config?: string;
  noBrowser?: boolean;
}

export interface OpenApiPasteOptions {
  site?: string;
  config?: string;
}

function localizeGuide(deps: LoginDeps, text: LocalizedText): string {
  if (typeof text === "string") return text;
  return deps.localize ? deps.localize(text) : text["en-US"];
}

/** Console URL for the OpenAPI AK/SK browser guide. */
export function resolveAkskGuideUrl(site?: string): string {
  return akskGuidePage(resolveConsoleOrigin(site));
}

/** Paste-ready command after the browser guide completes. */
export function openApiPasteCommand(identity: Identity, options: OpenApiPasteOptions = {}): string {
  const parts = ["auth login --open-api --access-key-id <id> --access-key-secret <secret>"];
  // Always echo the resolved site. It is exactly the site the guide page targeted,
  // so pinning it can never be wrong; omitting it lets a Profile default override an
  // explicit choice (e.g. file `console_site: international` + `--console-site domestic`
  // would otherwise save the credential to the international gateway).
  if (options.site) {
    parts.push(`--console-site ${options.site}`);
  }
  if (options.config?.trim()) {
    parts.push(`--config ${options.config.trim()}`);
  }
  return formatCommand(identity, parts.join(" "));
}

/**
 * Open (or print) the AK/SK guide page. Does not wait for a callback — SecretKey
 * never returns through the browser. The URL and the paste-ready command are printed
 * before awaiting the opener, so a slow or hanging `open` / `xdg-open` never withholds
 * what the user needs to act on — the same ordering rule `login-console.ts` follows by
 * registering the callback before opening the browser.
 */
export async function runOpenApiGuide(
  deps: LoginDeps,
  options: OpenApiGuideOptions = {},
): Promise<{ url: string; browserOpened: boolean }> {
  const url = resolveAkskGuideUrl(options.site);
  const paste = openApiPasteCommand(deps.identity, {
    site: options.site,
    config: options.config,
  });

  deps.output.info(
    `${localizeGuide(deps, {
      "en-US": "Open the following URL in your browser:",
      "zh-CN": "请在浏览器中打开以下地址：",
    })}\n${url}`,
  );

  deps.output.info(
    localizeGuide(deps, {
      "en-US": `After finishing the guide, return here and paste your AccessKey:\n    ${paste}`,
      "zh-CN": `按照引导完成操作后，回到当前命令行粘贴AccessKey：\n    ${paste}`,
    }),
  );

  let browserOpened = false;
  if (!options.noBrowser) {
    try {
      await openInBrowser(url);
      browserOpened = true;
    } catch (error: unknown) {
      deps.output.warning(
        localizeGuide(deps, {
          "en-US": `Could not open a browser automatically (${error instanceof Error ? error.message : String(error)}). Open the URL above manually.`,
          "zh-CN": `无法自动打开浏览器（${error instanceof Error ? error.message : String(error)}）。请手动打开上方地址。`,
        }),
      );
    }
  }

  return { url, browserOpened };
}
