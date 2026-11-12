import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_VERSION_LIST_API,
  APP_ID_FLAG,
  APP_TYPE_FLAG,
  FLOW_VERSION_LIST_API,
  consoleCall,
  consoleDryRunPreview,
  resolveAppType,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "List published versions of a Bailian application",
    "zh-CN": "列出百炼应用的已发布版本",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    ...APP_TYPE_FLAG,
  },
  exampleArgs: ["--app-id abc123", "--app-id abc123 --type workflow"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const appType = resolveAppType(flags);
    const code = flags.appId;

    const api = appType === "workflow" ? FLOW_VERSION_LIST_API : APP_CONTROL_VERSION_LIST_API;
    const data = appType === "workflow" ? { appCode: code } : { reqDTO: { code } };

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, api, data));
      return;
    }

    const payload = await consoleCall(ctx.client, api, data);
    ctx.output.result(payload);
  },
});
