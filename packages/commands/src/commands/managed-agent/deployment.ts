import type { DeploymentInfo, DeploymentRunInfo, ProjectRuntimeContext } from "@openagentpack/sdk";
import {
  getRemoteDeployment,
  getRemoteDeploymentRun,
  listRemoteDeploymentRuns,
  listRemoteDeployments,
  runRemoteDeployment,
  setRemoteDeploymentPaused,
  UserError,
} from "@openagentpack/sdk";
import { BailianError, defineCommand, detectOutputFormat, ExitCode } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  INCLUDE_ARCHIVED_FLAG,
  SEARCH_FLAGS,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const DEPLOYMENT_ID_FLAG = {
  deploymentId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Deployment ID", "zh-CN": "Deployment ID" },
  },
} as const;

const LIST_FILTER_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by agent ID", "zh-CN": "按 Agent ID 筛选" },
  },
  status: {
    type: "string",
    valueHint: "<status>",
    choices: ["active", "paused"] as const,
    description: { "en-US": "Filter by deployment status", "zh-CN": "按 Deployment 状态筛选" },
  },
  ...INCLUDE_ARCHIVED_FLAG,
  createdAtGte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or after this timestamp",
      "zh-CN": "创建时间不早于该时间戳",
    },
  },
  createdAtLte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or before this timestamp",
      "zh-CN": "创建时间不晚于该时间戳",
    },
  },
} as const;

const LIST_FLAGS = { ...API_TARGET_FLAGS, ...CURSOR_FLAGS, ...LIST_FILTER_FLAGS };
const GET_FLAGS = { ...API_TARGET_FLAGS, ...DEPLOYMENT_ID_FLAG };
const SEARCH_RESOURCE_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  query: SEARCH_FLAGS.query,
  ...LIST_FILTER_FLAGS,
};
const RUN_LIST_FLAGS = { ...API_TARGET_FLAGS, ...DEPLOYMENT_ID_FLAG, ...CURSOR_FLAGS };
const RUN_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  runId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Deployment run ID", "zh-CN": "Deployment Run ID" },
  },
} as const;
const ACTION_TARGET_FLAGS = {
  ...API_TARGET_FLAGS,
  deployment: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Logical deployment name in agents.yaml/state",
      "zh-CN": "agents.yaml/State 中的逻辑 Deployment 名称",
    },
  },
  deploymentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Direct deployment ID", "zh-CN": "直接指定 Deployment ID" },
  },
} as const;
const RUN_ACTION_FLAGS = {
  ...ACTION_TARGET_FLAGS,
  yes: {
    type: "switch",
    description: { "en-US": "Confirm deployment run", "zh-CN": "确认运行 Deployment" },
  },
} as const;

function validateActionTarget(flags: {
  deployment?: string;
  deploymentId?: string;
}): string | undefined {
  if (Boolean(flags.deployment) === Boolean(flags.deploymentId)) {
    return "Provide exactly one of --deployment or --deployment-id.";
  }
  return undefined;
}

function deploymentRows(deployments: DeploymentInfo[]): string[][] {
  return deployments.map((deployment) => [
    displayValue(deployment.id),
    deployment.status,
    displayValue(deployment.schedule?.expression),
    displayValue(deployment.paused_reason?.type),
  ]);
}

function runRows(runs: DeploymentRunInfo[]): string[][] {
  return runs.map((run) => [
    run.id,
    displayValue(run.deployment_id),
    displayValue(run.session_id),
    displayValue(run.status),
    displayValue(run.created_at),
  ]);
}

async function resolveDeploymentTarget(
  runtime: ProjectRuntimeContext,
  options: { provider?: string; deployment?: string; deploymentId?: string },
): Promise<string> {
  if (options.deploymentId) return options.deploymentId;
  const configuredProviders = Array.from(runtime.providers.keys());
  const provider =
    options.provider ??
    (configuredProviders.length === 1
      ? configuredProviders[0]
      : (() => {
          throw new UserError("Multiple providers configured. Use --provider to specify one.");
        })());
  const state = runtime.state.getResource({
    provider,
    type: "deployment",
    name: options.deployment!,
  });
  if (!state?.remote_id) {
    throw new UserError(
      `Deployment '${options.deployment}' is not tracked in state. Use --deployment-id or run managed-agent apply/import first.`,
    );
  }
  return state.remote_id;
}

export const managedAgentDeploymentList = defineCommand({
  description: { "en-US": "List Managed Agent deployments", "zh-CN": "列出托管 Agent Deployment" },
  auth: "apiKey",
  usageArgs: "[--agent-id <id>] [--status active|paused] [--limit <n>] [--page <cursor>] [--all]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--status active --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteDeployments(runtime, {
              provider: ctx.flags.provider,
              agent_id: ctx.flags.agentId,
              status: ctx.flags.status,
              include_archived: ctx.flags.includeArchived,
              created_at_gte: ctx.flags.createdAtGte,
              created_at_lte: ctx.flags.createdAtLte,
              limit: ctx.flags.limit,
              page,
            });
            return {
              items: response.deployments,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "deployments",
      items: result.items,
      headers: ["ID", "STATUS", "SCHEDULE", "PAUSED REASON"],
      rows: deploymentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No deployments found.",
    });
  },
});

export const managedAgentDeploymentGet = defineCommand({
  description: {
    "en-US": "Get a Managed Agent deployment",
    "zh-CN": "获取托管 Agent Deployment 详情",
  },
  auth: "apiKey",
  usageArgs: "--deployment-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--deployment-id dep_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const deployment = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteDeployment(runtime, ctx.flags.deploymentId, {
          provider: ctx.flags.provider,
        });
      }),
    );
    if (format === "json") emitResult(deployment, format);
    else {
      emitBare(`ID:      ${displayValue(deployment.id)}`);
      emitBare(`Status:  ${deployment.status}`);
      emitBare(`Schedule:${displayValue(deployment.schedule?.expression)}`);
      emitBare(`Paused:  ${displayValue(deployment.paused_reason)}`);
    }
  },
});

export const managedAgentDeploymentSearch = defineCommand({
  description: {
    "en-US": "Search Managed Agent deployments",
    "zh-CN": "搜索托管 Agent Deployment",
  },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page <cursor>] [--all]",
  flags: SEARCH_RESOURCE_FLAGS,
  exampleArgs: ["--query report", "--query nightly --all --output json"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US": "Deployment search maps --query to the provider's server-side keyword parameter.",
      "zh-CN": "Deployment 搜索会把 --query 映射为 Provider 服务端 keyword 参数。",
    },
  ],
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteDeployments(runtime, {
              provider: ctx.flags.provider,
              keyword: ctx.flags.query,
              agent_id: ctx.flags.agentId,
              status: ctx.flags.status,
              include_archived: ctx.flags.includeArchived,
              created_at_gte: ctx.flags.createdAtGte,
              created_at_lte: ctx.flags.createdAtLte,
              limit: ctx.flags.limit,
              page,
            });
            return {
              items: response.deployments,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "deployments",
      items: result.items,
      headers: ["ID", "STATUS", "SCHEDULE", "PAUSED REASON"],
      rows: deploymentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No matching deployments found.",
    });
  },
});

export const managedAgentDeploymentRunsList = defineCommand({
  description: {
    "en-US": "List runs for a Managed Agent deployment",
    "zh-CN": "列出托管 Agent Deployment Run",
  },
  auth: "apiKey",
  usageArgs: "--deployment-id <id> [--limit <n>] [--page <cursor>] [--all]",
  flags: RUN_LIST_FLAGS,
  exampleArgs: ["--deployment-id dep_abc", "--deployment-id dep_abc --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteDeploymentRuns(runtime, ctx.flags.deploymentId, {
              provider: ctx.flags.provider,
              limit: ctx.flags.limit,
              page,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "runs",
      items: result.items,
      headers: ["ID", "DEPLOYMENT", "SESSION", "STATUS", "CREATED"],
      rows: runRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No deployment runs found.",
    });
  },
});

export const managedAgentDeploymentRunsGet = defineCommand({
  description: {
    "en-US": "Get a Managed Agent deployment run",
    "zh-CN": "获取托管 Agent Deployment Run 详情",
  },
  auth: "apiKey",
  usageArgs: "--run-id <id>",
  flags: RUN_GET_FLAGS,
  exampleArgs: ["--run-id run_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const run = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteDeploymentRun(runtime, ctx.flags.runId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") emitResult(run, format);
    else {
      emitBare(`ID:         ${run.id}`);
      emitBare(`Deployment: ${displayValue(run.deployment_id)}`);
      emitBare(`Session:    ${displayValue(run.session_id)}`);
      emitBare(`Status:     ${displayValue(run.status)}`);
      emitBare(`Created:    ${displayValue(run.created_at)}`);
      emitBare(`Error:      ${displayValue(run.error)}`);
    }
  },
});

export const managedAgentDeploymentRun = defineCommand({
  description: {
    "en-US": "Run a Managed Agent deployment now",
    "zh-CN": "立即运行托管 Agent Deployment",
  },
  auth: "apiKey",
  usageArgs: "(--deployment <name> | --deployment-id <id>) --yes",
  flags: RUN_ACTION_FLAGS,
  exampleArgs: ["--deployment daily-report --dry-run", "--deployment-id dep_abc --yes"],
  notes: CREDENTIALS_NOTE,
  validate: validateActionTarget,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_run_deployment: ctx.flags.deploymentId ?? ctx.flags.deployment,
          target_kind: ctx.flags.deploymentId ? "id" : "state_name",
        },
        format,
      );
      return;
    }
    if (!ctx.flags.yes) {
      throw new BailianError(
        "Refusing to run the deployment without confirmation.",
        ExitCode.USAGE,
        "Re-run with --yes or preview with --dry-run.",
      );
    }
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        const deploymentId = await resolveDeploymentTarget(runtime, ctx.flags);
        return {
          deploymentId,
          run: await runRemoteDeployment(runtime, deploymentId, { provider: ctx.flags.provider }),
        };
      }),
    );
    if (format === "json")
      emitResult({ deployment_id: result.deploymentId, ...result.run }, format);
    else emitBare(`Deployment ${result.deploymentId} started. Run: ${result.run.run_id ?? "-"}`);
  },
});

function createPauseCommand(paused: boolean) {
  return defineCommand({
    description: paused
      ? { "en-US": "Pause a Managed Agent deployment", "zh-CN": "暂停托管 Agent Deployment" }
      : { "en-US": "Unpause a Managed Agent deployment", "zh-CN": "恢复托管 Agent Deployment" },
    auth: "apiKey",
    usageArgs: "(--deployment <name> | --deployment-id <id>)",
    flags: ACTION_TARGET_FLAGS,
    exampleArgs: [`--deployment daily-report --dry-run`, `--deployment-id dep_abc`],
    notes: CREDENTIALS_NOTE,
    validate: validateActionTarget,
    async run(ctx) {
      const format = detectOutputFormat(ctx.settings.output);
      if (ctx.settings.dryRun) {
        emitResult(
          {
            [paused ? "would_pause_deployment" : "would_unpause_deployment"]:
              ctx.flags.deploymentId ?? ctx.flags.deployment,
            target_kind: ctx.flags.deploymentId ? "id" : "state_name",
          },
          format,
        );
        return;
      }
      const result = await withAgentErrors(() =>
        withStdoutProtected(async () => {
          const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
          const deploymentId = await resolveDeploymentTarget(runtime, ctx.flags);
          return {
            deploymentId,
            deployment: await setRemoteDeploymentPaused(runtime, deploymentId, paused, {
              provider: ctx.flags.provider,
            }),
          };
        }),
      );
      if (format === "json") {
        emitResult({ deployment_id: result.deploymentId, deployment: result.deployment }, format);
      } else {
        emitBare(`Deployment ${result.deploymentId} ${paused ? "paused" : "unpaused"}.`);
      }
    },
  });
}

export const managedAgentDeploymentPause = createPauseCommand(true);
export const managedAgentDeploymentUnpause = createPauseCommand(false);
