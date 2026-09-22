import {
  defineCommand,
  memoryEndpoint,
  memorySkillExportPath,
  detectOutputFormat,
  type FlagsDef,
  type MemorySkillExportResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { MEMORY_WORKSPACE_NOTE, WORKSPACE_FLAG, resolveWorkspaceId } from "./shared.ts";

const SKILL_EXPORT_FLAGS = {
  nodeId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Skill memory node ID (required)",
      "zh-CN": "skill 记忆节点 ID（必填）",
    },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Export a skill memory node",
    "zh-CN": "导出 skill 记忆节点",
  },
  auth: "apiKey",
  usageArgs: "--node-id <id> [flags]",
  flags: SKILL_EXPORT_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "Returns skill body content without frontmatter; JSON also includes skill_name, skill_description and skill_tags. Find node IDs with `memory search --memory-types skill`.",
      "zh-CN":
        "返回不含 frontmatter 的技能正文；JSON 另含 skill_name、skill_description、skill_tags。节点 ID 可用 `memory search --memory-types skill` 查询。",
    },
  ],
  exampleArgs: ["--node-id node_xxx --workspace-id ws_xxx", "--node-id node_xxx --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memorySkillExportPath(flags.nodeId));

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemorySkillExportResponse>({
      path: url,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      const node = response.memory_node;
      if (!node) {
        emitBare("Skill memory node not found.");
        return;
      }
      emitBare(node.content);
    } else {
      emitResult(response, format);
    }
  },
});
