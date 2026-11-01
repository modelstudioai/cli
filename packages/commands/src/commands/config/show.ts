import {
  DEFAULT_LANGUAGE,
  defineCommand,
  detectOutputFormat,
  formatOutput,
  maskToken,
  normalizeModelBaseUrl,
  REGIONS,
  resolveModelConnectionProvenance,
  type CredentialSource,
  type ResolutionSources,
} from "bailian-cli-core";
import { ansi } from "bailian-cli-runtime";
import { SECRET_KEYS } from "./shared.ts";

function markActive(value: string, isActive: boolean, suffix: string): string {
  return isActive ? `${value}${suffix}` : value;
}

export default defineCommand({
  description: { "en-US": "Display current configuration", "zh-CN": "显示当前配置" },
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings, localize } = ctx;
    const store = ctx.configStore;
    const file = store.read();
    const format = detectOutputFormat(settings.output);
    const activeSuffix = localize({
      "en-US": " (active)",
      "zh-CN": "（active）",
    });

    // auth:none — no credential flags; file + env match the dispatch resolution chain.
    const sources: ResolutionSources = {
      flags: {},
      file,
      env: process.env,
      configName: settings.configName,
      configPath: store.path,
    };
    const provenance = resolveModelConnectionProvenance(sources);

    const envApiKey = process.env.DASHSCOPE_API_KEY?.trim();
    const envBaseUrl = process.env.DASHSCOPE_BASE_URL?.trim();

    const result: Record<string, unknown> = {
      ...file,
      language: file.language ?? DEFAULT_LANGUAGE,
      output: settings.output,
      timeout: settings.timeout,
      watermark: settings.watermark,
      config: settings.configName ?? "default",
      config_file: store.path,
    };

    // Keep field values machine-clean; decorate only for text output below.
    if (typeof file.api_key === "string") {
      result.api_key = maskToken(file.api_key);
    }

    if (envApiKey) {
      result.DASHSCOPE_API_KEY = maskToken(envApiKey);
    }

    if (typeof file.base_url === "string") {
      result.base_url = file.base_url;
    } else {
      // Always show the built-in default when the file omits base_url.
      result.base_url = REGIONS.cn;
    }

    if (envBaseUrl) {
      // Match the request path: origin only, so userinfo/query/fragment are not printed.
      result.DASHSCOPE_BASE_URL = normalizeModelBaseUrl(envBaseUrl);
    }

    for (const key of SECRET_KEYS) {
      if (key === "api_key") continue;
      if (typeof result[key] === "string") result[key] = maskToken(result[key] as string);
    }

    const active: { api_key?: CredentialSource; base_url?: CredentialSource } = {};
    if (provenance.apiKeySource) active.api_key = provenance.apiKeySource;
    if (provenance.baseUrlSource) active.base_url = provenance.baseUrlSource;

    if (format === "json") {
      result.active = active;
      ctx.output.result(result);
      return;
    }

    const payload = { ...result, active };

    // Text: append (active) to the winning layer's displayed value.
    if (typeof result.api_key === "string") {
      result.api_key = markActive(
        result.api_key,
        provenance.apiKeySource === "config",
        activeSuffix,
      );
    }
    if (typeof result.DASHSCOPE_API_KEY === "string") {
      result.DASHSCOPE_API_KEY = markActive(
        result.DASHSCOPE_API_KEY,
        provenance.apiKeySource === "env",
        activeSuffix,
      );
    }
    if (typeof result.base_url === "string") {
      const baseUrlActive =
        provenance.baseUrlSource === "config" || provenance.baseUrlSource === undefined;
      result.base_url = markActive(result.base_url, baseUrlActive, activeSuffix);
    }
    if (typeof result.DASHSCOPE_BASE_URL === "string") {
      result.DASHSCOPE_BASE_URL = markActive(
        result.DASHSCOPE_BASE_URL,
        provenance.baseUrlSource === "env",
        activeSuffix,
      );
    }

    // Color after render so YAML does not escape ANSI into values.
    const rendered = formatOutput(result, format);
    ctx.output.result(payload, {
      text: rendered.replaceAll(activeSuffix, ansi(process.stdout).cyan(activeSuffix)),
    });
  },
});
