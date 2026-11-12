import { CONSOLE_FILE_URL_API, getConsoleFileUrl } from "bailian-cli-core";
import { defineConsoleReadCommand, consoleReadTargetPreview } from "../shared/console-read.ts";

export default defineConsoleReadCommand({
  description: {
    "en-US": "Resolve a Console business file key to a file URL",
    "zh-CN": "将 Console 业务文件键解析为文件 URL",
  },
  auth: "console",
  defaultOutput: "json",
  usageArgs: "--file-key <key>",
  flags: {
    fileKey: {
      type: "string",
      valueHint: "<key>",
      description: {
        "en-US": "Console business file key, not an existing URL or oss:// URI",
        "zh-CN": "Console 业务文件键，不是已有 URL 或 oss:// URI",
      },
      required: true,
    },
  },
  notes: [
    {
      "en-US": "Uses Console-domain authentication and the selected Console scope.",
      "zh-CN": "使用 Console 域鉴权及所选 Console 作用域。",
    },
    {
      "en-US":
        "The business file key is not the DashScope temporary oss:// URI returned by file upload.",
      "zh-CN": "业务文件键不等同于 file upload 返回的 DashScope 临时 oss:// URI。",
    },
    {
      "en-US": "If you already have a file URL, use it directly; this command is unnecessary.",
      "zh-CN": "如果已有文件 URL，直接使用即可，无需此命令。",
    },
    {
      "en-US":
        "Only resolves the address and returns the service fields; it does not download files, write local files, or calculate a fixed expiry time.",
      "zh-CN": "仅解析地址并返回服务端字段；不自动下载、不写本地文件，也不计算固定到期时间。",
    },
  ],
  exampleArgs: ["--file-key example-file-key", "--file-key example-file-key --dry-run"],
  validate(flags) {
    if (!flags.fileKey.trim()) {
      return {
        "en-US": "--file-key must not be empty or whitespace.",
        "zh-CN": "--file-key 不能为空或仅包含空白字符。",
      };
    }
    if (/^(?:https?|oss):\/\//i.test(flags.fileKey.trim())) {
      return {
        "en-US":
          "--file-key expects a business file key, not an existing HTTP(S) URL or oss:// URI.",
        "zh-CN": "--file-key 需要业务文件键，而不是已有 HTTP(S) URL 或 oss:// URI。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const fileKey = ctx.flags.fileKey;
    if (ctx.settings.dryRun) {
      const plan = {
        action: "file.url",
        api: CONSOLE_FILE_URL_API,
        data: { fileKey },
        ...consoleReadTargetPreview(ctx.settings),
      };
      ctx.output.result(plan, { text: JSON.stringify(plan, null, 2) });
      return;
    }

    const result = await getConsoleFileUrl(ctx.client, fileKey);
    ctx.output.result(result, { text: JSON.stringify(result, null, 2) });
  },
});
