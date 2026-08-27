import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  type BackendRuntimeInput,
  type IStateManager,
  LocalFileStateBackend,
  planProjectWithStateBackend,
  type ResolvedProjectConfig,
  type ResourceAddress,
  type ResourceSyncRun,
  resolveProjectConfigFromObject,
  syncProjectResourcesWithStateBackend,
} from "@openagentpack/sdk";
import { BailianError, type CommandContext, detectOutputFormat, ExitCode } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { parseDocument } from "yaml";
import { formatResourceLabel } from "./address-utils.ts";
import { resolveAgentProjectConfig } from "./config-loader.ts";
import { assertProviderCredentials } from "./credentials.ts";
import { withStdoutProtected } from "./console-capture.ts";
import { withAgentErrors } from "./errors.ts";
import { createFileStateScope } from "./file-state-manager.ts";
import { installSdkTransport } from "./transport.ts";

export type ScopedCreateHost = Pick<CommandContext, "client" | "identity" | "settings">;
export type ScopedCreateGroup = "agents" | "environments" | "skills" | "vaults" | "deployments";

export interface LoadedScopedCreateProject {
  configPath: string;
  projectName: string;
  config: ResolvedProjectConfig;
  source: string;
  provider: string;
  stateBackend: LocalFileStateBackend;
  stateScope: ReturnType<typeof createFileStateScope>;
}

export interface ResourceKeySelection {
  key: string;
  reusedPending: boolean;
}

export const SCOPED_CREATE_NOTE = [
  {
    "en-US":
      "Without --yes, this command only previews. --dry-run is fully offline. The scoped flow checks only the target resource and its transitive dependencies; unrelated resources are not refreshed or drift-checked.",
    "zh-CN":
      "不带 --yes 时仅预览；--dry-run 完全离线。定向流程只检查目标资源及其传递依赖，不刷新或检测无关资源的 Drift。",
  },
];

export interface ScopedTopLevelCreateInput {
  host: ScopedCreateHost;
  project: LoadedScopedCreateProject;
  group: Exclude<ScopedCreateGroup, "agents">;
  resourceType: "environment" | "skill" | "vault" | "deployment";
  displayName: string;
  rawDeclaration: Record<string, unknown>;
  resolvedDeclaration: Record<string, unknown>;
  existingDeclarations: Record<string, Record<string, unknown>>;
  effectiveName: (key: string, declaration: Record<string, unknown>) => string;
  fallbackKey: string;
  yes: boolean;
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  };
  return JSON.stringify(normalize(value));
}

export function normalizeResourceKey(displayName: string, fallback = "resource"): string {
  const normalized = displayName
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function selectResourceKey(options: {
  displayName: string;
  provider: string;
  resourceTypes: ResourceAddress["type"][];
  declarations: Record<string, Record<string, unknown>>;
  candidate: Record<string, unknown>;
  effectiveName: (key: string, declaration: Record<string, unknown>) => string;
  fallbackKey?: string;
  state: IStateManager;
}): ResourceKeySelection {
  const tracked = new Set(
    options.state
      .listResources()
      .filter(
        (resource) =>
          resource.address.provider === options.provider &&
          options.resourceTypes.includes(resource.address.type),
      )
      .map((resource) => resource.address.name),
  );
  const candidateJson = canonicalJson(options.candidate);
  for (const [key, declaration] of Object.entries(options.declarations)) {
    if (options.effectiveName(key, declaration) !== options.displayName || tracked.has(key))
      continue;
    if (canonicalJson(declaration) === candidateJson) return { key, reusedPending: true };
  }

  const baseKey = normalizeResourceKey(options.displayName, options.fallbackKey);
  if (!(baseKey in options.declarations)) return { key: baseKey, reusedPending: false };
  let suffix = 2;
  while (`${baseKey}-${suffix}` in options.declarations) suffix += 1;
  return { key: `${baseKey}-${suffix}`, reusedPending: false };
}

export async function loadScopedCreateProject(
  host: ScopedCreateHost,
  file: string,
  requestedProvider: string | undefined,
): Promise<LoadedScopedCreateProject> {
  const sourceBeforeLoad = await readFile(resolve(file), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new BailianError(
        `Config file not found: ${file}`,
        ExitCode.USAGE,
        "Run `bl managed-agent init` first.",
      );
    }
    throw error;
  });
  const loaded = await withAgentErrors(() =>
    resolveAgentProjectConfig(host, file, { credentials: "none" }),
  );
  const source = await readFile(loaded.configPath, "utf8");
  if (source !== sourceBeforeLoad) {
    throw new BailianError(
      `${file} changed while it was being loaded.`,
      ExitCode.GENERAL,
      "Re-run the command against the latest file.",
    );
  }
  const provider = resolveTargetProvider(loaded.config, requestedProvider);
  if (!host.settings.dryRun) assertProviderCredentials(loaded.config.providers, [provider]);
  installSdkTransport(host);
  const stateBackend = new LocalFileStateBackend({ configPath: loaded.configPath });
  return {
    ...loaded,
    source,
    provider,
    stateBackend,
    stateScope: createFileStateScope(loaded.configPath, loaded.projectName),
  };
}

export function resolveTargetProvider(
  config: ResolvedProjectConfig,
  requested: string | undefined,
): string {
  if (requested === "all") {
    throw new BailianError(
      "--provider all is not valid for a single-resource create.",
      ExitCode.USAGE,
    );
  }
  if (requested) {
    if (requested in config.providers) return requested;
    throw new BailianError(
      `Provider '${requested}' is not configured in agents.yaml.`,
      ExitCode.USAGE,
    );
  }
  const defaultProvider = config.defaults?.provider;
  if (defaultProvider && defaultProvider !== "all") return defaultProvider;
  const configuredProviders = Object.keys(config.providers);
  if (configuredProviders.length === 1) return configuredProviders[0]!;
  throw new BailianError(
    "Cannot infer one target provider for this create command.",
    ExitCode.USAGE,
    "Pass --provider <name> when defaults.provider is 'all' or multiple providers are configured.",
  );
}

export async function resolveCandidateDeclaration(options: {
  project: LoadedScopedCreateProject;
  group: ScopedCreateGroup;
  rawDeclaration: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const temporaryKey = "__bailian_cli_create_candidate__";
  const rawConfig = structuredClone(options.project.config) as unknown as Record<string, unknown>;
  const declarations = (rawConfig[options.group] ?? {}) as Record<string, unknown>;
  rawConfig[options.group] = { ...declarations, [temporaryKey]: options.rawDeclaration };
  const resolved = await withAgentErrors(() =>
    resolveProjectConfigFromObject(rawConfig, {
      projectName: options.project.projectName,
      basePath: dirname(options.project.configPath),
    }),
  );
  const resolvedGroup = resolved.config[options.group] as
    | Record<string, Record<string, unknown>>
    | undefined;
  return resolvedGroup?.[temporaryKey] ?? options.rawDeclaration;
}

export async function runScopedTopLevelCreate(input: ScopedTopLevelCreateInput): Promise<void> {
  const { project, host } = input;
  const format = detectOutputFormat(host.settings.output);
  const keySelection = await project.stateBackend.read(project.stateScope, (state) =>
    selectResourceKey({
      displayName: input.displayName,
      provider: project.provider,
      resourceTypes: [input.resourceType],
      declarations: input.existingDeclarations,
      candidate: input.resolvedDeclaration,
      effectiveName: input.effectiveName,
      fallbackKey: input.fallbackKey,
      state,
    }),
  );
  const resourceKey = keySelection.key;
  const candidateConfig = structuredClone(project.config) as unknown as Record<string, unknown>;
  const existingGroup = (candidateConfig[input.group] ?? {}) as Record<string, unknown>;
  candidateConfig[input.group] = { ...existingGroup, [resourceKey]: input.resolvedDeclaration };
  candidateConfig._resolved = true;

  const document = parseDocument(project.source);
  if (document.errors.length > 0) {
    throw new BailianError(
      `YAML parse error: ${document.errors.map((error) => error.message).join("; ")}`,
      ExitCode.USAGE,
    );
  }
  document.setIn([input.group, resourceKey], input.rawDeclaration);
  const nextSource = document.toString();
  const root: ResourceAddress = {
    type: input.resourceType,
    name: resourceKey,
    provider: project.provider,
  };
  const backendInput: BackendRuntimeInput = {
    projectName: project.projectName,
    config: candidateConfig as unknown as ResolvedProjectConfig,
    configPath: project.configPath,
    providers: { [project.provider]: project.config.providers[project.provider] },
    stateBackend: project.stateBackend,
    stateScope: project.stateScope,
  };

  if (host.settings.dryRun || !input.yes) {
    const planned = await withAgentErrors(() =>
      withStdoutProtected(() =>
        planProjectWithStateBackend(backendInput, {
          provider: project.provider,
          scope: { roots: [root] },
          mode: "create-only",
          refresh: !host.settings.dryRun,
          quiet: format === "json",
        }),
      ),
    );
    const readyToCreate = !planned.plan.diagnostics.some(
      (diagnostic) => diagnostic.severity === "error",
    );
    const result = {
      resource: {
        type: input.resourceType,
        key: resourceKey,
        name: input.displayName,
        provider: project.provider,
      },
      config_file: project.configPath,
      yaml_written: false,
      reused_pending: keySelection.reusedPending,
      requires_confirmation: !host.settings.dryRun,
      ready_to_create: readyToCreate,
      actions: planned.plan.actions,
      diagnostics: planned.plan.diagnostics,
    };
    if (format === "json") emitResult(result, format);
    else {
      emitBare(`Generated YAML key: ${resourceKey}`);
      renderPlan(planned.plan.actions, planned.plan.diagnostics);
      emitBare(
        host.settings.dryRun
          ? "Dry run: YAML, State, and remote resources were not changed."
          : "Preview only: re-run with --yes to write YAML and create this resource.",
      );
    }
    return;
  }

  await replaceConfigAtomically(project.configPath, project.source, nextSource);
  let run: ResourceSyncRun;
  try {
    run = await withAgentErrors(() =>
      withStdoutProtected(() =>
        syncProjectResourcesWithStateBackend(backendInput, {
          provider: project.provider,
          scope: { roots: [root] },
          mode: "create-only",
          refresh: true,
          quiet: format === "json",
          policy: "block",
        }),
      ),
    );
  } catch (error) {
    throw retainedDeclarationError(error, input.resourceType);
  }
  const remoteId = await project.stateBackend.read(
    project.stateScope,
    (state) => state.getResource(root)?.remote_id,
  );
  const results = run.execution?.results ?? [];
  const failed = results.find((result) => result.status === "failed");
  const result = {
    resource: {
      type: input.resourceType,
      key: resourceKey,
      name: input.displayName,
      provider: project.provider,
      remote_id: remoteId,
    },
    config_file: project.configPath,
    yaml_written: true,
    reused_pending: keySelection.reusedPending,
    actions: run.planned.plan.actions,
    diagnostics: run.planned.plan.diagnostics,
    results,
    error: failed?.error,
  };
  if (format === "json") emitResult(result, format);
  else {
    emitBare(`Wrote ${project.configPath} with ${input.resourceType} key '${resourceKey}'.`);
    if (!failed) emitBare(`Created ${input.resourceType} '${input.displayName}'.`);
  }
  if (failed) {
    throw new BailianError(
      failed.error ?? `Scoped ${input.resourceType} create failed.`,
      ExitCode.GENERAL,
      "The YAML declaration was kept. Fix the provider error, then re-run the same create command.",
    );
  }
}

export async function replaceConfigAtomically(
  configPath: string,
  expectedSource: string,
  nextSource: string,
): Promise<void> {
  const destination = resolve(configPath);
  const currentSource = await readFile(destination, "utf8");
  if (currentSource !== expectedSource) {
    throw new BailianError(
      `${configPath} changed while resource create was being prepared.`,
      ExitCode.GENERAL,
      "Review the latest YAML and re-run the command; no file was overwritten.",
    );
  }
  const currentStat = await stat(destination);
  const temporary = resolve(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
  await writeFile(temporary, nextSource, { flag: "wx", mode: currentStat.mode });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function parseMetadata(values: string[] | undefined): Record<string, string> | undefined {
  if (!values?.length) return undefined;
  const metadata: Record<string, string> = {};
  for (const entry of values) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new BailianError(
        `Invalid metadata '${entry}'.`,
        ExitCode.USAGE,
        "Use --metadata key=value.",
      );
    }
    const key = entry.slice(0, separator).trim();
    if (!key) throw new BailianError("Metadata key must not be empty.", ExitCode.USAGE);
    metadata[key] = entry.slice(separator + 1);
  }
  return metadata;
}

export async function parseJsonInputs(
  values: string[] | undefined,
  label: string,
): Promise<unknown[]> {
  const parsed: unknown[] = [];
  for (const value of values ?? []) {
    const raw = value.startsWith("@") ? await readFile(resolve(value.slice(1)), "utf8") : value;
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      throw new BailianError(
        `Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`,
        ExitCode.USAGE,
      );
    }
    if (Array.isArray(decoded)) parsed.push(...decoded);
    else parsed.push(decoded);
  }
  return parsed;
}

function renderPlan(
  actions: Array<{ action: string; address: ResourceAddress }>,
  diagnostics: Array<{ severity: string; code: string; message: string }>,
): void {
  for (const diagnostic of diagnostics) {
    emitBare(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
  }
  for (const action of actions.filter((entry) => entry.action !== "no-op")) {
    const icon = action.action === "create" ? "+" : action.action === "update" ? "~" : "-";
    emitBare(`  ${icon} ${formatResourceLabel(action.address)}`);
  }
}

function retainedDeclarationError(error: unknown, resourceType: string): BailianError {
  if (error instanceof BailianError) {
    return new BailianError(
      error.message,
      error.exitCode,
      "The YAML declaration was kept. Fix the related dependency or provider error, then re-run the same create command.",
      { api: error.api, rawResponse: error.rawResponse, cause: error.cause },
    );
  }
  return new BailianError(
    error instanceof Error ? error.message : String(error),
    ExitCode.GENERAL,
    `The ${resourceType} YAML declaration was kept; re-run the same create command after fixing the error.`,
  );
}
