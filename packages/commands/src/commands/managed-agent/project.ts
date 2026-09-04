import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  commitProjectBuild,
  createDirectoryWorkspaceVersionService,
  executeProjectPublish,
  initializeDirectoryProject,
  planProjectPublish,
  previewProjectBuild,
  type ProjectBuildResolver,
  validateDirectoryProject,
} from "@openagentpack/project-workspace";
import { CREDENTIALS_NOTE, resolveAgentProjectConfig } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { renderAgentFeedback } from "./_engine/feedback.ts";
import { launchManagedAgentPlayground } from "./_engine/playground-launcher.ts";
import { installSdkTransport } from "./_engine/transport.ts";
import { formatResourceLabel } from "./_engine/address-utils.ts";

const PROJECT_FLAG = {
  project: {
    type: "string",
    valueHint: "<directory>",
    description: {
      "en-US": "Directory project root (default: current directory)",
      "zh-CN": "目录项目根路径（默认：当前目录）",
    },
  },
} satisfies FlagsDef;

const JSON_FORMAT = "json" as const;

export const managedAgentProjectInit = defineCommand({
  description: {
    "en-US": "Create a directory project or convert the local agents.yaml",
    "zh-CN": "创建目录项目，或转换当前 agents.yaml",
  },
  auth: "none",
  usageArgs: "[--project <directory>]",
  flags: PROJECT_FLAG,
  exampleArgs: ["", "--project ./my-agent"],
  async run(ctx) {
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_initialize_project: ctx.flags.project ?? ".",
        },
        detectOutputFormat(ctx.settings.output),
      );
      return;
    }
    const result = await initializeDirectoryProject({ projectRoot: ctx.flags.project ?? "." });
    emitResult(result, detectOutputFormat(ctx.settings.output));
  },
});

export const managedAgentProjectValidate = defineCommand({
  description: { "en-US": "Validate a directory Agent project", "zh-CN": "校验目录式 Agent 项目" },
  auth: "none",
  usageArgs: "[--project <directory>]",
  flags: PROJECT_FLAG,
  exampleArgs: ["", "--project ./my-agent"],
  async run(ctx) {
    const result = await validateDirectoryProject(ctx.flags.project ?? ".");
    const format = detectOutputFormat(ctx.settings.output);
    if (format === JSON_FORMAT) emitResult(safeInspection(result), format);
    else {
      for (const diagnostic of [...result.diagnostics, ...result.warnings]) {
        emitBare(`${diagnostic.severity}: ${diagnostic.code}: ${diagnostic.message}`);
      }
      if (!result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        emitBare(`Project is valid (${result.project_revision.slice(0, 12)}).`);
      }
    }
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      throw new BailianError("Directory project validation failed.", ExitCode.GENERAL);
    }
  },
});

export const managedAgentProjectBuild = defineCommand({
  description: {
    "en-US": "Organize directory source and generate the immutable Publish Build",
    "zh-CN": "整理目录源文件并生成不可变的发布 Build",
  },
  auth: "none",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This organizes the directory project source and writes the previewed immutable Build.",
      "zh-CN": "该操作会整理目录项目源文件，并写入已预览的不可变 Build。",
    },
  },
  usageArgs: "[--project <directory>]",
  flags: PROJECT_FLAG,
  exampleArgs: ["--dry-run", "--yes", "--project ./my-agent --yes"],
  async run(ctx) {
    const root = ctx.flags.project ?? ".";
    const preview = await previewProjectBuild(root);
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(safeInspection(preview), format);
      return;
    }
    if (!preview.can_build)
      throw new BailianError("Directory project is invalid and cannot be built.", ExitCode.GENERAL);
    const built = await commitProjectBuild({
      projectRoot: root,
      baseRevision: preview.project_revision,
    });
    emitResult(
      { manifest: built.manifest, organization_moves: preview.organization_moves },
      format,
    );
  },
});

export const managedAgentProjectPublish = defineCommand({
  description: {
    "en-US": "Publish the current directory-project Build and record a version",
    "zh-CN": "发布当前目录项目 Build 并记录版本",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This publishes the current directory-project Build and may create, update, or delete remote managed Agent resources.",
      "zh-CN": "该操作会发布当前目录项目 Build，可能创建、更新或删除远端托管 Agent 资源。",
    },
  },
  usageArgs: "[--project <directory>] [--no-refresh] [--concurrency <n>]",
  flags: {
    ...PROJECT_FLAG,
    noRefresh: {
      type: "switch",
      description: {
        "en-US": "Skip remote refresh before planning",
        "zh-CN": "规划前跳过远端刷新",
      },
    },
    concurrency: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Maximum parallel resource operations",
        "zh-CN": "最大并行资源操作数",
      },
    },
  },
  exampleArgs: ["--yes", "--project ./my-agent --yes"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    installSdkTransport(ctx);
    const root = ctx.flags.project ?? ".";
    const resolveBuild: ProjectBuildResolver = async (buildPath) =>
      (await resolveAgentProjectConfig(ctx, buildPath, {
        overrideBailianBaseUrl: true,
      })) as unknown as Awaited<ReturnType<ProjectBuildResolver>>;
    const planned = await withAgentErrors(() =>
      withStdoutProtected(() =>
        planProjectPublish(root, {
          provider: "bailian",
          refresh: !ctx.flags.noRefresh,
          quiet: true,
          onFeedback: renderAgentFeedback,
          resolveBuild,
        }),
      ),
    );
    const actions = planned.planned.plan.actions.filter((action) => action.action !== "no-op");
    if (ctx.settings.dryRun) {
      emitResult(
        {
          project_revision: planned.project_revision,
          build_manifest: planned.build_manifest,
          plan: planned.planned.plan,
        },
        detectOutputFormat(ctx.settings.output),
      );
      return;
    }
    for (const action of actions) {
      const marker = action.action === "create" ? "+" : action.action === "update" ? "~" : "-";
      emitBare(`${marker} ${formatResourceLabel(action.address)}`);
    }
    const result = await withAgentErrors(() =>
      withStdoutProtected(() =>
        executeProjectPublish({
          projectRoot: planned.project_root,
          expectedProjectRevision: planned.project_revision,
          expectedYamlHash: planned.build_manifest.yaml_hash,
          expectedPlanFingerprint: planned.plan_fingerprint,
          provider: "bailian",
          refresh: !ctx.flags.noRefresh,
          concurrency: ctx.flags.concurrency,
          policy: "force",
          onFeedback: renderAgentFeedback,
          resolveBuild,
        }),
      ),
    );
    emitResult(result, detectOutputFormat(ctx.settings.output));
  },
});

export const managedAgentProjectWorkbench = defineCommand({
  description: {
    "en-US": "Launch the directory project Workbench",
    "zh-CN": "启动目录项目 Workbench",
  },
  auth: "apiKey",
  usageArgs: "[--project <directory>] [--port <n>] [--no-open]",
  flags: {
    ...PROJECT_FLAG,
    port: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Local port (default: 4848)", "zh-CN": "本地端口（默认：4848）" },
    },
    noOpen: {
      type: "switch",
      description: { "en-US": "Do not open a browser", "zh-CN": "不自动打开浏览器" },
    },
  },
  exampleArgs: ["", "--project ./my-agent --no-open"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const root = ctx.flags.project ?? ".";
    if (ctx.settings.dryRun) {
      emitResult(
        { would_launch: "workbench", project_root: root, port: ctx.flags.port ?? 4848 },
        detectOutputFormat(ctx.settings.output),
      );
      return;
    }
    await launchManagedAgentPlayground({
      project: root,
      port: ctx.flags.port ?? 4848,
      open: !ctx.flags.noOpen,
      surface: "workbench",
      client: ctx.client,
      settings: ctx.settings,
    });
  },
});

export const managedAgentProjectVersionEnable = versionToggleCommand(true);
export const managedAgentProjectVersionDisable = versionToggleCommand(false);

function versionToggleCommand(enabled: boolean) {
  return defineCommand({
    description: enabled
      ? { "en-US": "Enable directory project versions", "zh-CN": "启用目录项目版本管理" }
      : { "en-US": "Disable directory project versions", "zh-CN": "关闭目录项目版本管理" },
    auth: "none",
    usageArgs: "[--project <directory>]",
    flags: PROJECT_FLAG,
    exampleArgs: ["", "--project ./my-agent"],
    async run(ctx) {
      const service = createDirectoryWorkspaceVersionService(ctx.flags.project ?? ".");
      if (ctx.settings.dryRun) {
        emitResult(
          { would_set_enabled: enabled, status: await service.status() },
          detectOutputFormat(ctx.settings.output),
        );
        return;
      }
      const result = enabled
        ? await service.enable("Enable project versions")
        : await service.disable();
      emitResult(result, detectOutputFormat(ctx.settings.output));
    },
  });
}

export const managedAgentProjectVersionStatus = defineCommand({
  description: {
    "en-US": "Show directory project version status",
    "zh-CN": "显示目录项目版本状态",
  },
  auth: "none",
  usageArgs: "[--project <directory>]",
  flags: PROJECT_FLAG,
  exampleArgs: ["", "--project ./my-agent --output json"],
  async run(ctx) {
    emitResult(
      await createDirectoryWorkspaceVersionService(ctx.flags.project ?? ".").status(),
      detectOutputFormat(ctx.settings.output),
    );
  },
});

export const managedAgentProjectVersionList = defineCommand({
  description: { "en-US": "List directory project versions", "zh-CN": "列出目录项目版本" },
  auth: "none",
  usageArgs: "[--project <directory>] [--limit <n>] [--cursor <cursor>]",
  flags: {
    ...PROJECT_FLAG,
    limit: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Maximum versions to return", "zh-CN": "最多返回的版本数" },
    },
    cursor: {
      type: "string",
      valueHint: "<cursor>",
      description: { "en-US": "Pagination cursor", "zh-CN": "分页游标" },
    },
  },
  exampleArgs: ["", "--limit 20 --output json"],
  async run(ctx) {
    emitResult(
      await createDirectoryWorkspaceVersionService(ctx.flags.project ?? ".").listVersions({
        limit: ctx.flags.limit,
        cursor: ctx.flags.cursor,
      }),
      detectOutputFormat(ctx.settings.output),
    );
  },
});

const VERSION_ID_FLAG = {
  versionId: {
    type: "string",
    valueHint: "<full-version>",
    required: true,
    description: { "en-US": "Full project version ID", "zh-CN": "完整的项目版本 ID" },
  },
} satisfies FlagsDef;

export const managedAgentProjectVersionPreview = defineCommand({
  description: { "en-US": "Preview a directory project version", "zh-CN": "预览目录项目历史版本" },
  auth: "none",
  usageArgs: "--version-id <full-version> [--project <directory>]",
  flags: { ...PROJECT_FLAG, ...VERSION_ID_FLAG },
  exampleArgs: ["--version-id <full-version>"],
  async run(ctx) {
    emitResult(
      await createDirectoryWorkspaceVersionService(ctx.flags.project ?? ".").previewVersion(
        ctx.flags.versionId,
      ),
      detectOutputFormat(ctx.settings.output),
    );
  },
});

export const managedAgentProjectVersionRestore = defineCommand({
  description: {
    "en-US": "Restore a version to the project working directory",
    "zh-CN": "将历史版本恢复到项目工作目录",
  },
  auth: "none",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This restores the full directory source to the working tree. Version history and remote State will not move.",
      "zh-CN": "该操作会将完整目录源文件恢复到工作区；版本历史和远端 State 不会移动。",
    },
  },
  usageArgs: "--version-id <full-version> [--project <directory>]",
  flags: { ...PROJECT_FLAG, ...VERSION_ID_FLAG },
  exampleArgs: ["--version-id <full-version>", "--version-id <full-version> --yes"],
  async run(ctx) {
    const service = createDirectoryWorkspaceVersionService(ctx.flags.project ?? ".");
    const preview = await service.previewVersion(ctx.flags.versionId);
    if (!preview.can_restore)
      throw new BailianError(
        preview.blockers[0] ?? preview.diagnostics[0]?.message ?? "Version cannot be restored.",
        ExitCode.GENERAL,
      );
    if (ctx.settings.dryRun) {
      emitResult(
        { would_restore: ctx.flags.versionId, preview },
        detectOutputFormat(ctx.settings.output),
      );
      return;
    }
    const restored = await service.restoreVersion(ctx.flags.versionId, {
      headVersion: preview.base_head_version,
      projectRevision: preview.base_project_revision,
    });
    emitResult(restored, detectOutputFormat(ctx.settings.output));
  },
});

function safeInspection(result: {
  project_root: string;
  project_revision: string;
  source_manifest_hash: string;
  yaml_hash: string;
  diagnostics: unknown[];
  warnings: unknown[];
  organization_moves: unknown[];
  canonical_yaml: string;
  before_yaml?: string;
  can_build?: boolean;
}) {
  return {
    project_root: result.project_root,
    project_revision: result.project_revision,
    source_manifest_hash: result.source_manifest_hash,
    yaml_hash: result.yaml_hash,
    diagnostics: result.diagnostics,
    warnings: result.warnings,
    organization_moves: result.organization_moves,
    before_yaml: "before_yaml" in result ? result.before_yaml : undefined,
    after_yaml: result.canonical_yaml,
    can_build: "can_build" in result ? result.can_build : undefined,
  };
}
