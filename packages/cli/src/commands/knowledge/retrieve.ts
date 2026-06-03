import {
  defineCommand,
  signRequest,
  detectOutputFormat,
  maskToken,
  type Config,
  type GlobalFlags,
  type KnowledgeRetrieveRequest,
  type KnowledgeRetrieveResponse,
  BailianError,
  ExitCode,
  trackingHeaders,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

const BAILIAN_HOST = "bailian.cn-beijing.aliyuncs.com";

export default defineCommand({
  name: "knowledge retrieve",
  description: "Retrieve from a Bailian knowledge base (requires AK/SK)",
  usage: "bl knowledge retrieve --index-id <id> --query <text> [flags]",
  options: [
    { flag: "--index-id <id>", description: "Knowledge base index ID (required)", required: true },
    { flag: "--query <text>", description: "Search query (required)", required: true },
    {
      flag: "--workspace-id <id>",
      description: "Bailian workspace ID (or env BAILIAN_WORKSPACE_ID)",
    },
    { flag: "--top-k <n>", description: "Number of results (default: 10)", type: "number" },
    { flag: "--rerank", description: "Enable rerank" },
    { flag: "--rerank-top-n <n>", description: "Rerank top N results", type: "number" },
    { flag: "--access-key-id <key>", description: "Alibaba Cloud Access Key ID (or env)" },
    { flag: "--access-key-secret <key>", description: "Alibaba Cloud Access Key Secret (or env)" },
  ],
  examples: [
    'bl knowledge retrieve --index-id idx_xxx --query "如何使用阿里云百炼" --workspace-id ws_xxx',
    'bl knowledge retrieve --index-id idx_xxx --query "API限流" --top-k 5 --rerank',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const indexId = flags.indexId as string;
    if (!indexId) failIfMissing("index-id", "bl knowledge retrieve --index-id <id> --query <text>");

    const query = flags.query as string;
    if (!query) failIfMissing("query", "bl knowledge retrieve --index-id <id> --query <text>");

    const accessKeyId = (flags.accessKeyId as string) || config.accessKeyId;
    const accessKeySecret = (flags.accessKeySecret as string) || config.accessKeySecret;
    const workspaceId = (flags.workspaceId as string) || config.workspaceId;

    if (!accessKeyId || !accessKeySecret) {
      throw new BailianError(
        "Knowledge retrieve requires Alibaba Cloud AK/SK.\n" +
          "Set via: --access-key-id / --access-key-secret flags,\n" +
          "  or env: ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET,\n" +
          "  or config: bl config set access_key_id <key>",
        ExitCode.AUTH,
      );
    }

    if (!workspaceId) {
      throw new BailianError(
        "Knowledge retrieve requires a workspace ID.\n" +
          "Set via: --workspace-id flag, or env: BAILIAN_WORKSPACE_ID, or config: bl config set workspace_id <id>",
        ExitCode.USAGE,
      );
    }

    const body: KnowledgeRetrieveRequest = {
      IndexId: indexId,
      Query: query,
    };

    if (flags.topK !== undefined) body.TopK = flags.topK as number;
    if (flags.rerank) body.Rerank = true;
    if (flags.rerankTopN !== undefined) body.RerankTopN = flags.rerankTopN as number;

    const format = detectOutputFormat(config.output);
    const pathname = `/${workspaceId}/index/retrieve`;

    if (config.dryRun) {
      emitResult(
        {
          endpoint: `https://${BAILIAN_HOST}${pathname}`,
          workspaceId,
          request: body,
        },
        format,
      );
      return;
    }

    const bodyStr = JSON.stringify(body);

    const headers = signRequest({
      accessKeyId,
      accessKeySecret,
      action: "Retrieve",
      version: "2023-12-29",
      body: bodyStr,
      host: BAILIAN_HOST,
      pathname,
    });

    const url = `https://${BAILIAN_HOST}${pathname}`;

    if (config.verbose) {
      process.stderr.write(`> POST ${url}\n`);
      process.stderr.write(`> AK: ${maskToken(accessKeyId)}\n`);
    }

    const timeoutMs = config.timeout * 1000;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        ...trackingHeaders(),
      },
      body: bodyStr,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (config.verbose) {
      process.stderr.write(`< ${res.status} ${res.statusText}\n`);
    }

    const data = (await res.json()) as KnowledgeRetrieveResponse & {
      Code?: string;
      Message?: string;
    };

    if (!res.ok || (data.Code && data.Code !== "Success")) {
      throw new BailianError(
        `Knowledge retrieve failed: ${data.Code || res.status} - ${data.Message || res.statusText}`,
        ExitCode.GENERAL,
      );
    }

    if (config.quiet || format === "text") {
      const nodes = data.Data?.Nodes || [];
      if (nodes.length === 0) {
        emitBare("No results found.");
      } else {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          emitBare(`[${i + 1}] (score: ${node.Score.toFixed(4)})`);
          emitBare(node.Text);
          emitBare("");
        }
      }
    } else {
      emitResult(data, format);
    }
  },
});
