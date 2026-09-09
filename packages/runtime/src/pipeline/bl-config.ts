import {
  Client,
  buildSources,
  buildSettings,
  resolveApiKey,
  resolveModelBaseUrl,
  type ApiKeyCredential,
  type Identity,
  type ResolutionSources,
  type Settings,
} from "bailian-cli-core";

/** Pipeline step 的迷你边界:client(带 model 域凭证,若有)+ 有效 settings。 */
export interface PipelineEnv {
  client: Client;
  settings: Settings;
}

/** Media steps that inherit Profile `watermark` when the YAML omits the field. */
export const PIPELINE_WATERMARK_STEPS = new Set(["image/generate", "image/edit", "video/generate"]);

/**
 * Fill Profile watermark into a planned/executed step input.
 * Explicit step `watermark` wins; otherwise use Settings (file → default true).
 */
export function applyProfileWatermarkToStepInput(
  stepType: string,
  input: Record<string, unknown>,
  settings: Settings,
): Record<string, unknown> {
  if (!PIPELINE_WATERMARK_STEPS.has(stepType) || input.watermark !== undefined) return input;
  return { ...input, watermark: settings.watermark };
}

/**
 * Build the in-process env for pipeline steps. Uses the same source resolution
 * as the CLI itself (env vars, config file; no CLI flags), but forces JSON
 * output + quiet mode.
 */
export function buildPipelineEnv(): PipelineEnv {
  const sources: ResolutionSources = buildSources({});
  const settings: Settings = {
    ...buildSettings(sources),
    output: "json",
    outputExplicit: true,
    quiet: true,
  };
  const identity: Identity = {
    binName: "bl",
    version: "0.0.0-dev",
    npmPackage: "bailian-cli",
    clientName: "bailian-cli",
  };
  let apiCred: ApiKeyCredential | undefined;
  try {
    apiCred = resolveApiKey(sources);
  } catch {
    /* 无 key:步骤真正发请求时由 Client 报错 */
  }
  return {
    client: new Client({ identity, settings, baseUrl: resolveModelBaseUrl(sources), apiCred }),
    settings,
  };
}
