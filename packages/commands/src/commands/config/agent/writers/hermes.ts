import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import yaml from "yaml";
import { BailianError, ExitCode } from "bailian-cli-core";
import {
  backup,
  writeTextAtomic,
  isAnthropicEndpoint,
  type AgentDef,
} from "./utils.ts";

/**
 * Hermes config follows the Alibaba Cloud Model Studio doc: a flat `model`
 * block carries the endpoint inline. Anthropic-compatible endpoints set
 * `api_mode: anthropic_messages`; OpenAI-compatible endpoints omit `api_mode`.
 */
export default {
  label: "Hermes Agent",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".hermes", "config.yaml");

    backup(configPath);

    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = (yaml.parse(readFileSync(configPath, "utf-8")) ??
          {}) as Record<string, unknown>;
      } catch (error) {
        throw new BailianError(
          `Failed to parse existing config: ${configPath}`,
          ExitCode.GENERAL,
          `Fix or back up the file, then retry. Underlying error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const modelBlock: Record<string, unknown> = {
      default: model,
      provider: "custom",
      base_url: baseUrl,
      api_key: apiKey,
    };
    // Anthropic endpoints require api_mode; OpenAI-compatible ones omit it.
    if (isAnthropicEndpoint(baseUrl))
      modelBlock.api_mode = "anthropic_messages";

    config.model = modelBlock;

    writeTextAtomic(configPath, yaml.stringify(config));

    return {
      paths: [configPath],
      nextStep: 'Run `hermes chat -q "hello"` to verify.',
    };
  },
} satisfies AgentDef;
