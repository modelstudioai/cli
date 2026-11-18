import { formatCommand, type Identity, type LocalizedText } from "bailian-cli-core";
import { akskGuidePage } from "bailian-cli-runtime";
import { openInBrowser } from "../shared/local-server.ts";
import { resolveConsoleOrigin, type LoginDeps } from "./login-console.ts";

export interface OpenApiGuideOptions {
  site?: string;
  noBrowser?: boolean;
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
export function openApiPasteCommand(identity: Identity): string {
  return formatCommand(
    identity,
    "auth login --open-api --access-key-id <id> --access-key-secret <secret>",
  );
}

/**
 * Open (or print) the AK/SK guide page. Does not wait for a callback — SecretKey
 * never returns through the browser.
 */
export async function runOpenApiGuide(
  deps: LoginDeps,
  options: OpenApiGuideOptions = {},
): Promise<{ url: string }> {
  const url = resolveAkskGuideUrl(options.site);
  const paste = openApiPasteCommand(deps.identity);

  deps.output.info(
    `${localizeGuide(deps, {
      "en-US": "Open the following URL in your browser:",
      "zh-CN": "请在浏览器中打开以下地址：",
    })}\n${url}`,
  );

  if (!options.noBrowser) {
    void openInBrowser(url).then(
      () => undefined,
      (error: unknown) => {
        deps.output.warning(
          localizeGuide(deps, {
            "en-US": `Could not open a browser automatically (${error instanceof Error ? error.message : String(error)}). Open the URL above manually.`,
            "zh-CN": `无法自动打开浏览器（${error instanceof Error ? error.message : String(error)}）。请手动打开上方地址。`,
          }),
        );
      },
    );
  }

  deps.output.info(
    localizeGuide(deps, {
      "en-US": `After finishing the guide, return here and paste your AccessKey:\n    ${paste}`,
      "zh-CN": `按照引导完成操作后，回到当前命令行粘贴AccessKey：\n    ${paste}`,
    }),
  );

  return { url };
}
