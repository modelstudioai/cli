import {
  defineCommand,
  UsageError,
  memoryAddPath,
  detectOutputFormat,
  type FlagsDef,
  type Flags,
  type MemoryAddRequest,
  type MemoryAddResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const ADD_FLAGS = {
  userId: { type: "string", valueHint: "<id>", description: "User ID (required)", required: true },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: 'Messages JSON array: [{"role":"user","content":"..."},...]',
  },
  content: { type: "string", valueHint: "<text>", description: "Custom content text to memorize" },
  profileSchema: {
    type: "string",
    valueHint: "<id>",
    description: "Profile schema ID for user profiling",
  },
  memoryLibraryId: {
    type: "string",
    valueHint: "<id>",
    description: "Memory library ID (isolate memory space)",
  },
} satisfies FlagsDef;
type AddFlags = Flags<typeof ADD_FLAGS>;

export default defineCommand({
  description: "Add memory from messages or custom content",
  auth: "apiKey",
  usageArgs: "--user-id <id> [--messages <json>] [--content <text>] [flags]",
  flags: ADD_FLAGS,
  exampleArgs: [
    '--user-id user1 --content "The user likes Python programming"',
    '--user-id user1 --messages \'[{"role":"user","content":"I like traveling"}]\'',
    '--user-id user1 --content "Lives in Beijing" --profile-schema schema_xxx',
  ],
  validate: (f: AddFlags) =>
    !f.messages && !f.content ? "Provide --messages or --content." : undefined,
  async run(ctx) {
    const { config, flags } = ctx;
    const userId = flags.userId;

    const body: MemoryAddRequest = { user_id: userId };

    if (flags.messages) {
      try {
        body.messages = JSON.parse(flags.messages);
      } catch {
        throw new UsageError("--messages must be valid JSON array");
      }
    }

    if (flags.content) {
      body.custom_content = flags.content;
    }

    if (flags.profileSchema) body.profile_schema = flags.profileSchema;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ endpoint: ctx.client.url(memoryAddPath()), request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryAddResponse>({
      path: memoryAddPath(),
      method: "POST",
      body,
    });

    if (config.quiet || format === "text") {
      const ids = response.memory_ids?.join(", ") || "none";
      emitBare(`Memory added. IDs: ${ids}`);
    } else {
      emitResult(response, format);
    }
  },
});
