import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { ansi, emitResult, displayWidth, padEnd } from "bailian-cli-runtime";
import {
  ensureTelemetryRegionSupported,
  getTelemetryServiceStatus,
  unwrapConsolePrimitive,
  type TelemetryServiceStatus,
} from "../shared/telemetry.ts";
import { getLogSwitch } from "./shared.ts";

const SLR_STATUS_API = "zeldaEasy.bailian-telemetry.activate.getTelemetrySlrStatus";

export const LOG_SERVICE_TYPES = {
  audit: "ModelAuditLog",
  inference: "ModelInferenceLog",
} as const;

export interface LogServiceStatus {
  slrAuthorized: boolean;
  audit: TelemetryServiceStatus;
  inference: TelemetryServiceStatus;
  /** Delivery switch per kind: true = on, false = off, null = never configured. */
  auditSwitch: boolean | null;
  inferenceSwitch: boolean | null;
}

export async function fetchLogServiceStatus(
  client: Parameters<typeof getTelemetryServiceStatus>[0],
  workspaceId?: string,
): Promise<LogServiceStatus> {
  // All five lookups are independent reads; fan them out in parallel.
  const [slrRaw, audit, inference, auditSwitch, inferenceSwitch] = await Promise.all([
    client.console(SLR_STATUS_API, {
      reqDTO: { ...(workspaceId ? { workspaceId } : {}), slrType: "Log" },
    }),
    getTelemetryServiceStatus(client, LOG_SERVICE_TYPES.audit, workspaceId),
    getTelemetryServiceStatus(client, LOG_SERVICE_TYPES.inference, workspaceId),
    getLogSwitch(client, "audit", workspaceId),
    getLogSwitch(client, "inference", workspaceId),
  ]);
  const slrAuthorized = unwrapConsolePrimitive<boolean>(slrRaw) === true;

  return { slrAuthorized, audit, inference, auditSwitch, inferenceSwitch };
}

function statusText(status: TelemetryServiceStatus): string {
  if (!status.openStatus) return "Not activated";
  return status.instanceStatus ?? "-";
}

function switchText(enabled: boolean | null): string {
  if (enabled === null) return "Never configured";
  return enabled ? "On" : "Off";
}

export default defineCommand({
  description: {
    "en-US":
      "Show model log delivery status (SLS authorization, audit / inference service and switches)",
    "zh-CN": "查看模型日志投递状态（SLS 授权、审计 / 推理日志的服务与开关状态）",
  },
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  notes: [
    {
      "en-US":
        "Both log kinds have independent switches; the inference log additionally requires the audit log to stay on.",
      "zh-CN": "审计与推理日志各有独立开关；推理日志还要求审计日志保持开启。",
    },
  ],
  async run(ctx) {
    const { settings, identity } = ctx;
    const format = detectOutputFormat(settings.output);

    ensureTelemetryRegionSupported(settings);
    const status = await fetchLogServiceStatus(ctx.client, settings.workspaceId);

    if (format === "json") {
      emitResult(status, format);
      return;
    }

    const color = ansi(process.stdout);
    const rows: [string, string][] = [
      ["SLS Authorization (SLR)", status.slrAuthorized ? "Authorized" : "Not authorized"],
      ["Audit Log (service)", statusText(status.audit)],
      ["Audit Log (switch)", switchText(status.auditSwitch)],
      ["Inference Log (service)", statusText(status.inference)],
      ["Inference Log (switch)", switchText(status.inferenceSwitch)],
    ];
    const instanceUrl = status.inference.instanceInfo?.instanceUrl;
    if (instanceUrl) rows.push(["SLS Instance URL", instanceUrl]);

    const maxLabel = Math.max(...rows.map(([label]) => displayWidth(label)));
    for (const [label, value] of rows) {
      process.stdout.write(`${color.bold(padEnd(label, maxLabel + 2))}${value}\n`);
    }

    if (status.auditSwitch !== true) {
      process.stdout.write(
        color.dim(`\nRun \`${identity.binName} log audit enable\` to enable audit log delivery.\n`),
      );
    } else if (status.inferenceSwitch !== true) {
      process.stdout.write(
        color.dim(
          `\nRun \`${identity.binName} log inference enable\` to enable inference log delivery.\n`,
        ),
      );
    }
  },
});
