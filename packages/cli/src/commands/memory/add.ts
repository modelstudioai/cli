import {
  defineCommand,
  requestJson,
  memoryAddEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type MemoryAddRequest,
  type MemoryAddResponse,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "memory add",
  description: "Add memory from messages or custom content",
  usage: "bl memory add --user-id <id> [--messages <json>] [--content <text>] [flags]",
  options: [
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
    {
      flag: "--messages <json>",
      description: 'Messages JSON array: [{"role":"user","content":"..."},...]',
    },
    { flag: "--content <text>", description: "Custom content text to memorize" },
    { flag: "--profile-schema <id>", description: "Profile schema ID for user profiling" },
    { flag: "--memory-library-id <id>", description: "Memory library ID (isolate memory space)" },
  ],
  examples: [
    'bl memory add --user-id user1 --content "用户喜欢Python编程"',
    'bl memory add --user-id user1 --messages \'[{"role":"user","content":"我喜欢旅行"}]\'',
    'bl memory add --user-id user1 --content "住在北京" --profile-schema schema_xxx',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const userId = flags.userId as string;
    if (!userId) failIfMissing("user-id", "bl memory add --user-id <id>");

    const body: MemoryAddRequest = { user_id: userId };

    if (flags.messages) {
      try {
        body.messages = JSON.parse(flags.messages as string);
      } catch {
        process.stderr.write("Error: --messages must be valid JSON array\n");
        process.exit(1);
      }
    }

    if (flags.content) {
      body.custom_content = flags.content as string;
    }

    if (!body.messages && !body.custom_content) {
      process.stderr.write("Error: at least one of --messages or --content is required\n");
      process.exit(1);
    }

    if (flags.profileSchema) body.profile_schema = flags.profileSchema as string;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId as string;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ endpoint: memoryAddEndpoint(config), request: body }, format);
      return;
    }

    const url = memoryAddEndpoint(config);
    const response = await requestJson<MemoryAddResponse>(config, {
      url,
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
