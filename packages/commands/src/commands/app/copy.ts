import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_COPY_API,
  APP_ID_FLAG,
  consoleCall,
  consoleDryRunPreview,
  extractAppCode,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Copy a Bailian application (agent or workflow)",
    "zh-CN": "复制百炼应用（智能体或工作流）",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
  },
  exampleArgs: ["--app-id abc123"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const code = flags.appId;
    const data = { reqDTO: { code } };

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, APP_CONTROL_COPY_API, data));
      return;
    }

    const payload = await consoleCall(ctx.client, APP_CONTROL_COPY_API, data);
    const newAppCode = extractAppCode(payload);
    ctx.output.result(
      { app_code: newAppCode ?? null, source_app_code: code, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Application copied: ${newAppCode ?? "(see result)"}`,
              "zh-CN": `应用已复制：${newAppCode ?? "（见 result）"}`,
            }),
          }
        : undefined,
    );
  },
});
