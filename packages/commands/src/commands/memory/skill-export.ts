import {
  defineCommand,
  memoryEndpoint,
  memorySkillExportPath,
  type FlagsDef,
  type MemorySkillExportResponse,
} from "bailian-cli-core";
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

    const format = settings.output;
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memorySkillExportPath(flags.nodeId));

    if (settings.dryRun) {
      ctx.output.result({ endpoint: url, method: "GET" });
      return;
    }

    const response = await ctx.client.requestJson<MemorySkillExportResponse>({
      path: url,
      method: "GET",
    });

    ctx.output.result(
      response,
      format === "text"
        ? {
            text: response.memory_node
              ? String(response.memory_node.content)
              : ctx.localize({
                  "en-US": "Skill memory node not found.",
                  "zh-CN": "未找到技能记忆节点。",
                }),
          }
        : undefined,
    );
  },
});
