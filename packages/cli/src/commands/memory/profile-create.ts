import {
  defineCommand,
  requestJson,
  profileSchemaEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type ProfileSchemaCreateRequest,
  type ProfileSchemaCreateResponse,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "memory profile create",
  description: "Create a user profile schema for memory profiling",
  usage: "bl memory profile create --name <name> --attributes <json> [flags]",
  options: [
    { flag: "--name <name>", description: "Schema name (required)", required: true },
    { flag: "--description <text>", description: "Schema description" },
    {
      flag: "--attributes <json>",
      description: 'Attributes JSON array: [{"name":"age","description":"年龄"}]',
      required: true,
    },
  ],
  examples: [
    'bl memory profile create --name "user_basic" --attributes \'[{"name":"age","description":"年龄"},{"name":"hobby","description":"爱好"}]\'',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const name = flags.name as string;
    if (!name) failIfMissing("name", "bl memory profile create --name <name> --attributes <json>");

    const attrStr = flags.attributes as string;
    if (!attrStr)
      failIfMissing("attributes", "bl memory profile create --name <name> --attributes <json>");

    let attributes;
    try {
      attributes = JSON.parse(attrStr);
    } catch {
      process.stderr.write("Error: --attributes must be valid JSON array\n");
      process.exit(1);
    }

    const body: ProfileSchemaCreateRequest = { name, attributes };
    if (flags.description) body.description = flags.description as string;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ endpoint: profileSchemaEndpoint(config.baseUrl), request: body }, format);
      return;
    }

    const url = profileSchemaEndpoint(config.baseUrl);
    const response = await requestJson<ProfileSchemaCreateResponse>(config, {
      url,
      method: "POST",
      body,
    });

    if (config.quiet || format === "text") {
      emitBare(`Profile schema created: ${response.profile_schema_id}`);
    } else {
      emitResult(response, format);
    }
  },
});
