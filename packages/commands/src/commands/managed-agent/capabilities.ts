import { getManagedAgentProviderCapabilities } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";

const FLAGS = {
  provider: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Provider to inspect (default: bailian)",
      "zh-CN": "要检查的 Provider（默认：bailian）",
    },
  },
} as const;

export default defineCommand({
  description: {
    "en-US": "Show operation-level Managed Agents API capabilities",
    "zh-CN": "显示 Managed Agents API 的操作级能力",
  },
  auth: "none",
  usageArgs: "[--provider <name>]",
  flags: FLAGS,
  exampleArgs: ["", "--provider bailian --output json"],
  notes: [
    {
      "en-US":
        "Capabilities distinguish public Managed Agents APIs from client-side compositions and unsupported resources.",
      "zh-CN": "Capabilities 会区分公开 Managed Agents API、客户端组合能力和不支持的资源。",
    },
  ],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const capabilities = getManagedAgentProviderCapabilities(ctx.flags.provider ?? "bailian");
    if (format === "json") {
      emitResult(capabilities, format);
      return;
    }
    const rows = Object.entries(capabilities.operations).map(([operation, capability]) => [
      operation,
      capability.supported ? "yes" : "no",
      capability.auth ?? "-",
      capability.reason ?? "-",
    ]);
    for (const line of formatTable(["OPERATION", "SUPPORTED", "AUTH", "REASON"], rows)) {
      emitBare(line);
    }
  },
});
