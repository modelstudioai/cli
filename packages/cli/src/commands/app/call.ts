import {
  defineCommand,
  request,
  requestJson,
  appCompletionEndpoint,
  parseSSE,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type AppCompletionRequest,
  type AppStreamChunk,
  type AppCompletionResponse,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "app call",
  description: "Call a Bailian application (agent or workflow)",
  usage: "bl app call --app-id <id> --prompt <text> [flags]",
  options: [
    { flag: "--app-id <id>", description: "Application ID (required)", required: true },
    { flag: "--prompt <text>", description: "Input prompt text", required: true },
    {
      flag: "--image <url>",
      description: "Image URL(s) to pass to the app (repeatable)",
      type: "array",
    },
    { flag: "--file-id <id>", description: "Pre-uploaded file ID(s) (repeatable)", type: "array" },
    { flag: "--session-id <id>", description: "Session ID for multi-turn conversation" },
    { flag: "--stream", description: "Stream response (default: on in TTY)" },
    { flag: "--pipeline-ids <ids>", description: "Knowledge base pipeline IDs (comma-separated)" },
    { flag: "--memory-id <id>", description: "Memory ID for long-term memory" },
    { flag: "--biz-params <json>", description: "Business parameters JSON (workflow variables)" },
    { flag: "--has-thoughts", description: "Show agent thinking process" },
  ],
  examples: [
    'bl app call --app-id abc123 --prompt "Hello"',
    'bl app call --app-id abc123 --prompt "Describe this image" --image https://example.com/photo.jpg',
    'bl app call --app-id abc123 --prompt "Analyze the image" --image img1.jpg --image img2.jpg',
    'bl app call --app-id abc123 --prompt "Continue" --session-id sess_xxx --stream',
    'bl app call --app-id abc123 --prompt "Search for materials" --pipeline-ids pipe1,pipe2',
    'bl app call --app-id abc123 --prompt "Start" --biz-params \'{"key":"value"}\'',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const appId = flags.appId as string;
    if (!appId) failIfMissing("app-id", "bl app call --app-id <id> --prompt <text>");

    const prompt = flags.prompt as string;
    if (!prompt) failIfMissing("prompt", "bl app call --app-id <id> --prompt <text>");

    const shouldStream =
      flags.stream === true || (flags.stream === undefined && process.stdout.isTTY);
    const format = detectOutputFormat(config.output);

    const body: AppCompletionRequest = {
      input: { prompt },
      parameters: {
        incremental_output: shouldStream,
      },
    };

    if (flags.sessionId) {
      body.input.session_id = flags.sessionId as string;
    }

    // Pass image URLs via image_list
    const imageUrls = flags.image as string[] | undefined;
    if (imageUrls && imageUrls.length > 0) {
      body.input.image_list = imageUrls;
    }

    // Pass pre-uploaded file IDs
    const fileIds = flags.fileId as string[] | undefined;
    if (fileIds && fileIds.length > 0) {
      body.input.file_ids = fileIds;
    }

    if (flags.hasThoughts) {
      body.parameters!.has_thoughts = true;
    }

    if (flags.pipelineIds) {
      const ids = (flags.pipelineIds as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      body.parameters!.rag_options = { pipeline_ids: ids };
    }

    if (flags.memoryId) {
      body.parameters!.memory_id = flags.memoryId as string;
    }

    if (flags.bizParams) {
      try {
        body.input.biz_params = JSON.parse(flags.bizParams as string);
      } catch {
        process.stderr.write("Error: --biz-params must be valid JSON\n");
        process.exit(1);
      }
    }

    if (config.dryRun) {
      emitResult({ endpoint: appCompletionEndpoint(config.baseUrl, appId), request: body }, format);
      return;
    }

    const url = appCompletionEndpoint(config.baseUrl, appId);

    if (shouldStream) {
      const headers: Record<string, string> = { "X-DashScope-SSE": "enable" };
      const res = await request(config, {
        url,
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
      const response = await requestJson<AppCompletionResponse>(config, {
        url,
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
