import { defineCommand, userProfilePath, type UserProfileResponse } from "bailian-cli-core";

export default defineCommand({
  description: {
    "en-US": "Get user profile by schema ID and user ID",
    "zh-CN": "通过 Schema ID 和用户 ID 获取用户画像",
  },
  auth: "apiKey",
  usageArgs: "--schema-id <id> --user-id <id>",
  flags: {
    schemaId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Profile schema ID (required)",
        "zh-CN": "Profile Schema ID（必填）",
      },
      required: true,
    },
    userId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "User ID (required)", "zh-CN": "用户 ID（必填）" },
      required: true,
    },
  },
  exampleArgs: ["--schema-id schema_xxx --user-id user1"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const schemaId = flags.schemaId;
    const userId = flags.userId;

    const params = new URLSearchParams({ user_id: userId });
    const path = `${userProfilePath(schemaId)}?${params.toString()}`;

    if (settings.dryRun) {
      ctx.output.result({ endpoint: ctx.client.url(path), method: "GET" });
      return;
    }

    const response = await ctx.client.requestJson<UserProfileResponse>({
      path,
      method: "GET",
    });

    let text: string | undefined;
    if (settings.output === "text") {
      const attributes = response.profile?.attributes;
      if (attributes?.length === 0) return;
      text = attributes
        ? attributes
            .map(
              (attribute) =>
                `${attribute.name}: ${attribute.value ?? ctx.localize({ "en-US": "(empty)", "zh-CN": "（空）" })}`,
            )
            .join("\n")
        : ctx.localize({ "en-US": "No profile data found.", "zh-CN": "未找到画像数据。" });
    }
    ctx.output.result(response, { text });
  },
});
