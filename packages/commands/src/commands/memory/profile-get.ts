import {
  defineCommand,
  userProfilePath,
  detectOutputFormat,
  type UserProfileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

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

    const format = detectOutputFormat(settings.output);
    const params = new URLSearchParams({ user_id: userId });
    const path = `${userProfilePath(schemaId)}?${params.toString()}`;

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(path), method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<UserProfileResponse>({
      path,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      if (response.profile?.attributes) {
        for (const attr of response.profile.attributes) {
          emitBare(`${attr.name}: ${attr.value ?? "(empty)"}`);
        }
      } else {
        emitBare("No profile data found.");
      }
    } else {
      emitResult(response, format);
    }
  },
});
