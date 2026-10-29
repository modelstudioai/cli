import {
  BailianError,
  ExitCode,
  defineCommand,
  detectOutputFormat,
  followParsexResult,
  getParsexResult,
  parsexEndpoint,
  type ParsexOperation,
  type ParsexResultRequest,
} from "bailian-cli-core";
import { emitBare, emitResult, registerInterruptHandler } from "bailian-cli-runtime";
import {
  integer,
  nonEmpty,
  OSS_FLAG,
  PARSEX_NOTE,
  readOssConfig,
  redactParsexRequest,
  resolveParsexBaseUrl,
  WORKSPACE_FLAG,
} from "./shared.ts";

const RESULT_FLAGS = {
  bizId: {
    type: "string",
    required: true,
    valueHint: "<id>",
    description: {
      "en-US": "biz_id returned by the matching submit command",
      "zh-CN": "对应 submit 命令返回的 biz_id",
    },
  },
  follow: {
    type: "switch",
    description: {
      "en-US": "Poll until success or failed (Ctrl-C stops local polling only)",
      "zh-CN": "轮询至 success 或 failed（Ctrl-C 仅停止本地轮询）",
    },
  },
  interval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval, 1–3600 seconds (default: 2; --follow only)",
      "zh-CN": "轮询间隔 1–3600 秒（默认 2；仅 --follow）",
    },
  },
  pollTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Total polling deadline, 1–86400 seconds (default: 600; --follow only)",
      "zh-CN": "轮询总时限 1–86400 秒（默认 600；仅 --follow）",
    },
  },
  ...OSS_FLAG,
  ...WORKSPACE_FLAG,
} as const;
const SLICE_FLAGS = {
  stepStart: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Slice offset for layouts or media segments (service default: 0)",
      "zh-CN": "layouts 或音视频 segments 的分片起点（服务默认 0）",
    },
  },
  stepSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Slice size (service default: 0)", "zh-CN": "分片大小（服务默认 0）" },
  },
} as const;

export function createResultCommand(operation: ParsexOperation) {
  return defineCommand({
    description:
      operation === "parse"
        ? {
            "en-US": "Query ParseX parsing status, results or a result slice",
            "zh-CN": "查询 ParseX 解析状态、结果或分片",
          }
        : {
            "en-US": "Query ParseX extraction status, fields and citations",
            "zh-CN": "查询 ParseX 抽取状态、字段与引用",
          },
    auth: "apiKey",
    flags: { ...RESULT_FLAGS, ...(operation === "parse" ? SLICE_FLAGS : {}) },
    usageArgs: "--biz-id <id> [--follow] [flags]",
    exampleArgs: [
      "--biz-id biz-example --workspace-id ws-example",
      "--biz-id biz-example --follow --poll-timeout 600 --output json",
    ],
    notes: [
      PARSEX_NOTE,
      {
        "en-US":
          "Single queries preserve the complete API response and exit 0 even for a failed job. --follow emits one terminal response on stdout, progress on stderr; failed exits 1, deadline 5, Ctrl-C 130. Resume using the same biz_id; stopping locally does not cancel the task. ResultNotReady is polled again only with --follow. --timeout controls each HTTP request; --poll-timeout covers the whole polling loop.",
        "zh-CN":
          "单次查询完整保留 API 响应，即使任务 failed 也退出 0。--follow 在 stdout 仅输出终态响应，stderr 显示进度；任务失败退出 1，总时限到期退出 5，Ctrl-C 退出 130。使用同一 biz_id 可继续查询，本地停止不会取消任务。仅 --follow 会在 ResultNotReady 后继续查询。--timeout 控制单次 HTTP 请求，--poll-timeout 控制整个轮询过程。",
      },
      ...(operation === "parse"
        ? [
            {
              "en-US":
                "--follow waits for task completion for the requested slice; it does not collect all slices. Advance --step-start explicitly to retrieve further layouts/segments. Output file URLs may appear only after all results have been retrieved.",
              "zh-CN":
                "--follow 等待任务完成并返回请求的分片，不自动收集所有分片。请显式调整 --step-start 获取后续 layouts/segments。结果文件 URL 可能仅在取完所有结果后返回。",
            },
          ]
        : []),
    ],
    async validate(flags) {
      nonEmpty(flags.bizId, "--biz-id");
      if (!flags.follow && (flags.interval !== undefined || flags.pollTimeout !== undefined))
        return {
          "en-US": "--interval/--poll-timeout require --follow.",
          "zh-CN": "--interval/--poll-timeout 需要 --follow。",
        };
      integer(flags.interval, "--interval", 1, 3600);
      integer(flags.pollTimeout, "--poll-timeout", 1, 86400);
      integer(flags.stepStart as number | undefined, "--step-start");
      integer(flags.stepSize as number | undefined, "--step-size");
      await readOssConfig(flags.ossConfigFile, false);
    },
    async run(ctx) {
      const { flags, settings } = ctx;
      const baseUrl = resolveParsexBaseUrl(ctx);
      const endpoint = parsexEndpoint(baseUrl, operation, "result");
      const ossConfig = await readOssConfig(flags.ossConfigFile, false);
      const body: ParsexResultRequest = {
        biz_id: flags.bizId,
        ...(flags.stepStart === undefined ? {} : { step_start: flags.stepStart as number }),
        ...(flags.stepSize === undefined ? {} : { step_size: flags.stepSize as number }),
        ...(ossConfig === undefined ? {} : { oss_config: ossConfig }),
      };
      const format = detectOutputFormat(settings.output);
      if (settings.dryRun) {
        emitResult(
          { endpoint, method: "POST", request: redactParsexRequest(body), follow: flags.follow },
          format,
        );
        return;
      }
      const controller = new AbortController();
      const release = flags.follow
        ? registerInterruptHandler(() =>
            controller.abort(
              new BailianError(
                ctx.localize({
                  "en-US": "ParseX polling interrupted; remote task was not cancelled.",
                  "zh-CN": "ParseX 本地轮询已中断，未取消远端任务。",
                }),
                ExitCode.INTERRUPTED,
                `biz_id: ${flags.bizId}`,
              ),
            ),
          )
        : undefined;
      try {
        const response = flags.follow
          ? await followParsexResult(ctx.client, baseUrl, operation, body, {
              interval: flags.interval ?? 2,
              pollTimeout: flags.pollTimeout ?? 600,
              signal: controller.signal,
              progress: (current) => {
                if (!settings.quiet) console.error(`${flags.bizId}: ${current.data.status}`);
              },
            })
          : await getParsexResult(ctx.client, baseUrl, operation, body);
        if (settings.quiet) emitBare(response.data.status);
        else emitResult(response, format);
        if (flags.follow && response.data.status === "failed")
          throw new BailianError(
            typeof response.data.message === "string"
              ? response.data.message
              : ctx.localize({ "en-US": "ParseX task failed.", "zh-CN": "ParseX 任务失败。" }),
            ExitCode.GENERAL,
            `biz_id: ${flags.bizId}`,
            {
              api: {
                requestId: response.request_id,
                apiCode: typeof response.data.code === "string" ? response.data.code : undefined,
              },
            },
          );
      } finally {
        release?.();
      }
    },
  });
}
