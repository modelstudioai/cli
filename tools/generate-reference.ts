/**
 * Generator: reads `packages/cli/src/commands/catalog.ts` and writes:
 *   - `tools/generated/reference/index.md` — quick index, global flags, notes
 *   - `tools/generated/reference/<group>.md` — per top-level command group details
 *
 * Output is temporary — the new skill install mechanism (`npx add skills`) will
 * consume these files from a yet-to-be-decided location.
 *
 * Run: pnpm --filter bailian-cli run generate:reference
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCS_HOSTS,
  GLOBAL_OPTIONS,
  type Command,
  type OptionDef,
} from "../packages/core/dist/index.mjs";
import { commands } from "../packages/cli/src/commands/catalog.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(__dirname, "generated/reference");
const INDEX_PATH = join(REF_DIR, "index.md");

const GENERATED_BANNER =
  "> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.\n" +
  "> Regenerate: `pnpm --filter bailian-cli run generate:reference`.";

function escCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function topLevel(path: string): string {
  return path.split(" ")[0]!;
}

function optionType(opt: OptionDef): string {
  if (opt.type) return opt.type;
  if (!opt.flag.includes("<") && !opt.flag.includes("[")) return "boolean";
  return "string";
}

function formatOptionsTable(options: OptionDef[] | undefined): string {
  if (!options?.length) return "_No command-specific options._\n";
  const rows = options.map((o) => {
    const req = o.required ? "yes" : "no";
    return `| \`${escCell(o.flag)}\` | ${escCell(optionType(o))} | ${req} | ${escCell(o.description)} |`;
  });
  return [
    "| Flag | Type | Required | Description |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function formatExamples(examples: string[] | undefined): string {
  if (!examples?.length) return "_No examples._\n";
  return examples.map((ex) => ["```bash", ex, "```"].join("\n")).join("\n\n") + "\n";
}

function commandSection(path: string, cmd: Command): string {
  const lines: string[] = [];
  lines.push(`### \`bl ${path}\``, "");
  lines.push(`| Field | Value |`, `| --- | --- |`);
  lines.push(`| **Name** | \`${escCell(cmd.name)}\` |`);
  lines.push(`| **Description** | ${escCell(cmd.description)} |`);
  if (cmd.usage) {
    lines.push(`| **Usage** | \`${escCell(cmd.usage)}\` |`);
  }
  if (cmd.apiDocs) {
    const url = `${DOCS_HOSTS.cn}${cmd.apiDocs}`;
    lines.push(`| **API docs** | [${escCell(cmd.apiDocs)}](${url}) |`);
  }
  lines.push("");

  lines.push("#### Options", "");
  lines.push(formatOptionsTable(cmd.options));

  lines.push("#### Examples", "");
  lines.push(formatExamples(cmd.examples));

  return lines.join("\n");
}

function groupByTopLevel(entries: [string, Command][]): Map<string, [string, Command][]> {
  const groups = new Map<string, [string, Command][]>();
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

function buildGroupFile(group: string, groupEntries: [string, Command][]): string {
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
  entries: [string, Command][],
  groups: Map<string, [string, Command][]>,
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
    "Available on every command (in addition to command-specific options):",
    "",
    formatOptionsTable(GLOBAL_OPTIONS),
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
