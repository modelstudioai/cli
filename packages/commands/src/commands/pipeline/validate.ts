import { resolve } from "node:path";
import { defineCommand, type Config, type GlobalFlags } from "bailian-cli-core";
import { emitResult, cmdUsage } from "bailian-cli-runtime";
import { initPipelineSteps } from "bailian-cli-runtime";
import { collectPipelineIssues, collectPipelineHints } from "bailian-cli-runtime";
import { loadPipelineFile } from "./load-file.ts";

export default defineCommand({
  description: "Validate a pipeline definition without executing",
  auth: "none",
  usageArgs: "<file>",
  options: [],
  exampleArgs: ["workflow.yaml", "workflow.json --output json"],
  async run(config: Config, flags: GlobalFlags) {
    const file = ((flags._positional as string[] | undefined) ?? [])[0] as string | undefined;
    if (!file) {
      process.stderr.write(
        `Error: pipeline file is required\nUsage: ${cmdUsage(config, "<file>")}\n`,
      );
      process.exit(2);
    }

    initPipelineSteps();

    const filePath = resolve(file);
    const pipeline = await loadPipelineFile(filePath);
    const issues = collectPipelineIssues(pipeline);
    const hints = issues.length === 0 ? collectPipelineHints(pipeline) : [];

    if (config.output === "json") {
      emitResult(
        { valid: issues.length === 0, issues, ...(hints.length > 0 ? { hints } : {}) },
        "json",
      );
      if (issues.length > 0) process.exitCode = 1;
    } else if (issues.length === 0) {
      process.stdout.write("Pipeline definition is valid.\n");
      for (const hint of hints) {
        process.stderr.write(`  hint: ${hint}\n`);
      }
    } else {
      process.stderr.write("Pipeline validation failed:\n");
      for (const issue of issues) {
        process.stderr.write(`  - ${issue}\n`);
      }
      process.exitCode = 1;
    }
  },
});
