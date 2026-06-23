import {
  defineCommand,
  requestJson,
  memoryNodeEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  name: "memory delete",
  description: "Delete a memory node",
  usage: "bl memory delete --node-id <id> --user-id <id>",
  options: [
    { flag: "--node-id <id>", description: "Memory node ID (required)", required: true },
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
    { flag: "--memory-library-id <id>", description: "Memory library ID (non-default library)" },
  ],
  examples: ["bl memory delete --node-id node_xxx --user-id user1"],
  async run(config: Config, flags: GlobalFlags) {
    const nodeId = flags.nodeId as string;
    if (!nodeId) failIfMissing("node-id", "bl memory delete --node-id <id> --user-id <id>");

    const userId = flags.userId as string;
    if (!userId) failIfMissing("user-id", "bl memory delete --node-id <id> --user-id <id>");

    const format = detectOutputFormat(config.output);
    const params = new URLSearchParams({ user_id: userId });
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId as string);
    const url = `${memoryNodeEndpoint(config.baseUrl, nodeId)}?${params.toString()}`;

    if (config.dryRun) {
      emitResult({ endpoint: url, method: "DELETE" }, format);
      return;
    }

    const response = await requestJson<{ request_id: string }>(config, {
      url,
      method: "DELETE",
    });

    if (config.quiet || format === "text") {
      emitBare(`Memory node ${nodeId} deleted.`);
    } else {
      emitResult(response, format);
    }
  },
});
