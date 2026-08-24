import {
  getManagedAgentProviderCapabilities,
  getSession,
  listRemoteFiles,
  listSessionEvents,
  type ProjectRuntimeContext,
  type ProviderFileInfo,
  type ProviderSessionEvent,
  type ProviderSessionInfo,
} from "@openagentpack/sdk";
import { sanitizeSessionEvents } from "@openagentpack/sdk/session-events";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { API_TARGET_FLAGS } from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { writeOutputFile } from "./_engine/output-file.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const SESSION_ID_FLAG = {
  sessionId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Session ID", "zh-CN": "Session ID" },
  },
} as const;

const DEBUG_FLAGS = { ...API_TARGET_FLAGS, ...SESSION_ID_FLAG };
const EXPORT_FLAGS = {
  ...DEBUG_FLAGS,
  outputFile: {
    type: "string",
    valueHint: "<path>",
    required: true,
    description: { "en-US": "Destination ZIP path", "zh-CN": "目标 ZIP 路径" },
  },
  force: {
    type: "switch",
    description: { "en-US": "Overwrite an existing output file", "zh-CN": "覆盖已存在的输出文件" },
  },
} as const;

interface SessionDiagnosticBundle {
  session: ProviderSessionInfo;
  events: unknown[];
  files: ProviderFileInfo[];
  capabilities: ReturnType<typeof getManagedAgentProviderCapabilities>;
  errors: Array<{ component: "events" | "files"; message: string }>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectSessionDiagnostics(
  runtime: ProjectRuntimeContext,
  sessionId: string,
  provider?: string,
): Promise<SessionDiagnosticBundle> {
  // Session lookup is the identity anchor. If it fails, the aggregate is not meaningful.
  const session = await getSession(runtime, sessionId, provider);
  const providerName =
    provider ??
    (runtime.providers.size === 1 ? Array.from(runtime.providers.keys())[0]! : "bailian");
  const errors: SessionDiagnosticBundle["errors"] = [];
  let events: ProviderSessionEvent[] = [];
  let files: ProviderFileInfo[] = [];

  try {
    const result = await fetchAllPages(async (page) => {
      const response = await listSessionEvents(runtime, sessionId, {
        provider,
        limit: 100,
        page_token: page,
        order: "asc",
      });
      return { items: response.events, hasMore: response.has_more, nextPage: response.next_page };
    }, true);
    events = result.items;
  } catch (error) {
    errors.push({ component: "events", message: errorMessage(error) });
  }

  try {
    const result = await fetchAllPages(async (page) => {
      const response = await listRemoteFiles(runtime, {
        provider,
        scope_id: sessionId,
        limit: 100,
        page,
      });
      return { items: response.data, hasMore: response.has_more, nextPage: response.next_page };
    }, true);
    files = result.items;
  } catch (error) {
    errors.push({ component: "files", message: errorMessage(error) });
  }

  return {
    session,
    events: sanitizeSessionEvents(events),
    files,
    capabilities: getManagedAgentProviderCapabilities(providerName),
    errors,
  };
}

const SENSITIVE_KEY =
  /(api[_-]?key|access[_-]?key|secret|token|authorization|credential|password)/i;

export function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitiveValues(entry),
    ]),
  );
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(redactSensitiveValues(value), null, 2)}\n`);
}

// Minimal ZIP writer using stored (uncompressed) entries. This avoids shelling out
// and keeps export deterministic across supported Node runtimes.
function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function littleEndian(values: Array<[number, number]>): Uint8Array {
  const size = values.reduce((sum, [, bytes]) => sum + bytes, 0);
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  for (const [value, bytes] of values) {
    if (bytes === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += bytes;
  }
  return new Uint8Array(buffer);
}

export function createZip(entries: Array<{ name: string; content: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.content);
    const localHeader = littleEndian([
      [0x04034b50, 4],
      [20, 2],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 2],
      [checksum, 4],
      [entry.content.length, 4],
      [entry.content.length, 4],
      [name.length, 2],
      [0, 2],
    ]);
    const local = concatBytes([localHeader, name, entry.content]);
    localParts.push(local);
    const centralHeader = littleEndian([
      [0x02014b50, 4],
      [20, 2],
      [20, 2],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 2],
      [checksum, 4],
      [entry.content.length, 4],
      [entry.content.length, 4],
      [name.length, 2],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 4],
      [localOffset, 4],
    ]);
    centralParts.push(concatBytes([centralHeader, name]));
    localOffset += local.length;
  }
  const central = concatBytes(centralParts);
  const end = littleEndian([
    [0x06054b50, 4],
    [0, 2],
    [0, 2],
    [entries.length, 2],
    [entries.length, 2],
    [central.length, 4],
    [localOffset, 4],
    [0, 2],
  ]);
  return concatBytes([...localParts, central, end]);
}

export const managedAgentSessionDebug = defineCommand({
  description: { "en-US": "Aggregate session diagnostics", "zh-CN": "聚合 Session 诊断信息" },
  auth: "apiKey",
  usageArgs: "--session-id <id>",
  flags: DEBUG_FLAGS,
  exampleArgs: ["--session-id sess_abc", "--session-id sess_abc --output json"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const bundle = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return collectSessionDiagnostics(runtime, ctx.flags.sessionId, ctx.flags.provider);
      }),
    );
    const redacted = redactSensitiveValues(bundle);
    if (format === "json") {
      emitResult(redacted, format);
      return;
    }
    emitBare(`Session:      ${bundle.session.id} (${bundle.session.status})`);
    emitBare(`Events:       ${bundle.events.length}`);
    emitBare(`Scoped files: ${bundle.files.length}`);
    emitBare(`Partial errors: ${bundle.errors.length}`);
    for (const error of bundle.errors) emitBare(`  ${error.component}: ${error.message}`);
  },
});

export const managedAgentSessionExport = defineCommand({
  description: {
    "en-US": "Export session diagnostics as a ZIP",
    "zh-CN": "将 Session 诊断信息导出为 ZIP",
  },
  auth: "apiKey",
  usageArgs: "--session-id <id> --output-file <path> [--force]",
  flags: EXPORT_FLAGS,
  exampleArgs: ["--session-id sess_abc --output-file ./session-debug.zip"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "The ZIP contains metadata only; file bodies and credential-like values are excluded/redacted.",
      "zh-CN": "ZIP 仅包含元数据；不会包含文件正文，凭证类字段会被移除或脱敏。",
    },
  ],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        { would_export_session: ctx.flags.sessionId, output_file: ctx.flags.outputFile },
        format,
      );
      return;
    }
    const bundle = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return collectSessionDiagnostics(runtime, ctx.flags.sessionId, ctx.flags.provider);
      }),
    );
    const manifest = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      session_id: bundle.session.id,
      partial: bundle.errors.length > 0,
      counts: {
        events: bundle.events.length,
        files: bundle.files.length,
        errors: bundle.errors.length,
      },
      contents: ["session.json", "events.json", "files.json", "capabilities.json", "errors.json"],
      note: "File bodies are not included. Credential-like fields are redacted.",
    };
    const zip = createZip([
      { name: "manifest.json", content: jsonBytes(manifest) },
      { name: "session.json", content: jsonBytes(bundle.session) },
      { name: "events.json", content: jsonBytes(bundle.events) },
      { name: "files.json", content: jsonBytes(bundle.files) },
      { name: "capabilities.json", content: jsonBytes(bundle.capabilities) },
      { name: "errors.json", content: jsonBytes(bundle.errors) },
    ]);
    const outputFile = await writeOutputFile(ctx.flags.outputFile, zip, ctx.flags.force);
    if (format === "json") {
      emitResult(
        { exported: bundle.session.id, output_file: outputFile, partial: manifest.partial },
        format,
      );
    } else {
      emitBare(
        `Session diagnostics exported to ${outputFile}${manifest.partial ? " (partial)" : ""}`,
      );
    }
  },
});
