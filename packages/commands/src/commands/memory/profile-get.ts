import {
  defineCommand,
  requestJson,
  userProfileEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type UserProfileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Get user profile by schema ID and user ID",
  auth: "apiKey",
  usageArgs: "--schema-id <id> --user-id <id>",
  options: [
    { flag: "--schema-id <id>", description: "Profile schema ID (required)", required: true },
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
  ],
  exampleArgs: ["--schema-id schema_xxx --user-id user1"],
  async run(config: Config, flags: GlobalFlags) {
    const schemaId = flags.schemaId as string;
    const userId = flags.userId as string;

    const format = detectOutputFormat(config.output);
    const params = new URLSearchParams({ user_id: userId });
    const url = `${userProfileEndpoint(config.baseUrl, schemaId)}?${params.toString()}`;

    if (config.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await requestJson<UserProfileResponse>(config, {
      url,
      method: "GET",
    });

    if (config.quiet || format === "text") {
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
