import {
  defineCommand,
  detectOutputFormat,
  computeSkillStatuses,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  listSkillDirsOnDisk,
  readSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";

const DESCRIPTION_MAX = 60;

function truncate(text: string | undefined): string {
  if (!text) return "-";
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX - 1)}…` : text;
}

export default defineCommand({
  description: "List registry skills and diff against local installs",
  auth: "none",
  exampleArgs: ["", "--output json"],
  notes: [
    "STATUS: installed | outdated | not-installed | missing (lock has it, dir deleted) | untracked (dir exists, not managed)",
  ],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    // Three-way reconciliation: live remote index × skill-lock.json (installation facts) × disk
    const index = await fetchSkillsIndex();
    const lock = readSkillLock();
    const rows = computeSkillStatuses(index, lock, listSkillDirsOnDisk());

    if (format === "json") {
      emitResult(
        {
          registry: getSkillRegistryBaseUrl(),
          ...(index.updatedAt ? { updatedAt: index.updatedAt } : {}),
          skills: rows,
        },
        format,
      );
      return;
    }
    if (rows.length === 0) {
      emitBare("Skill registry is empty and no skills are installed locally.");
      return;
    }
    const table = rows.map((row) => [
      row.name,
      row.status,
      row.publishedAt ? row.publishedAt.slice(0, 10) : "-",
      truncate(row.description),
    ]);
    for (const line of formatTable(["NAME", "STATUS", "UpdatedAt", "DESCRIPTION"], table)) {
      emitBare(line);
    }
  },
});
