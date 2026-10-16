import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { getPiAgentDir } from "../pi-home.ts";
import {
  backup,
  isAnthropicEndpoint,
  stripJsonc,
  writeJsonAtomic,
  type AgentDef,
} from "./utils.ts";

const PROVIDER_ID = "bailian-cli";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default {
  label: "Pi",
  write({
    baseUrl,
    apiKey,
    model,
    localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
  }) {
    const agentDir = getPiAgentDir();
    const paths = ["models.json", "auth.json", "settings.json"].map((filename) =>
      join(agentDir, filename),
    );
    const originals = paths.map((path) =>
      existsSync(path) ? readFileSync(path, "utf8") : undefined,
    );
    // Read every file before writing any of them. Malformed user config must
    // fail closed rather than silently discarding providers or credentials.
    const configs = paths.map((path, index) => {
      try {
        const original = originals[index];
        const content = original?.replace(/^\uFEFF/, "");
        const parsed: unknown =
          content === undefined ? {} : JSON.parse(index === 0 ? stripJsonc(content) : content);
        if (!isObject(parsed)) throw new Error("root value is not an object");
        return parsed;
      } catch {
        throw new BailianError(
          localize({
            "en-US": `Cannot update Pi because ${path} is invalid; no configuration was changed.`,
            "zh-CN": `无法更新 Pi：${path} 格式无效，配置未被修改。`,
          }),
          ExitCode.GENERAL,
        );
      }
    });
    const [modelsConfig, authConfig, settingsConfig] = configs;
    if (modelsConfig.providers !== undefined && !isObject(modelsConfig.providers)) {
      throw new BailianError(
        localize({
          "en-US":
            "Cannot update Pi because models.json providers is not an object; no configuration was changed.",
          "zh-CN": "无法更新 Pi：models.json 中的 providers 必须为对象，配置未被修改。",
        }),
        ExitCode.GENERAL,
      );
    }
    const providers = (modelsConfig.providers ?? {}) as Record<string, unknown>;
    const existing = providers[PROVIDER_ID];
    if (
      existing !== undefined &&
      (!isObject(existing) || (existing.models !== undefined && !Array.isArray(existing.models)))
    ) {
      throw new BailianError(
        localize({
          "en-US":
            "Cannot update Pi because the bailian-cli provider is invalid; no configuration was changed.",
          "zh-CN": "无法更新 Pi：bailian-cli provider 格式无效，配置未被修改。",
        }),
        ExitCode.GENERAL,
      );
    }
    const provider = (existing ?? {}) as Record<string, unknown>;
    const models = (provider.models ?? []) as Record<string, unknown>[];
    const existingModel = models.find((entry) => entry.id === model);
    const updatedModel: Record<string, unknown> = {
      ...existingModel,
      id: model,
      name: existingModel?.name ?? model,
    };
    // Pi gives model-level connection fields precedence over provider defaults.
    // Reconfiguration must use the newly selected endpoint and protocol.
    delete updatedModel.baseUrl;
    delete updatedModel.api;
    provider.models = existingModel
      ? models.map((entry) => (entry.id === model ? updatedModel : entry))
      : [...models, updatedModel];
    provider.baseUrl = baseUrl;
    provider.api = isAnthropicEndpoint(baseUrl) ? "anthropic-messages" : "openai-completions";
    // Authentication belongs in Pi's private credential store, not model metadata.
    delete provider.apiKey;
    providers[PROVIDER_ID] = provider;
    modelsConfig.providers = providers;
    authConfig[PROVIDER_ID] = { type: "api_key", key: apiKey };
    settingsConfig.defaultProvider = PROVIDER_ID;
    settingsConfig.defaultModel = model;

    for (const [index, path] of paths.entries()) {
      backup(path);
      writeJsonAtomic(path, configs[index]);
    }
    return {
      paths,
      nextStep: localize({
        "en-US": "Run `pi` to start using Pi with DashScope.",
        "zh-CN": "运行 `pi` 开始使用百炼模型。",
      }),
    };
  },
} satisfies AgentDef;
