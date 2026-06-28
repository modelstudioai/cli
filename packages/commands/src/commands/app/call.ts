import {
  defineCommand,
  appCompletionPath,
  parseSSE,
  detectOutputFormat,
  type AppCompletionRequest,
  type AppStreamChunk,
  type AppCompletionResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Call a Bailian application (agent or workflow)",
  auth: "apiKey",
  usageArgs: "--app-id <id> --prompt <text> [flags]",
  flags: {
    appId: {
      type: "string",
      valueHint: "<id>",
      description: "Application ID (required)",
      required: true,
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: "Input prompt text",
      required: true,
    },
    image: {
      type: "array",
      valueHint: "<url>",
      description: "Image URL(s) to pass to the app (repeatable)",
    },
    fileId: {
      type: "array",
      valueHint: "<id>",
      description: "Pre-uploaded file ID(s) (repeatable)",
    },
    sessionId: {
      type: "string",
      valueHint: "<id>",
      description: "Session ID for multi-turn conversation",
    },
    stream: { type: "switch", description: "Stream response (default: on in TTY)" },
    pipelineIds: {
      type: "string",
      valueHint: "<ids>",
      description: "Knowledge base pipeline IDs (comma-separated)",
    },
    memoryId: { type: "string", valueHint: "<id>", description: "Memory ID for long-term memory" },
    bizParams: {
      type: "string",
      valueHint: "<json>",
      description: "Business parameters JSON (workflow variables)",
    },
    hasThoughts: { type: "switch", description: "Show agent thinking process" },
  },
  exampleArgs: [
    '--app-id abc123 --prompt "Hello"',
    '--app-id abc123 --prompt "Describe this image" --image https://example.com/photo.jpg',
    '--app-id abc123 --prompt "Analyze the image" --image img1.jpg --image img2.jpg',
    '--app-id abc123 --prompt "Continue" --session-id sess_xxx --stream',
    '--app-id abc123 --prompt "Search for materials" --pipeline-ids pipe1,pipe2',
    '--app-id abc123 --prompt "Start" --biz-params \'{"key":"value"}\'',
  ],
  async run(ctx) {
    const { config, flags } = ctx;
    const appId = flags.appId;
    const prompt = flags.prompt;

    const shouldStream = flags.stream || process.stdout.isTTY;
    const format = detectOutputFormat(config.output);

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
        process.stderr.write("Error: --biz-params must be valid JSON\n");
        process.exit(1);
      }
    }

    if (config.dryRun) {
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
      const dim = config.noColor ? "" : "\x1b[2m";
      const reset = config.noColor ? "" : "\x1b[0m";

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
              if (t.thought) process.stderr.write(`${dim}[Thinking] ${t.thought}${reset}\n`);
              if (t.action_name)
                process.stderr.write(
                  `${dim}[Action] ${t.action_name}: ${t.action_input || ""}${reset}\n`,
                );
              if (t.observation)
                process.stderr.write(`${dim}[Observation] ${t.observation}${reset}\n`);
            }
          }
        } catch {
          // skip unparseable
        }
      }

      // Show session_id for multi-turn conversation
      if (sessionId && !config.quiet) {
        process.stderr.write(`${dim}Session ID: ${sessionId}${reset}\n`);
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

      if (config.quiet || format === "text") {
        emitBare(text);
      } else {
        emitResult(response, format);
      }
    }
  },
});
