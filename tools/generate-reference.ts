/**
 * Generator: reads the bl product command map (`packages/cli/src/commands.ts`) and writes
 * per-skill reference trees:
 *   - `skills/<skill>/reference/index.md` — skill-scoped quick index + global flags
 *   - `skills/<skill>/reference/<group>.md` — per top-level command group details
 *
 * Ownership of each top-level command group is declared in `GROUP_OWNER_SKILL` below.
 * Unmapped groups fall back to `bailian-cli` (hub) so new commands never block generation.
 *
 * Committed to git; consumed by bailian-* Agent Skills (`npx skills add modelstudioai/cli`).
 *
 * Run: pnpm --filter bailian-cli run generate:reference
 * Also run via `pnpm run sync:skill-assets` or the repo pre-commit hook.
 * Uses tsx and reads workspace packages from source
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSOLE_AUTH_FLAGS,
  GLOBAL_FLAGS,
  MODEL_AUTH_FLAGS,
  OPENAPI_AUTH_FLAGS,
  credentialFlagDefs,
  type AnyCommand,
  type FlagDef,
  type FlagsDef,
  type LocalizedText,
} from "../packages/core/src/index.ts";
import { commands } from "../packages/cli/src/commands.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../skills");

/** Default owner when a top-level group is not listed in GROUP_OWNER_SKILL. */
const DEFAULT_OWNER_SKILL = "bailian-cli";

/**
 * Top-level command group → owning skill.
 * When adding a new top-level `bl <group>`, either add it here or accept the hub fallback.
 */
const GROUP_OWNER_SKILL: Readonly<Record<string, string>> = {
  // bailian-gen — media generation / A/V understanding
  image: "bailian-gen",
  video: "bailian-gen",
  speech: "bailian-gen",
  omni: "bailian-gen",
  vision: "bailian-gen",
  // bailian-finetune — training pipeline
  dataset: "bailian-finetune",
  finetune: "bailian-finetune",
  deploy: "bailian-finetune",
  // bailian-managed-agent — agents.yaml IaC
  "managed-agent": "bailian-managed-agent",
  // everything else → bailian-cli (hub)
};

const GENERATED_BANNER =
  "> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.\n" +
  "> Regenerate: `pnpm --filter bailian-cli run generate:reference`.";

function escCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

/** Skill references are English artifacts; localized CLI text keeps English here. */
function referenceText(text: LocalizedText): string {
  return typeof text === "string" ? text : text["en-US"];
}

function topLevel(path: string): string {
  return path.split(" ")[0]!;
}

/** maxTokens → max-tokens. Flags are keyed by camelCase flag name. */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** "--max-tokens <count>" for a value flag, "--quiet" for a switch. */
function flagDisplay(key: string, def: FlagDef): string {
  const flag = `--${camelToKebab(key)}`;
  if (def.type === "switch") return flag;
  const hint = def.choices ? `<${def.choices.join("|")}>` : def.valueHint;
  return `${flag} ${hint}`;
}

function flagType(def: FlagDef): string {
  return def.type;
}

function formatFlagsTable(flags: FlagsDef | undefined): string {
  const entries = Object.entries(flags ?? {});
  if (!entries.length) return "_No command-specific flags._\n";
  const rows = entries.map(([key, def]) => {
    const req = def.type !== "switch" && def.required ? "yes" : "no";
    return `| \`${escCell(flagDisplay(key, def))}\` | ${escCell(flagType(def))} | ${req} | ${escCell(referenceText(def.description))} |`;
  });
  return [
    "| Flag | Type | Required | Description |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function formatExamples(path: string, exampleArgs: string[] | undefined): string {
  if (!exampleArgs?.length) return "_No examples._\n";
  // Commands store argument-only examples; prepend `bl <path>` for the reference.
  return (
    exampleArgs
      .map((ex) => ["```bash", `bl ${path}${ex ? ` ${ex}` : ""}`, "```"].join("\n"))
      .join("\n\n") + "\n"
  );
}

function formatNotes(notes: string[] | undefined): string {
  if (!notes?.length) return "";
  return notes.map((n) => `- ${n}`).join("\n") + "\n";
}

function commandSection(path: string, cmd: AnyCommand): string {
  const lines: string[] = [];
  lines.push(`### \`bl ${path}\``, "");
  lines.push(`| Field | Value |`, `| --- | --- |`);
  lines.push(`| **Name** | \`${escCell(path)}\` |`);
  lines.push(`| **Description** | ${escCell(referenceText(cmd.description))} |`);
  // Commands store argument-only usage; the `bl <path>` prefix is added here.
  const usage = `bl ${path}${cmd.usageArgs ? ` ${cmd.usageArgs}` : ""}`;
  lines.push(`| **Usage** | \`${escCell(usage)}\` |`);
  lines.push("");

  // 与命令 help 的 Flags 区一致:自有 + 该命令可见的凭证域 flag。
  lines.push("#### Flags", "");
  lines.push(formatFlagsTable({ ...cmd.flags, ...credentialFlagDefs(cmd) }));

  if (cmd.notes?.length) {
    lines.push("#### Notes", "");
    lines.push(formatNotes(cmd.notes));
  }

  lines.push("#### Examples", "");
  lines.push(formatExamples(path, cmd.exampleArgs));

  return lines.join("\n");
}

function groupByTopLevel(entries: [string, AnyCommand][]): Map<string, [string, AnyCommand][]> {
  const groups = new Map<string, [string, AnyCommand][]>();
  for (const entry of entries) {
    const key = topLevel(entry[0]);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort(([a], [b]) => a.localeCompare(b));
  }
  return groups;
}

function ownerSkillForGroup(group: string): string {
  return GROUP_OWNER_SKILL[group] ?? DEFAULT_OWNER_SKILL;
}

function buildGroupFile(group: string, groupEntries: [string, AnyCommand][]): string {
  const lines: string[] = [
    `# \`bl ${group}\` commands`,
    "",
    GENERATED_BANNER,
    "",
    `Index: [index.md](index.md)`,
    "",
    "## Commands in this group",
    "",
    "| Command | Description |",
    "| --- | --- |",
  ];

  for (const [path, cmd] of groupEntries) {
    lines.push(`| \`bl ${path}\` | ${escCell(referenceText(cmd.description))} |`);
  }

  lines.push("", "## Command details", "");
  for (const [path, cmd] of groupEntries) {
    lines.push(commandSection(path, cmd));
  }

  return lines.join("\n");
}

function buildIndex(
  skillName: string,
  entries: [string, AnyCommand][],
  groups: Map<string, [string, AnyCommand][]>,
): string {
  const lines: string[] = [
    `# \`${skillName}\` command reference`,
    "",
    GENERATED_BANNER,
    "",
    "Command **details** are in sibling `<group>.md` files in this directory.",
    "This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-* skills.",
    "Use this index for the skill-scoped quick index and global flags.",
    "",
    "## Quick index",
    "",
    "| Command | Description | Detail |",
    "| --- | --- | --- |",
  ];

  for (const [path, cmd] of entries) {
    const group = topLevel(path);
    lines.push(
      `| \`bl ${path}\` | ${escCell(referenceText(cmd.description))} | [${group}.md](${group}.md) |`,
    );
  }

  lines.push("", "## By group", "", "| Group | Commands | Reference |", "| --- | --- | --- |");

  const sortedGroups = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const group of sortedGroups) {
    const groupEntries = groups.get(group)!;
    const names = groupEntries.map(([path]) => path.slice(group.length).trim() || "(root)");
    lines.push(
      `| \`${group}\` | ${names.map((n) => `\`${n}\``).join(", ")} | [${group}.md](${group}.md) |`,
    );
  }

  lines.push(
    "",
    "## Global flags",
    "",
    "Available on every command (in addition to command-specific flags):",
    "",
    formatFlagsTable(GLOBAL_FLAGS),
    "",
    "## Model auth flags",
    "",
    "Available on model-domain commands (API-key auth); also listed per command below:",
    "",
    formatFlagsTable(MODEL_AUTH_FLAGS),
    "",
    "## Console auth flags",
    "",
    "Available on console-domain commands (console login auth); also listed per command below:",
    "",
    formatFlagsTable(CONSOLE_AUTH_FLAGS),
    "",
    "## OpenAPI auth flags",
    "",
    "Available on OpenAPI-domain commands (AK/SK auth); also listed per command below:",
    "",
    formatFlagsTable(OPENAPI_AUTH_FLAGS),
    "",
    "## Notes",
    "",
    "- Console commands (`app list`, `usage free`, `console call`) require `bl auth login --console`.",
    "- Most API commands use `DASHSCOPE_API_KEY` or `bl auth login --api-key`.",
    "- Token Plan commands use OpenAPI AK/SK via `bl auth login --open-api` or `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`.",
    "- Default output: **text** unless explicitly set to `json` with `--output`, `DASHSCOPE_OUTPUT`, or config.",
    "",
  );

  return lines.join("\n");
}

function clearGeneratedMarkdown(refDir: string): void {
  if (!existsSync(refDir)) return;
  for (const name of readdirSync(refDir)) {
    if (name.endsWith(".md")) {
      rmSync(join(refDir, name));
    }
  }
}

function writeSkillReference(
  skillName: string,
  skillGroups: Map<string, [string, AnyCommand][]>,
): { groupCount: number; commandCount: number } {
  const refDir = join(SKILLS_DIR, skillName, "reference");
  mkdirSync(refDir, { recursive: true });
  clearGeneratedMarkdown(refDir);

  const entries: [string, AnyCommand][] = [];
  for (const group of [...skillGroups.keys()].sort((a, b) => a.localeCompare(b))) {
    const groupEntries = skillGroups.get(group)!;
    entries.push(...groupEntries);
    writeFileSync(join(refDir, `${group}.md`), buildGroupFile(group, groupEntries), "utf-8");
  }
  entries.sort(([a], [b]) => a.localeCompare(b));

  writeFileSync(join(refDir, "index.md"), buildIndex(skillName, entries, skillGroups), "utf-8");

  return { groupCount: skillGroups.size, commandCount: entries.length };
}

function writeReference(): void {
  const entries = Object.entries(commands).sort(([a], [b]) => a.localeCompare(b));
  const groups = groupByTopLevel(entries);

  // skillName → (group → entries)
  const bySkill = new Map<string, Map<string, [string, AnyCommand][]>>();

  for (const [group, groupEntries] of groups) {
    const skillName = ownerSkillForGroup(group);
    const skillMap = bySkill.get(skillName) ?? new Map<string, [string, AnyCommand][]>();
    skillMap.set(group, groupEntries);
    bySkill.set(skillName, skillMap);
  }

  // Clear reference dirs for known owner skills that ended up empty (should not happen,
  // but keeps stale files from previous ownership maps from lingering).
  const knownSkills = new Set<string>([
    DEFAULT_OWNER_SKILL,
    ...Object.values(GROUP_OWNER_SKILL),
    ...bySkill.keys(),
  ]);
  for (const skillName of knownSkills) {
    if (!bySkill.has(skillName)) {
      clearGeneratedMarkdown(join(SKILLS_DIR, skillName, "reference"));
    }
  }

  const summaries: string[] = [];
  for (const skillName of [...bySkill.keys()].sort((a, b) => a.localeCompare(b))) {
    const result = writeSkillReference(skillName, bySkill.get(skillName)!);
    summaries.push(`${skillName}: ${result.groupCount} groups / ${result.commandCount} commands`);
  }

  console.log(`Wrote skill references:\n  - ${summaries.join("\n  - ")}`);
}

writeReference();
