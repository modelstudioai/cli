import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";

export interface InitTarget {
  endpointOrigin: string;
  workspaceId: string;
}

export interface InitState {
  schemaVersion: 1;
  target: InitTarget;
  name: string;
  operationId: string;
  phase: "prepared" | "uploaded" | "indexed" | "service-ready" | "verified";
  pending?: { action: "upload" | "create-index" | "create-service"; startedAt: string };
  fileId?: string;
  leaseId?: string;
  indexId?: string;
  ingestionId?: string;
  agentId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const phases = ["prepared", "uploaded", "indexed", "service-ready", "verified"];
const fields = new Set([
  "schemaVersion",
  "target",
  "name",
  "operationId",
  "phase",
  "pending",
  "fileId",
  "leaseId",
  "indexId",
  "ingestionId",
  "agentId",
]);

export function parseInitState(
  value: unknown,
  target: InitTarget,
  name: string,
  localize: (text: LocalizedText) => string,
): InitState | undefined {
  if (value === undefined) return undefined;
  const invalid = () =>
    new BailianError(
      localize({
        "en-US":
          "Invalid or incompatible initialization state. Restore the checkpoint before continuing.",
        "zh-CN": "初始化记录无效或版本不兼容。请恢复记录后再继续。",
      }),
      ExitCode.GENERAL,
    );
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.target) ||
    !isNonemptyString(value.target.endpointOrigin) ||
    !isNonemptyString(value.target.workspaceId) ||
    Object.keys(value.target).some((field) => !["endpointOrigin", "workspaceId"].includes(field)) ||
    !isNonemptyString(value.name) ||
    !isNonemptyString(value.operationId) ||
    typeof value.phase !== "string" ||
    !phases.includes(value.phase) ||
    Object.keys(value).some((field) => !fields.has(field))
  )
    throw invalid();
  for (const field of ["fileId", "leaseId", "indexId", "ingestionId", "agentId"]) {
    if (value[field] !== undefined && !isNonemptyString(value[field])) throw invalid();
  }
  const phaseIndex = phases.indexOf(value.phase);
  if (
    (phaseIndex >= 1 && !value.fileId) ||
    (phaseIndex >= 2 && !value.indexId) ||
    (phaseIndex >= 3 && !value.agentId)
  )
    throw invalid();
  if (value.pending !== undefined) {
    const pending = value.pending;
    if (
      !isRecord(pending) ||
      typeof pending.action !== "string" ||
      !["upload", "create-index", "create-service"].includes(pending.action) ||
      typeof pending.startedAt !== "string" ||
      !Number.isFinite(Date.parse(pending.startedAt)) ||
      Object.keys(pending).some((field) => !["action", "startedAt"].includes(field))
    )
      throw invalid();
  }
  if (
    value.target.endpointOrigin !== target.endpointOrigin ||
    value.target.workspaceId !== target.workspaceId
  ) {
    throw new BailianError(
      localize({
        "en-US":
          "Initialization state belongs to a different target. Use a separate state file for this endpoint and workspace.",
        "zh-CN": "初始化记录属于其他目标。请为当前 API 地址和工作空间使用独立的状态文件。",
      }),
      ExitCode.GENERAL,
    );
  }
  if (value.name !== name) {
    throw new BailianError(
      localize({
        "en-US":
          "Initialization name differs from the checkpoint. Restore the previous name or use a separate state file.",
        "zh-CN": "初始化名称与记录不一致。请使用原名称或独立的状态文件。",
      }),
      ExitCode.GENERAL,
    );
  }
  return value as unknown as InitState;
}
