// 调试 harness：直接跑 agentLoop，打印完整 trajectory
import { agentLoop, createLLMClient, loadCatalog, loadFamilies } from "./index.ts";
import { createReadlineInteraction } from "./index.ts";

const baseUrl = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com";
const apiKey = process.env.DASHSCOPE_API_KEY ?? "";
const message = process.argv[2] ?? "qwen-max的限流信息是多少";

const deps = {
  llm: createLLMClient({ baseUrl, apiKey, defaultModel: "qwen-flash-2025-07-28" }),
  catalog: () => loadCatalog(),
  families: () => loadFamilies(),
  verbose: true,
  onProgress: (event: string) => process.stderr.write(`[agent] ${event}\n`),
};

const result = await agentLoop(message, { ...deps, interaction: createReadlineInteraction() });
process.stderr.write("\n=== RESULT ===\n");
process.stderr.write(`finalText: ${JSON.stringify(result.finalText)}\n`);
process.stderr.write(`recommendResult type: ${result.recommendResult?.type ?? "(none)"}\n`);
process.stderr.write(`turns: ${result.turns}\n`);
process.stderr.write("=== TRAJECTORY ===\n");
for (const event of result.trajectory) {
  const detail =
    event.type === "tool_call"
      ? `${event.tool}(${JSON.stringify(event.args).slice(0, 120)})`
      : event.type === "tool_result"
        ? `${event.tool} → ${event.status}${event.resultType ? ` type=${event.resultType}` : ""}`
        : `${event.reason ?? ""}`;
  process.stderr.write(`turn ${event.turn} | ${event.type} | ${detail}\n`);
}
