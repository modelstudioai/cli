import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_DELETE_API,
  APP_ID_FLAG,
  consoleCall,
  consoleDryRunPreview,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Delete a Bailian application (agent or workflow)",
    "zh-CN": "删除百炼应用（智能体或工作流）",
  },
  auth: "console",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the application and its configuration. Confirm the app ID before proceeding.",
      "zh-CN": "该操作会永久删除应用及其配置，请确认应用 ID。",
    },
  },
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
  },
  notes: [
    {
      "en-US": "Deletion is irreversible. Run `app list` or `app get` first to confirm the app ID.",
      "zh-CN": "删除不可撤销。建议先用 `app list` 或 `app get` 确认应用 ID。",
    },
  ],
  exampleArgs: ["--app-id abc123", "--app-id abc123 --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const code = flags.appId;
    const data = { reqDTO: { code } };

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, APP_CONTROL_DELETE_API, data));
      return;
    }

    const payload = await consoleCall(ctx.client, APP_CONTROL_DELETE_API, data);
    ctx.output.result(
      { app_code: code, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Application ${code} deleted.`,
              "zh-CN": `应用 ${code} 已删除。`,
            }),
          }
        : undefined,
    );
  },
});
