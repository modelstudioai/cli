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
    description: "Alibaba Cloud Access Key ID",
    required: true,
  },
  accessKeySecret: {
    type: "string",
    valueHint: "<secret>",
    description: "Alibaba Cloud Access Key Secret",
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Generate a CLI access token using OpenAPI AK/SK",
  auth: "none",
  usageArgs: "--access-key-id <id> --access-key-secret <secret>",
  flags: FLAGS,
  exampleArgs: ["--access-key-id LTAIxxxxx --access-key-secret xxxxx"],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const resp = await generateCLIAccessToken({
      identity,
      settings,
      baseUrl: ctx.client.baseUrl,
      accessKeyId: flags.accessKeyId,
      accessKeySecret: flags.accessKeySecret,
    });

    emitResult(resp, format);
  },
});
