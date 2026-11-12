import { defineCommand } from "bailian-cli-core";
import {
  APP_ID_FLAG,
  CONFIG_FLAGS,
  FLOW_SAVE_API,
  consoleCall,
  consoleDryRunPreview,
  fetchWorkflowCanvas,
  readConfigJson,
  validateConfigFlags,
} from "../shared.ts";

export default defineCommand({
  description: {
    "en-US": "Save a workflow canvas (replaces the current draft)",
    "zh-CN": "保存工作流画布（整幅替换当前草稿）",
  },
  auth: "console",
  usageArgs: "--app-id <id> (--config-json <json> | --config-file <path>) [flags]",
  flags: {
    ...APP_ID_FLAG,
    ...CONFIG_FLAGS,
    flowVersion: {
      type: "string",
      valueHint: "<version>",
      description: {
        "en-US": "Expected current version for optimistic locking (default: read from server)",
        "zh-CN": "乐观锁期望的当前版本（默认：从服务端读取）",
      },
    },
  },
  notes: [
    {
      "en-US":
        "The canvas config is a whole-document replacement of the draft. Export it first with `app workflow get --output-file`, edit, then save. Without --flow-version the current version is read from the server (requires a console token, also for --dry-run).",
      "zh-CN":
        "画布 config 为整幅替换草稿。建议先用 `app workflow get --output-file` 导出、编辑后再保存。不带 --flow-version 时从服务端读取当前版本（需要 console 凭证，--dry-run 同样需要）。",
    },
  ],
  exampleArgs: [
    "--app-id abc123 --config-file ./canvas.json",
    '--app-id abc123 --config-json \'{"nodes":[],"edges":[]}\'',
    "--app-id abc123 --config-file ./canvas.json --flow-version 5",
  ],
  validate: (flags) => {
    const conflict = validateConfigFlags(flags);
    if (conflict) return conflict;
    if (flags.configJson === undefined && flags.configFile === undefined) {
      return {
        "en-US": "One of --config-json or --config-file is required",
        "zh-CN": "必须提供 --config-json 或 --config-file 之一",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const appCode = flags.appId;
    const canvas = await readConfigJson(flags);

    let version = flags.flowVersion;
    if (version === undefined) {
      const current = await fetchWorkflowCanvas(ctx.client, appCode);
      version = current.version;
    }
    const data = { appCode, config: JSON.stringify(canvas), version };

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, FLOW_SAVE_API, data));
      return;
    }

    const payload = await consoleCall(ctx.client, FLOW_SAVE_API, data);
    ctx.output.result(
      { app_code: appCode, version, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Workflow ${appCode} canvas saved (version ${version}).`,
              "zh-CN": `工作流 ${appCode} 画布已保存（版本 ${version}）。`,
            }),
          }
        : undefined,
    );
  },
});
