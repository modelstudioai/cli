import {
  defineCommand,
  detectOutputFormat,
  generateCLIAccessToken,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const FLAGS = {
  accessKeyId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Alibaba Cloud Access Key ID", "zh-CN": "阿里云 Access Key ID" },
    required: true,
  },
  accessKeySecret: {
    type: "string",
    valueHint: "<secret>",
    description: {
      "en-US": "Alibaba Cloud Access Key Secret",
      "zh-CN": "阿里云 Access Key Secret",
    },
    required: true,
  },
  securityToken: {
    type: "string",
    valueHint: "<token>",
    description: {
      "en-US": "Alibaba Cloud STS Security Token to store (optional)",
      "zh-CN": "要保存的阿里云 STS Security Token（可选）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Generate a CLI access token using OpenAPI AK/SK",
    "zh-CN": "使用 OpenAPI AK/SK 生成 CLI Access Token",
  },
  auth: "none",
  usageArgs: "--access-key-id <id> --access-key-secret <secret> --security-token <token>",
  flags: FLAGS,
  exampleArgs: ["--access-key-id LTAIxxxxx --access-key-secret xxxxx --security-token <token>"],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const resp = await generateCLIAccessToken({
      identity,
      settings,
      baseUrl: ctx.client.baseUrl,
      accessKeyId: flags.accessKeyId,
      accessKeySecret: flags.accessKeySecret,
      securityToken: flags.securityToken || undefined,
    });

    emitResult(resp, format);
  },
});
