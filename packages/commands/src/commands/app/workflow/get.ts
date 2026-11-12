import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BailianError, ExitCode, defineCommand } from "bailian-cli-core";
import {
  APP_ID_FLAG,
  FLOW_GET_CONFIG_API,
  FLOW_VERSION_GET_API,
  SCOPE_FLAG,
  asRecord,
  consoleCall,
  consoleDryRunPreview,
} from "../shared.ts";

export default defineCommand({
  description: {
    "en-US": "Get a workflow canvas (draft or a published version)",
    "zh-CN": "读取工作流画布（草稿或已发布版本）",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    flowVersion: {
      type: "string",
      valueHint: "<version>",
      description: {
        "en-US": "Published version to read (default: current draft)",
        "zh-CN": "要读取的已发布版本（默认：当前草稿）",
      },
    },
    ...SCOPE_FLAG,
    outputFile: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": "Write the canvas config JSON to this file (overwrites)",
        "zh-CN": "将画布配置 JSON 写入该文件（覆盖写入）",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Without --flow-version, reads the current draft canvas (config + version). With --flow-version, reads a published version (scope defaults to publish). The canvas config is a JSON string; --output-file writes it parsed and pretty-printed.",
      "zh-CN":
        "不带 --flow-version 读取当前草稿画布（config + version）；带 --flow-version 读取已发布版本（scope 默认 publish）。画布 config 是 JSON 字符串；--output-file 会解析并美化后写入。",
    },
  ],
  exampleArgs: [
    "--app-id abc123",
    "--app-id abc123 --flow-version 3",
    "--app-id abc123 --output-file ./canvas.json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const appCode = flags.appId;

    const api = flags.flowVersion !== undefined ? FLOW_VERSION_GET_API : FLOW_GET_CONFIG_API;
    const data =
      flags.flowVersion !== undefined
        ? { appCode, version: flags.flowVersion, scope: flags.scope ?? "publish" }
        : { appCode };

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, api, data));
      return;
    }

    const payload = asRecord(await consoleCall(ctx.client, api, data));

    if (flags.outputFile !== undefined) {
      const config = payload.config;
      if (typeof config !== "string") {
        throw new BailianError(
          "Console returned no workflow canvas config.",
          ExitCode.GENERAL,
          "Check the app ID and version.",
        );
      }
      let pretty: string;
      try {
        pretty = JSON.stringify(JSON.parse(config), null, 2);
      } catch {
        pretty = config;
      }
      const destination = resolve(flags.outputFile);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, pretty, "utf-8");
      ctx.output.result(
        {
          app_code: appCode,
          version: payload.version ?? flags.flowVersion ?? null,
          output_file: destination,
        },
        settings.output === "text"
          ? {
              text: ctx.localize({
                "en-US": `Canvas written to ${destination}`,
                "zh-CN": `画布已写入 ${destination}`,
              }),
            }
          : undefined,
      );
      return;
    }

    ctx.output.result(payload);
  },
});
