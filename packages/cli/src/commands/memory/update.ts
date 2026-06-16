import {
  defineCommand,
  requestJson,
  memoryNodeEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type MemoryNodeUpdateRequest,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "memory update",
  description: "Update a memory node content",
  usage: "bl memory update --node-id <id> --user-id <id> --content <text>",
  options: [
    { flag: "--node-id <id>", description: "Memory node ID (required)", required: true },
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
    {
      flag: "--content <text>",
      description: "New content for the memory node (required)",
      required: true,
    },
    { flag: "--memory-library-id <id>", description: "Memory library ID (non-default library)" },
  ],
  examples: [
    'bl memory update --node-id node_xxx --user-id user1 --content "updated memory content"',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const nodeId = flags.nodeId as string;
    if (!nodeId)
      failIfMissing("node-id", "bl memory update --node-id <id> --user-id <id> --content <text>");

    const userId = flags.userId as string;
    if (!userId)
      failIfMissing("user-id", "bl memory update --node-id <id> --user-id <id> --content <text>");

    const content = flags.content as string;
    if (!content)
      failIfMissing("content", "bl memory update --node-id <id> --user-id <id> --content <text>");

    const body: MemoryNodeUpdateRequest = {
      user_id: userId,
      custom_content: content,
    };
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId as string;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult(
        { endpoint: memoryNodeEndpoint(config.baseUrl, nodeId), method: "PATCH", request: body },
        format,
      );
      return;
    }

    const url = memoryNodeEndpoint(config.baseUrl, nodeId);
    const response = await requestJson<{ request_id: string }>(config, {
      url,
      method: "PATCH",
      body,
    });

    if (config.quiet || format === "text") {
      emitBare(`Memory node ${nodeId} updated.`);
    } else {
      emitResult(response, format);
    }
  },
});
