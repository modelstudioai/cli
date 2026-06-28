import { resolve } from "node:path";
import { defineCommand } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { initPipelineSteps } from "bailian-cli-runtime";
import { collectPipelineIssues, collectPipelineHints } from "bailian-cli-runtime";
import { loadPipelineFile } from "./load-file.ts";

export default defineCommand({
  description: "Validate a pipeline definition without executing",
  auth: "none",
  usageArgs: "--file <path>",
  flags: {
    file: {
      type: "string",
      valueHint: "<path>",
      description: "Pipeline definition file (YAML/JSON)",
      required: true,
    },
  },
  exampleArgs: ["--file workflow.yaml", "--file workflow.json --output json"],
  async run(ctx) {
    const { config, flags } = ctx;
    const file = flags.file;

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
