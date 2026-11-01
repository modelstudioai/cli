import { resolve } from "node:path";
import { BailianError, defineCommand } from "bailian-cli-core";
import { initPipelineSteps } from "bailian-cli-runtime";
import { collectPipelineIssues, collectPipelineHints } from "bailian-cli-runtime";
import { loadPipelineFile } from "./load-file.ts";

export default defineCommand({
  description: {
    "en-US": "Validate a pipeline definition without executing",
    "zh-CN": "验证 Pipeline 定义但不执行",
  },
  auth: "none",
  usageArgs: "--file <path>",
  flags: {
    file: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": "Pipeline definition file (YAML/JSON)",
        "zh-CN": "Pipeline 定义文件（YAML/JSON）",
      },
      required: true,
    },
  },
  exampleArgs: ["--file workflow.yaml", "--file workflow.json --output json"],
  async run(ctx) {
    const { flags } = ctx;
    const file = flags.file;

    initPipelineSteps();

    const filePath = resolve(file);
    const pipeline = await loadPipelineFile(filePath);
    const issues = collectPipelineIssues(pipeline);
    const hints = issues.length === 0 ? collectPipelineHints(pipeline) : [];

    ctx.output.result(
      { valid: issues.length === 0, issues, ...(hints.length > 0 ? { hints } : {}) },
      {
        text:
          issues.length === 0
            ? ctx.localize({
                "en-US": "Pipeline definition is valid.",
                "zh-CN": "Pipeline 定义有效。",
              })
            : ctx.localize({
                "en-US": "Pipeline validation failed:",
                "zh-CN": "Pipeline 校验失败：",
              }) +
              "\n" +
              issues.map((issue) => `  - ${issue}`).join("\n"),
      },
    );
    for (const hint of hints) ctx.output.info(`  hint: ${hint}`);
    if (issues.length > 0) {
      throw new BailianError(
        ctx.localize({ "en-US": "Pipeline validation failed.", "zh-CN": "Pipeline 校验失败。" }),
      );
    }
  },
});
