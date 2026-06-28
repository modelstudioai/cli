/**
 * Generator: reads the bl product command map (`packages/cli/src/commands.ts`) and writes:
 *   - `skills/bailian-cli/reference/index.md` — quick index, global flags, notes
 *   - `skills/bailian-cli/reference/<group>.md` — per top-level command group details
 *
 * Committed to git; consumed by the `bailian-cli` Agent Skill (`npx skills add modelstudioai/cli`).
 *
 * Run: pnpm --filter bailian-cli run generate:reference
 * (Also run via `pnpm run sync:skill-assets` or the repo pre-commit hook; requires built `bailian-cli-core`.)
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GLOBAL_FLAGS,
  type AnyCommand,
  type FlagDef,
  type FlagsDef,
} from "../packages/core/dist/index.mjs";
import { commands } from "../packages/cli/src/commands.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(__dirname, "../skills/bailian-cli/reference");
const INDEX_PATH = join(REF_DIR, "index.md");

const GENERATED_BANNER =
  "> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.\n" +
  "> Regenerate: `pnpm --filter bailian-cli run generate:reference`.";

function escCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
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
    return `| \`${escCell(flagDisplay(key, def))}\` | ${escCell(flagType(def))} | ${req} | ${escCell(def.description)} |`;
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
  lines.push(`| **Description** | ${escCell(cmd.description)} |`);
  // Commands store argument-only usage; the `bl <path>` prefix is added here.
  const usage = `bl ${path}${cmd.usageArgs ? ` ${cmd.usageArgs}` : ""}`;
  lines.push(`| **Usage** | \`${escCell(usage)}\` |`);
  lines.push("");

  lines.push("#### Flags", "");
  lines.push(formatFlagsTable(cmd.flags));

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
    lines.push(`| \`bl ${path}\` | ${escCell(cmd.description)} |`);
  }

  lines.push("", "## Command details", "");
  for (const [path, cmd] of groupEntries) {
    lines.push(commandSection(path, cmd));
  }

  return lines.join("\n");
}

function buildIndex(
  entries: [string, AnyCommand][],
  groups: Map<string, [string, AnyCommand][]>,
): string {
  const lines: string[] = [
    "# bailian-cli (`bl`) command reference",
    "",
    GENERATED_BANNER,
    "",
    "Command **details** are in sibling `<group>.md` files in this directory.",
    "Use this index for the full quick index and global flags.",
    "",
    "## Quick index",
    "",
    "| Command | Description | Detail |",
    "| --- | --- | --- |",
  ];

  for (const [path, cmd] of entries) {
    const group = topLevel(path);
    lines.push(`| \`bl ${path}\` | ${escCell(cmd.description)} | [${group}.md](${group}.md) |`);
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
    "## Notes",
    "",
    "- Console commands (`app list`, `usage free`, `console call`) require `bl auth login --console`.",
    "- Most API commands use `DASHSCOPE_API_KEY` or `bl auth login --api-key`.",
    "- Default output: **text** in TTY; **json** when piped.",
    "",
  );

  return lines.join("\n");
}

function writeReference(): void {
  const entries = Object.entries(commands).sort(([a], [b]) => a.localeCompare(b));
  const groups = groupByTopLevel(entries);

  mkdirSync(REF_DIR, { recursive: true });

  // Remove stale generated files from previous runs
  for (const name of readdirSync(REF_DIR)) {
    if (name.endsWith(".md")) {
      rmSync(join(REF_DIR, name));
    }
  }

  const groupNames: string[] = [];
  for (const group of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const outPath = join(REF_DIR, `${group}.md`);
    writeFileSync(outPath, buildGroupFile(group, groups.get(group)!), "utf-8");
    groupNames.push(group);
  }

  writeFileSync(INDEX_PATH, buildIndex(entries, groups), "utf-8");

  console.log(
    `Wrote ${INDEX_PATH} + ${groupNames.length} group files (${entries.length} commands)`,
  );
}

writeReference();
