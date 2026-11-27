import { formatCommand, type Identity, type LocalizedText } from "bailian-cli-core";
import { akskGuidePage } from "bailian-cli-runtime";
import { isOpenPathTimeout, openInBrowser } from "../shared/local-server.ts";
import { resolveConsoleOrigin, type LoginDeps } from "./login-console.ts";

/**
 * How long this guide may wait on the OS opener before calling the outcome
 * unconfirmed. The command prints a paste-ready follow-up command and must hand the
 * prompt back for it, so it opts into a cap that other `openPath` callers do not pay.
 */
const OPEN_WAIT_CAP_MS = 5_000;

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
 *
 * The wait is capped via `openInBrowser(url, { timeoutMs })`: on desktops where
 * `xdg-open` stays attached to the browser, an uncapped await would keep the prompt
 * away and the user could not paste the follow-up command. An opener killed at that
 * cap is an unconfirmed outcome — never reported as a failure, never as a success.
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
      await openInBrowser(url, { timeoutMs: OPEN_WAIT_CAP_MS });
      browserOpened = true;
    } catch (error: unknown) {
      if (isOpenPathTimeout(error)) {
        deps.output.warning(
          localizeGuide(deps, {
            "en-US":
              "Could not confirm the browser opened: the system open command did not return in time. Open the URL above manually if no tab appeared.",
            "zh-CN":
              "未能确认浏览器是否打开：系统打开命令超时未返回。若没有新标签页，请手动打开上方地址。",
          }),
        );
      } else {
        const reason = error instanceof Error ? error.message : String(error);
        deps.output.warning(
          localizeGuide(deps, {
            "en-US": `Could not open a browser automatically (${reason}). Open the URL above manually.`,
            "zh-CN": `无法自动打开浏览器（${reason}）。请手动打开上方地址。`,
          }),
        );
      }
    }
  }

  return { url, browserOpened };
}
