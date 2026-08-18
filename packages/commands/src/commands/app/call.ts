import {
  defineCommand,
  UsageError,
  appCompletionPath,
  parseSSE,
  detectOutputFormat,
  type AppCompletionRequest,
  type AppStreamChunk,
  type AppCompletionResponse,
} from "bailian-cli-core";
import { ansi, emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Call a Bailian application (agent or workflow)",
    "zh-CN": "调用百炼应用（智能体或工作流）",
  },
  auth: "apiKey",
  usageArgs: "--app-id <id> --prompt <text> [flags]",
  flags: {
    appId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "Application ID (required)", "zh-CN": "应用 ID（必填）" },
      required: true,
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: { "en-US": "Input prompt text", "zh-CN": "输入提示词文本" },
      required: true,
    },
    image: {
      type: "array",
      valueHint: "<url>",
      description: {
        "en-US": "Image URL(s) to pass to the app (repeatable)",
        "zh-CN": "传给应用的图片 URL（可重复）",
      },
    },
    fileId: {
      type: "array",
      valueHint: "<id>",
      description: {
        "en-US": "Pre-uploaded file ID(s) (repeatable)",
        "zh-CN": "已上传的文件 ID（可重复）",
      },
    },
    sessionId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Session ID for multi-turn conversation",
        "zh-CN": "多轮对话的 Session ID",
      },
    },
    stream: {
      type: "switch",
      description: {
        "en-US": "Stream response (default: on in TTY)",
        "zh-CN": "流式输出响应（TTY 中默认开启）",
      },
    },
    pipelineIds: {
      type: "string",
      valueHint: "<ids>",
      description: {
        "en-US": "Knowledge base pipeline IDs (comma-separated)",
        "zh-CN": "知识库 Pipeline ID（以逗号分隔）",
      },
    },
    memoryId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Memory ID for long-term memory",
        "zh-CN": "长期记忆使用的 Memory ID",
      },
    },
    bizParams: {
      type: "string",
      valueHint: "<json>",
      description: {
        "en-US": "Business parameters JSON (workflow variables)",
        "zh-CN": "业务参数 JSON（工作流变量）",
      },
    },
    hasThoughts: {
      type: "switch",
      description: { "en-US": "Show agent thinking process", "zh-CN": "显示智能体思考过程" },
    },
  },
  exampleArgs: [
    {
      "en-US": '--app-id abc123 --prompt "Hello"',
      "zh-CN": '--app-id abc123 --prompt "你好"',
    },
    {
      "en-US":
        '--app-id abc123 --prompt "Describe this image" --image https://example.com/photo.jpg',
      "zh-CN": '--app-id abc123 --prompt "描述这张图片" --image https://example.com/photo.jpg',
    },
    {
      "en-US": '--app-id abc123 --prompt "Analyze the image" --image img1.jpg --image img2.jpg',
      "zh-CN": '--app-id abc123 --prompt "分析这些图片" --image img1.jpg --image img2.jpg',
    },
    {
      "en-US": '--app-id abc123 --prompt "Continue" --session-id sess_xxx --stream',
      "zh-CN": '--app-id abc123 --prompt "继续" --session-id sess_xxx --stream',
    },
    {
      "en-US": '--app-id abc123 --prompt "Search for materials" --pipeline-ids pipe1,pipe2',
      "zh-CN": '--app-id abc123 --prompt "搜索资料" --pipeline-ids pipe1,pipe2',
    },
    {
      "en-US": '--app-id abc123 --prompt "Start" --biz-params \'{"key":"value"}\'',
      "zh-CN": '--app-id abc123 --prompt "开始" --biz-params \'{"key":"value"}\'',
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const appId = flags.appId;
    const prompt = flags.prompt;

    const shouldStream = flags.stream || process.stdout.isTTY;
    const format = detectOutputFormat(settings.output);

    const body: AppCompletionRequest = {
      input: { prompt },
      parameters: {
        incremental_output: shouldStream,
      },
    };

    if (flags.sessionId) {
      body.input.session_id = flags.sessionId;
    }

    // Pass image URLs via image_list
    const imageUrls = flags.image;
    if (imageUrls && imageUrls.length > 0) {
      body.input.image_list = imageUrls;
    }

    // Pass pre-uploaded file IDs
    const fileIds = flags.fileId;
    if (fileIds && fileIds.length > 0) {
      body.input.file_ids = fileIds;
    }

    if (flags.hasThoughts) {
      body.parameters!.has_thoughts = true;
    }

    if (flags.pipelineIds) {
      const ids = flags.pipelineIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      body.parameters!.rag_options = { pipeline_ids: ids };
    }

    if (flags.memoryId) {
      body.parameters!.memory_id = flags.memoryId;
    }

    if (flags.bizParams) {
      try {
        body.input.biz_params = JSON.parse(flags.bizParams);
      } catch {
        throw new UsageError("--biz-params must be valid JSON");
      }
    }

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(appCompletionPath(appId)), request: body }, format);
      return;
    }

    if (shouldStream) {
      const headers: Record<string, string> = { "X-DashScope-SSE": "enable" };
      const res = await ctx.client.request({
        path: appCompletionPath(appId),
        method: "POST",
        body,
        headers,
        stream: true,
      });

      let fullText = "";
      let sessionId = "";
      const writesStreamingStdout = format === "text";
      const stderrColor = ansi(process.stderr);

      for await (const event of parseSSE(res)) {
        if (event.data === "[DONE]") break;
        try {
          const chunk = JSON.parse(event.data) as AppStreamChunk;
          const text = chunk.output?.text;

          if (text) {
            // incremental_output: text is delta
            if (writesStreamingStdout) process.stdout.write(text);
            fullText += text;
          }

          // Capture session_id for multi-turn
          if (chunk.output?.session_id) {
            sessionId = chunk.output.session_id;
          }

          // Show thoughts if available
          if (chunk.output?.thoughts && flags.hasThoughts) {
            for (const t of chunk.output.thoughts) {
              if (t.thought)
                process.stderr.write(`${stderrColor.dim(`[Thinking] ${t.thought}`)}\n`);
              if (t.action_name)
                process.stderr.write(
                  `${stderrColor.dim(`[Action] ${t.action_name}: ${t.action_input || ""}`)}\n`,
                );
              if (t.observation)
                process.stderr.write(`${stderrColor.dim(`[Observation] ${t.observation}`)}\n`);
            }
          }
        } catch {
          // skip unparseable
        }
      }

      // Show session_id for multi-turn conversation
      if (sessionId && !settings.quiet) {
        process.stderr.write(`${stderrColor.dim(`Session ID: ${sessionId}`)}\n`);
      }

      if (format === "json") {
        emitResult({ text: fullText, session_id: sessionId }, format);
      } else {
        process.stdout.write("\n");
      }
    } else {
      const response = await ctx.client.requestJson<AppCompletionResponse>({
        path: appCompletionPath(appId),
        method: "POST",
        body,
      });

      const text = response.output?.text ?? "";

      if (settings.quiet || format === "text") {
        emitBare(text);
      } else {
        emitResult(response, format);
      }
    }
  },
});
