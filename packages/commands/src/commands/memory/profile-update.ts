import {
  defineCommand,
  UsageError,
  profileSchemaItemPath,
  detectOutputFormat,
  type ProfileSchemaUpdateRequest,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import type { FlagsDef, ParsedFlags } from "bailian-cli-core";

const UPDATE_FLAGS = {
  schemaId: {
    type: "string",
    valueHint: "<id>",
    description: "Profile schema ID (required)",
    required: true,
  },
  name: { type: "string", valueHint: "<name>", description: "New schema name" },
  description: { type: "string", valueHint: "<text>", description: "New schema description" },
  attributeOps: {
    type: "string",
    valueHint: "<json>",
    description:
      'Attribute operations JSON array: [{"op":"add","name":"plan"},{"op":"delete","attribute_id":"attr_1"}]',
  },
  memoryLibraryId: { type: "string", valueHint: "<id>", description: "Memory library ID" },
} satisfies FlagsDef;
type UpdateFlags = ParsedFlags<typeof UPDATE_FLAGS>;

export default defineCommand({
  description: "Update a profile schema's name, description, or attributes",
  auth: "apiKey",
  usageArgs: "--schema-id <id> [--name <name>] [--attribute-ops <json>] [flags]",
  flags: UPDATE_FLAGS,
  notes: ["Attribute IDs for update/delete operations come from `memory profile detail`."],
  exampleArgs: [
    '--schema-id schema_xxx --name "user_basic_v2"',
    '--schema-id schema_xxx --attribute-ops \'[{"op":"add","name":"plan","description":"subscription plan"}]\'',
    '--schema-id schema_xxx --attribute-ops \'[{"op":"delete","attribute_id":"attr_1"}]\'',
  ],
  validate: (f: UpdateFlags) =>
    !f.name && !f.description && !f.attributeOps
      ? "Provide --name, --description, or --attribute-ops."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const body: ProfileSchemaUpdateRequest = {};
    if (flags.name) body.name = flags.name;
    if (flags.description) body.description = flags.description;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    if (flags.attributeOps) {
      try {
        body.attributes_operations = JSON.parse(flags.attributeOps);
      } catch {
        throw new UsageError("--attribute-ops must be valid JSON array");
      }
    }

    const path = profileSchemaItemPath(flags.schemaId);

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(path), method: "PATCH", request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path,
      method: "PATCH",
      body,
    });

    if (settings.quiet || format === "text") {
      emitBare(`Profile schema ${flags.schemaId} updated.`);
    } else {
      emitResult(response, format);
    }
  },
});
