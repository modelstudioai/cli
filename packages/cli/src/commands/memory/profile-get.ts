import {
  defineCommand,
  requestJson,
  userProfileEndpoint,
  detectOutputFormat,
  type UserProfileResponse,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "memory profile get",
  description: "Get user profile by schema ID and user ID",
  usage: "bl memory profile get --schema-id <id> --user-id <id>",
  options: [
    { flag: "--schema-id <id>", description: "Profile schema ID (required)", required: true },
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
  ],
  examples: ["bl memory profile get --schema-id schema_xxx --user-id user1"],
  async run(config, flags) {
    const schemaId = flags.schemaId;
    if (!schemaId)
      failIfMissing("schema-id", "bl memory profile get --schema-id <id> --user-id <id>");

    const userId = flags.userId;
    if (!userId) failIfMissing("user-id", "bl memory profile get --schema-id <id> --user-id <id>");

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
