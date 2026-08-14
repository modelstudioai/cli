import {
  defineCommand,
  UsageError,
  memoryAddPath,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
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
  projectId: {
    type: "string",
    valueHint: "<id>",
    description: "Memory extraction rule ID (defaults to the library's default rule)",
  },
  metaData: {
    type: "string",
    valueHint: "<json>",
    description: 'Custom metadata JSON object: {"location":"Beijing"}',
  },
} satisfies FlagsDef;
type AddFlags = ParsedFlags<typeof ADD_FLAGS>;

export default defineCommand({
  description: "Add memory from messages or custom content",
  auth: "apiKey",
  usageArgs: "--user-id <id> [--messages <json>] [--content <text>] [flags]",
  flags: ADD_FLAGS,
  exampleArgs: [
    '--user-id user1 --content "The user likes Python programming"',
    '--user-id user1 --messages \'[{"role":"user","content":"I like traveling"}]\'',
    '--user-id user1 --content "Lives in Beijing" --profile-schema schema_xxx',
    '--user-id user1 --content "Lives in Beijing" --meta-data \'{"source":"onboarding"}\'',
  ],
  validate: (f: AddFlags) =>
    !f.messages && !f.content ? "Provide --messages or --content." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
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
    if (flags.projectId) body.project_id = flags.projectId;

    if (flags.metaData) {
      try {
        body.meta_data = JSON.parse(flags.metaData);
      } catch {
        throw new UsageError("--meta-data must be valid JSON object");
      }
    }

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(memoryAddPath()), request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryAddResponse>({
      path: memoryAddPath(),
      method: "POST",
      body,
    });

    if (settings.quiet || format === "text") {
      const nodes = response.memory_nodes ?? [];
      if (nodes.length === 0) {
        emitBare("No memory fragments were extracted.");
      } else {
        for (const node of nodes) {
          emitBare(`[${node.event ?? "ADD"}] ${node.memory_node_id} ${node.content}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
