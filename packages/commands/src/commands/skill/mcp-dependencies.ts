import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BailianError, fetchSkillsIndex, type CommandContext } from "bailian-cli-core";
import { prepareLifecycle, writeServer, type LifecyclePlan } from "../mcp/server-lifecycle.ts";
import type { McpRequestContext } from "../mcp/server-response.ts";
import { cloudCatalog, type Revision, type unpackRevision } from "./packages.ts";

/** Package values may include credentials. Only explicit serverCode fields leave this reader. */
export function readMcpDependencies(
  root: string,
  localize: CommandContext["localize"],
): string[] | undefined {
  const invalid = () =>
    new BailianError(
      localize({
        "en-US": "Invalid service declaration in mcp-config.json.",
        "zh-CN": "mcp-config.json 中的服务声明格式无效。",
      }),
    );
  const path = join(root, "mcp-config.json");
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry) return;
  if (!entry.isFile()) throw invalid();
  const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(file);
    if (
      !stat.isFile() ||
      stat.dev !== entry.dev ||
      stat.ino !== entry.ino ||
      stat.size > 1024 * 1024
    )
      throw invalid();
    const manifest: unknown = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw invalid();
    const codes = new Set<string>();
    for (const value of Object.values(manifest)) {
      if (!value || typeof value !== "object") continue;
      if (!Object.hasOwn(value, "serverCode")) {
        if (Object.hasOwn(value, "serverName")) throw invalid();
        continue;
      }
      const code: unknown = value.serverCode;
      if (
        typeof code !== "string" ||
        !code.trim() ||
        /[,/\\?#\s\p{Cc}]/u.test(code) ||
        code === "." ||
        code === ".."
      )
        throw invalid();
      codes.add(code);
    }
    return [...codes];
  } catch {
    throw invalid();
  } finally {
    closeSync(file);
  }
}

type Artifact = Awaited<ReturnType<typeof unpackRevision>>;
type Context = McpRequestContext & Pick<CommandContext, "identity">;

/** One invocation uses the same catalog revisions and verified packages for preview and installation. */
export class SkillAddPackages {
  readonly revisions = new Map<string, Promise<Revision>>();
  readonly packages = new Map<string, Artifact>();
  private readonly manifests = new Map<string, string[] | undefined>();
  private readonly scratch: string[] = [];
  private index?: ReturnType<typeof fetchSkillsIndex>;
  private catalog?: ReturnType<typeof cloudCatalog>;
  private steps: LifecyclePlan = [];

  constructor(private readonly localize: CommandContext["localize"]) {}

  ossIndex() {
    return (this.index ??= fetchSkillsIndex());
  }
  cloudCatalog(ctx: Parameters<typeof cloudCatalog>[0]) {
    return (this.catalog ??= cloudCatalog(ctx));
  }
  temp() {
    const path = mkdtempSync(join(tmpdir(), "bl-skill-add-"));
    this.scratch.push(path);
    return path;
  }
  dispose() {
    for (const path of this.scratch) rmSync(path, { recursive: true, force: true });
  }
  inspect(skill: string, root: string, planning: boolean) {
    const codes = readMcpDependencies(root, this.localize);
    if (planning) this.manifests.set(skill, codes);
    else if (
      !this.manifests.has(skill) ||
      JSON.stringify(this.manifests.get(skill)) !== JSON.stringify(codes)
    )
      throw new BailianError(
        this.localize({
          "en-US": "Skill dependencies changed during planning. Retry the install.",
          "zh-CN": "安装计划生成后 Skill 依赖发生了变化，请重新安装。",
        }),
      );
  }
  private owners(skills: Set<string>) {
    const owners = new Map<string, string[]>();
    for (const skill of skills) {
      for (const code of this.manifests.get(skill) ?? []) {
        const names = owners.get(code) ?? [];
        names.push(skill);
        owners.set(code, names);
      }
    }
    return owners;
  }
  async plan(ctx: Context, skills: Set<string>) {
    const codes = [...this.owners(skills).keys()];
    this.steps = codes.length
      ? (await prepareLifecycle(ctx, codes.join(","), "activate")).data
      : [];
  }
  async report(ctx: Context, skills: Set<string>, preview: boolean) {
    const owners = this.owners(skills);
    const results = [];
    let firstError: BailianError | undefined;
    for (const step of this.steps) {
      const code = "result" in step ? step.result.code : step.code;
      if (!owners.has(code)) continue;
      const item =
        "result" in step
          ? step
          : preview
            ? { result: { ...step, status: "planned" } }
            : await writeServer(ctx, step);
      if ("error" in item) firstError ??= item.error;
      results.push({ ...item.result, skills: owners.get(code) });
    }
    const unknown = [...skills].filter((skill) => this.manifests.get(skill) === undefined);
    const status = firstError
      ? "failed"
      : unknown.length === skills.size
        ? "metadata_unavailable"
        : unknown.length
          ? "partial"
          : preview
            ? "planned"
            : "checked";
    return {
      fields: {
        mcp_dep_results: results,
        mcp_dependency_status: status,
        ...(unknown.length && { mcp_dependency_unknown_skills: unknown }),
      },
      firstError,
    };
  }
}
