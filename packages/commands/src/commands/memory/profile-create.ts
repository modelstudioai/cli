import {
  defineCommand,
  requestJson,
  profileSchemaEndpoint,
  detectOutputFormat,
  type ProfileSchemaCreateRequest,
  type ProfileSchemaCreateResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Create a user profile schema for memory profiling",
  auth: "apiKey",
  usageArgs: "--name <name> --attributes <json> [flags]",
  flags: {
    name: {
      type: "string",
      valueHint: "<name>",
      description: "Schema name (required)",
      required: true,
    },
    description: { type: "string", valueHint: "<text>", description: "Schema description" },
    attributes: {
      type: "string",
      valueHint: "<json>",
      description: 'Attributes JSON array: [{"name":"age","description":"age"}]',
      required: true,
    },
  },
  exampleArgs: [
    '--name "user_basic" --attributes \'[{"name":"age","description":"age"},{"name":"hobby","description":"hobby"}]\'',
  ],
  async run(config, flags) {
    const name = flags.name;
    const attrStr = flags.attributes;

    let attributes;
    try {
      attributes = JSON.parse(attrStr);
    } catch {
      process.stderr.write("Error: --attributes must be valid JSON array\n");
      process.exit(1);
    }

    const body: ProfileSchemaCreateRequest = { name, attributes };
    if (flags.description) body.description = flags.description;

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
