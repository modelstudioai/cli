import {
  defineCommand,
  detectOutputFormat,
  DECISION_REGIONS,
  DEFAULT_DECISION_MODEL,
  DEFAULT_DECISION_REGION,
  type DecisionRequest,
  type DecisionResponse,
} from "bailian-cli-core";
import { emitBare, emitRequestId, emitResult } from "bailian-cli-runtime";
import {
  buildDecisionInput,
  decisionInputFlagsError,
  formatDecisionAnswers,
  formatDecisionStats,
  resolveDecisionEndpoint,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Run the decision model: typed choice / noul / score answers with probabilities",
    "zh-CN": "调用决策模型：一次返回 choice / noul / score 判定结果及概率分布",
  },
  auth: "apiKey",
  usageArgs:
    "(--state <text> | --state-file <path>) (--questions <json> | --questions-file <path>) | --request-file <path>",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": `Decision model ID (default: ${DEFAULT_DECISION_MODEL})`,
        "zh-CN": `决策模型 ID（默认：${DEFAULT_DECISION_MODEL}）`,
      },
    },
    state: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Business state to decide on, sent as a string",
        "zh-CN": "待决策的业务状态，按字符串发送",
      },
    },
    stateFile: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US":
          "Read state from a file (.json is parsed as an object/array, others as text; - for stdin)",
        "zh-CN": "从文件读取 state（.json 解析为对象/数组，其他按文本读取；- 表示 stdin）",
      },
    },
    questions: {
      type: "string",
      valueHint: "<json>",
      description: {
        "en-US": "Question table JSON, keyed by question ID",
        "zh-CN": "问题表 JSON，键为问题 ID",
      },
    },
    questionsFile: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": 'Read the question table from a JSON file ({...} or {"questions":{...}})',
        "zh-CN": '从 JSON 文件读取问题表（{...} 或 {"questions":{...}}）',
      },
    },
    requestFile: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": "Full request JSON {state, questions}; label/target are stripped",
        "zh-CN": "完整请求 JSON {state, questions}；自动去掉 label/target",
      },
    },
    workspaceId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Workspace ID for the endpoint host (or set BAILIAN_WORKSPACE_ID)",
        "zh-CN": "用于拼接请求域名的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
      },
    },
    region: {
      type: "string",
      valueHint: "<region>",
      choices: DECISION_REGIONS,
      description: {
        "en-US": `Endpoint region: ${DECISION_REGIONS.join(", ")} (default: ${DEFAULT_DECISION_REGION})`,
        "zh-CN": `请求地域：${DECISION_REGIONS.join("、")}（默认：${DEFAULT_DECISION_REGION}）`,
      },
    },
  },
  exampleArgs: [
    {
      "en-US":
        '--workspace-id <id> --state "Is this review asking for a refund?" --questions \'{"refund":{"type":"noul","instructions":"Asking for a refund?"}}\'',
      "zh-CN":
        '--workspace-id <id> --state "这段评论是否在索要退款？" --questions \'{"refund":{"type":"noul","instructions":"是否在索要退款？"}}\'',
    },
    "--state-file ticket.json --questions-file workload.json",
    "--request-file sample.json --model decision-model-preview",
    "--region ap-southeast-1 --request-file sample.json",
    "--request-file sample.json --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Endpoint: configured --base-url, DASHSCOPE_BASE_URL, or profile base_url takes precedence; otherwise https://{workspace}.{region}.maas.aliyuncs.com/compatible-mode/v1/systemone, with workspace from --workspace-id, BAILIAN_WORKSPACE_ID, then config workspace_id.",
      "zh-CN":
        "请求地址：已配置的 --base-url、DASHSCOPE_BASE_URL 或 Profile base_url 优先；否则为 https://{workspace}.{region}.maas.aliyuncs.com/compatible-mode/v1/systemone，工作空间按 --workspace-id、BAILIAN_WORKSPACE_ID、配置项 workspace_id 解析。",
    },
    {
      "en-US":
        "Question types: choice (criteria: option → description, 1-255), noul (optional criteria with true/false descriptions), score (criteria: levels from low to high, 2-255; 3-7 recommended). Keep questions per request at 16 or fewer; latency grows roughly linearly.",
      "zh-CN":
        "问题类型：choice（criteria 为选项 → 描述，1-255 项）、noul（可选 criteria，含 true/false 描述）、score（criteria 为从低到高的等级，2-255 级，建议 3-7 级）。建议每次请求不超过 16 个问题，延迟随问题数近线性增长。",
    },
    {
      "en-US":
        "Output defaults to the full JSON response. Use --output text for one human-readable line per question; the request ID and usage summary are written to stderr.",
      "zh-CN":
        "默认输出完整 JSON 响应。使用 --output text 可按问题逐行输出易读结果；请求 ID 与用量摘要写入 stderr。",
    },
    {
      "en-US":
        "Training samples can be reused directly: label/target are stripped before sending. Sampling parameters (temperature, max_tokens, ...) are not supported by this API.",
      "zh-CN":
        "训练样本可直接复用：发送前自动去掉 label/target。该接口不支持 temperature、max_tokens 等采样参数。",
    },
  ],
  validate: (flags) => {
    const inputError = decisionInputFlagsError(flags);
    if (typeof inputError === "string" || !inputError) return inputError;
    return `${inputError["en-US"]} / ${inputError["zh-CN"]}`;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const input = buildDecisionInput(flags, ctx.localize);
    const body: DecisionRequest = {
      model: flags.model || input.model || DEFAULT_DECISION_MODEL,
      state: input.state,
      questions: input.questions,
    };
    const endpoint = resolveDecisionEndpoint({
      workspaceId: flags.workspaceId || settings.workspaceId,
      region: flags.region ?? DEFAULT_DECISION_REGION,
      binName: ctx.identity.binName,
      client: ctx.client,
      localize: ctx.localize,
    });
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<DecisionResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (format !== "text") {
      emitResult(response, format);
      return;
    }

    emitBare(formatDecisionAnswers(response));
    if (!settings.quiet) {
      const stats = formatDecisionStats(response);
      if (stats) process.stderr.write(`${stats}\n`);
    }
    emitRequestId(response.request_id, settings.quiet);
  },
});
