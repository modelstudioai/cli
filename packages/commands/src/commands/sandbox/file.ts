import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  agentStudioFilesPath,
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  sandboxBaseUrl,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { redactConnectionCredentials, resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const UPLOAD_SOURCE = "sandbox_template";

export const sandboxFileUpload = defineCommand({
  description: {
    "en-US": "Upload a workspace file for Sandbox template mounts",
    "zh-CN": "上传工作空间文件，供 Sandbox 模版挂载使用",
  },
  auth: "apiKey",
  usageArgs: "--path <path> [--filename <name>] [--mime-type <type>]",
  flags: {
    ...WORKSPACE_FLAG,
    path: {
      type: "string",
      valueHint: "<path>",
      required: true,
      description: { "en-US": "Local file path", "zh-CN": "本地文件路径" },
    },
    filename: {
      type: "string",
      valueHint: "<name>",
      description: { "en-US": "Remote filename override", "zh-CN": "覆盖远端文件名" },
    },
    mimeType: {
      type: "string",
      valueHint: "<type>",
      description: {
        "en-US": "Multipart file MIME type (default: application/octet-stream)",
        "zh-CN": "Multipart 文件部分的 MIME 类型（默认：application/octet-stream）",
      },
    },
  },
  exampleArgs: [
    "--path ./config.json --output json",
    "--path ./config.json --quiet",
    "--path ./notes.txt --filename notes.txt --mime-type text/plain --dry-run --output json",
  ],
  notes: [
    {
      "en-US":
        "POST /api/v1/agentstudio/files with multipart fields file and source=sandbox_template. Uses a Bailian Bearer API Key, not Console authentication or an E2B key; no agents.yaml is needed.",
      "zh-CN":
        "向 /api/v1/agentstudio/files 发送 multipart 字段 file 和 source=sandbox_template。使用百炼 Bearer API Key，不使用 Console 鉴权或 E2B Key；无需 agents.yaml。",
    },
    {
      "en-US":
        "Base URL follows Sandbox: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. Without one, --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id selects the cn-beijing origin. The upload path has no /sandbox prefix.",
      "zh-CN":
        "Base URL 沿用 Sandbox：--base-url > DASHSCOPE_BASE_URL > 登录/Profile 的 base_url。未配置时，按 --workspace-id > BAILIAN_WORKSPACE_ID > 配置项 workspace_id 选择 cn-beijing 地址。上传路径不带 /sandbox 前缀。",
    },
    {
      "en-US":
        "Returns the upload response immediately; --quiet prints only its id. Upload does not wait for security review: status=checking is not ready to mount. Use an available file's id as mntConfig[].originFileId in template create/update --body, together with mountPath and optional originFileName, in the same workspace. This does not transfer files into a running instance.",
      "zh-CN":
        "上传响应返回后立即输出，--quiet 仅输出 id。不会等待安全审核：status=checking 不代表已可挂载。在同一工作空间的 template create/update --body 中，将可用文件的 id 填入 mntConfig[].originFileId，同时传入 mountPath 和可选的 originFileName。此命令不向运行中的实例传文件。",
    },
    {
      "en-US":
        "--dry-run previews the endpoint, source, and local path without reading or uploading the file. The service detects the MIME type and enforces upload limits.",
      "zh-CN":
        "--dry-run 仅预览 Endpoint、source 和本地路径，不读取或上传文件。MIME 类型检测和上传限制由服务端执行。",
    },
  ],
  async run(ctx) {
    const endpoint = ctx.client.url(agentStudioFilesPath(), () =>
      sandboxBaseUrl(resolveWorkspaceId(ctx)),
    );
    const filename = ctx.flags.filename ?? basename(ctx.flags.path);
    const mimeType = ctx.flags.mimeType ?? "application/octet-stream";
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        {
          method: "POST",
          endpoint,
          request: { source: UPLOAD_SOURCE, file: { path: ctx.flags.path, filename, mimeType } },
        },
        format,
      );
      return;
    }

    const content = new Uint8Array(await readFile(ctx.flags.path));
    const form = new FormData();
    form.append("source", UPLOAD_SOURCE);
    form.append("file", new Blob([content], { type: mimeType }), filename);
    const file = await ctx.client.requestJson<Record<string, unknown>>({
      method: "POST",
      path: endpoint,
      body: form,
    });
    if (!file || typeof file.id !== "string" || !file.id.trim()) {
      throw new BailianError(
        "Upload response did not contain a File ID. / 上传响应未包含 File ID。",
        ExitCode.GENERAL,
      );
    }
    if (ctx.settings.quiet) emitBare(file.id);
    else emitResult(redactConnectionCredentials(file), format);
  },
});
