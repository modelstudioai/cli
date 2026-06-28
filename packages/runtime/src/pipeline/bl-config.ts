import { loadConfig, type Config, type GlobalFlags } from "bailian-cli-core";

const PIPELINE_FLAGS: GlobalFlags = {
  output: "json",
  nonInteractive: true,
  noColor: true,
  quiet: true,
  verbose: false,
  yes: false,
  dryRun: false,
  help: false,
  version: false,
  async: false,
};

/**
 * Build a Config suitable for in-process API calls from within pipeline steps.
 * Uses the same config resolution (env vars, config file) as the CLI itself,
 * but forces JSON output + non-interactive + quiet mode.
 */
export function buildPipelineConfig(): Config {
  const config = loadConfig(PIPELINE_FLAGS);
  config.clientName = "bailian-cli";
  return config;
}
