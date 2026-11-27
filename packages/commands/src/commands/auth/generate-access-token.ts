import { defineCommand, generateCLIAccessToken } from "bailian-cli-core";

export default defineCommand({
  description: {
    "en-US": "Generate a CLI access token using OpenAPI credentials",
    "zh-CN": "使用 OpenAPI 凭据生成 CLI Access Token",
  },
  auth: "openapi",
  usageArgs: "[flags]",
  exampleArgs: ["", "--access-key-id LTAIxxxxx --access-key-secret xxxxx --security-token <token>"],
  async run(ctx) {
    const { identity, settings } = ctx;
    if (settings.dryRun) {
      const pre = settings.preControlPlane
        ? {
            environment: "pre",
            host: ctx.client.resolveOpenApiHost("modelstudio.cn-beijing.aliyuncs.com"),
          }
        : {};
      ctx.output.result(
        { action: "auth.generate-access-token", config: settings.configName ?? "default", ...pre },
        {
          text: ctx.localize({
            "en-US":
              "Would generate a CLI access token using the selected OpenAPI credentials without saving it.",
            "zh-CN": "将使用所选 OpenAPI 凭据生成 CLI Access Token，不保存该令牌。",
          }),
        },
      );
      return;
    }
    const response = await generateCLIAccessToken({
      identity,
      settings,
      debug: (record) => ctx.output.debug(record),
      baseUrl: ctx.client.baseUrl,
      client: ctx.client,
    });
    ctx.output.result(response);
  },
});
