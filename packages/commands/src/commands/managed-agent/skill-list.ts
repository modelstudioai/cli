import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { listSkills } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const SKILL_SOURCES = ["custom", "official", "all"] as const;
type SkillSource = (typeof SKILL_SOURCES)[number];

const SKILL_LIST_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  source: {
    type: "string",
    valueHint: "<source>",
    description:
      "Skill catalog: custom (workspace-uploaded, default), official (built-in), or all (both catalogs in one call)",
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Target provider",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List skills from the provider's skill catalog",
  auth: "apiKey",
  // Provider-aware gate: only the resolved catalog provider needs credentials.
  authOptional: true,
  usageArgs: "[--source custom|official|all] [--provider <name>] [--file <path>]",
  flags: SKILL_LIST_FLAGS,
  exampleArgs: [
    "",
    "--source official",
    "--source all --output json",
    "--source custom --provider bailian",
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    "Providers without a skill listing API (e.g. ark) return an empty list.",
    "For agent-driven skill selection, use `--source all --output json`: one call returns both catalogs with per-skill `source` and `description` fields to pick from.",
    "When generating a task that needs a suitable skill, call this command to match official or custom skills before wiring them into the task.",
  ],
  validate: (f) =>
    f.source && !SKILL_SOURCES.includes(f.source as SkillSource)
      ? "--source must be one of: custom, official, all."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const source = (flags.source as SkillSource | undefined) ?? "custom";

    const skills = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: flags.provider ?? "targets",
        });
        if (source !== "all") {
          return listSkills(runtime, { provider: flags.provider, source });
        }
        // Both catalogs in one call; each entry carries its own `source` field.
        const [customSkills, officialSkills] = await Promise.all([
          listSkills(runtime, { provider: flags.provider, source: "custom" }),
          listSkills(runtime, { provider: flags.provider, source: "official" }),
        ]);
        return [...customSkills, ...officialSkills];
      }),
    );

    if (format === "json") {
      emitResult({ source, skills }, format);
      return;
    }
    if (skills.length === 0) {
      emitBare(source === "all" ? "No skills found." : `No ${source} skills found.`);
      return;
    }

    const headers = ["ID", "NAME", "SOURCE", "STATUS", "VERSION", "CREATED"];
    const rows = skills.map((skill) => [
      skill.id,
      skill.name.slice(0, 32),
      skill.source,
      skill.status,
      skill.latest_version ?? "-",
      skill.created_at ?? "-",
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    emitBare(`\nTotal: ${skills.length} (${source})`);
  },
});
