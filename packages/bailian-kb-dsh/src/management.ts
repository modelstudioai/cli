/** Execute the CLI management surface with exactly the plugin's dsh configuration. */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { requireWorkspace } from "./configuration.js";

interface ManagementResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
interface ManagementDependencies {
  resolveConfiguration: () => Promise<{ apiKey: string; workspaceId: string }>;
  execute?: (args: string[], env: NodeJS.ProcessEnv) => Promise<ManagementResult>;
  environment?: NodeJS.ProcessEnv;
  cwd?: string;
  signal?: AbortSignal;
  onSuccess?: () => void;
}

function executeBl(
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { cwd?: string; signal?: AbortSignal },
): Promise<ManagementResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "bl",
      args,
      { env, ...options, timeout: 300_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") {
          reject(
            new Error(
              "Cannot execute bl; check installation or command timeout. / 无法执行 bl，请检查安装或命令超时。",
            ),
          );
          return;
        }
        resolve({ stdout, stderr, exitCode: typeof error?.code === "number" ? error.code : 0 });
      },
    );
  });
}

export async function runManagement(
  args: string[],
  deps: ManagementDependencies,
): Promise<ManagementResult> {
  const forbidden = new Set([
    "--api-key",
    "--workspace-id",
    "--base-url",
    "--config",
    "--config-dir",
    "--apiKey",
    "--workspaceId",
    "--baseUrl",
    "--configDir",
  ]);
  if (args.some((argument) => forbidden.has(argument.split("=")[0]!))) {
    throw new Error(
      "Connection options belong to dsh settings. / 连接配置只能在 dsh 插件设置中修改。",
    );
  }
  const config = await deps.resolveConfiguration();
  const workspaceId = requireWorkspace(config.workspaceId);
  if (!config.apiKey.trim())
    throw new Error("API key is missing in dsh credentials. / dsh 凭据中缺少 API Key。");
  const directory = await mkdtemp(join(tmpdir(), "bailian-kb-dsh-"));
  try {
    const environment = { ...(deps.environment ?? process.env) };
    for (const name of Object.keys(environment)) {
      if (name.startsWith("DASHSCOPE_") || name.startsWith("BAILIAN_")) delete environment[name];
    }
    const result = await (
      deps.execute ??
      ((commandArgs, env) => executeBl(commandArgs, env, { cwd: deps.cwd, signal: deps.signal }))
    )(["knowledge", ...args], {
      ...environment,
      BAILIAN_CONFIG_DIR: directory,
      BAILIAN_WORKSPACE_ID: workspaceId,
      DASHSCOPE_API_KEY: config.apiKey,
    });
    if (result.exitCode === 0) deps.onSuccess?.();
    return {
      ...result,
      stdout: result.stdout.split(config.apiKey).join("[redacted]"),
      stderr: result.stderr.split(config.apiKey).join("[redacted]"),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function createManagementTool(deps: ManagementDependencies) {
  return defineTool({
    name: "kb_manage",
    description:
      "Run a bl knowledge management command using the same dsh credentials and Workspace as kb_search/kb_chat. Pass arguments after 'bl knowledge' as an array, without shell syntax or connection overrides. / 使用 dsh 配置执行知识库管理命令。",
    parameters: {
      args: {
        type: "array",
        items: { type: "string" },
        required: true,
        description:
          'Arguments after bl knowledge, e.g. ["service", "list", "--scene", "search"]. / bl knowledge 后的参数数组。',
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          stdout: { type: "string", required: true },
          stderr: { type: "string", required: true },
          exitCode: { type: "number", required: true },
        },
      },
      render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }],
    },
    execute: async (args, execution) =>
      runManagement(args.args, {
        ...deps,
        cwd: execution.agent?.session.header.cwd,
        signal: execution.signal,
      }),
  });
}
