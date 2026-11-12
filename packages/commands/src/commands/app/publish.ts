import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_PUBLISH_API,
  APP_ID_FLAG,
  consoleCall,
  consoleDryRunPreview,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Publish a Bailian agent application",
    "zh-CN": "发布百炼智能体应用",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    description: {
      type: "string",
      valueHint: "<text>",
      description: { "en-US": "Version description", "zh-CN": "版本描述" },
    },
  },
  notes: [
    {
      "en-US":
        "Publishes the current agent draft via app-control 2.0. To publish a workflow, use `app workflow publish`.",
      "zh-CN": "通过 app-control 2.0 发布智能体当前草稿。发布工作流请用 `app workflow publish`。",
    },
  ],
  exampleArgs: ["--app-id abc123", '--app-id abc123 --description "Release v2"'],
  async run(ctx) {
    const { settings, flags } = ctx;
    const code = flags.appId;
    const reqDTO: Record<string, unknown> = { code };
    if (flags.description !== undefined) reqDTO.version_description = flags.description;
    const data = { reqDTO };

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, APP_CONTROL_PUBLISH_API, data));
      return;
    }

    const payload = await consoleCall(ctx.client, APP_CONTROL_PUBLISH_API, data);
    ctx.output.result(
      { app_code: code, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Application ${code} published.`,
              "zh-CN": `应用 ${code} 已发布。`,
            }),
          }
        : undefined,
    );
  },
});
