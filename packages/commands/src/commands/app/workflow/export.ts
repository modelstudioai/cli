import { BailianError, ExitCode, defineCommand } from "bailian-cli-core";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
import {
  APP_ID_FLAG,
  FLOW_EXPORT_DSL_API,
  asRecord,
  consoleCall,
  consoleDryRunPreview,
} from "../shared.ts";

export default defineCommand({
  description: {
    "en-US": "Export a workflow as a DSL schema (download URL)",
    "zh-CN": "导出工作流 DSL（返回下载地址）",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    flowVersion: {
      type: "string",
      valueHint: "<version>",
      description: {
        "en-US": "Published version to export (default: current draft)",
        "zh-CN": "要导出的已发布版本（默认：当前草稿）",
      },
    },
    outputFile: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": "Download the DSL to this file instead of printing the URL",
        "zh-CN": "将 DSL 下载到该文件，而非仅输出下载地址",
      },
    },
  },
  exampleArgs: [
    "--app-id abc123",
    "--app-id abc123 --flow-version 3",
    "--app-id abc123 --output-file ./flow.dsl",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const appCode = flags.appId;
    const data: Record<string, unknown> = { appCode };
    if (flags.flowVersion !== undefined) data.version = flags.flowVersion;

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, FLOW_EXPORT_DSL_API, data));
      return;
    }

    const payload = asRecord(await consoleCall(ctx.client, FLOW_EXPORT_DSL_API, data));
    const url = payload.result;
    if (typeof url !== "string" || !url) {
      throw new BailianError(
        "Console returned no DSL download URL.",
        ExitCode.GENERAL,
        "Check the app ID and version.",
      );
    }

    if (flags.outputFile !== undefined) {
      const { size } = await downloadFile(url, flags.outputFile, {
        quiet: settings.quiet || settings.output === "json",
      });
      ctx.output.result(
        { app_code: appCode, saved: flags.outputFile, size: formatBytes(size) },
        settings.output === "text"
          ? {
              text: ctx.localize({
                "en-US": `DSL downloaded to ${flags.outputFile}`,
                "zh-CN": `DSL 已下载到 ${flags.outputFile}`,
              }),
            }
          : undefined,
      );
      return;
    }

    ctx.output.result({ app_code: appCode, url });
  },
});
