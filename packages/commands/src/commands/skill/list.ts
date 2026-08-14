import {
  defineCommand,
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
  description: {
    "en-US": "List registry skills and diff against local installs",
    "zh-CN": "列出 Registry Skill，并与本地安装结果比较",
  },
  auth: "none",
  exampleArgs: ["", "--output json"],
  notes: [
    {
      "en-US":
        "STATUS: installed | outdated | not-installed | missing (lock has it, dir deleted) | untracked (dir exists, not managed)",
      "zh-CN":
        "STATUS：installed | outdated | not-installed | missing（Lock 中存在但目录已删除）| untracked（目录存在但未被管理）",
    },
  ],
  async run(ctx) {
    const format = ctx.settings.outputExplicit ? ctx.settings.output : "json";
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
      row.publishedAt ? row.publishedAt.slice(0, 19).replace("T", " ") : "-",
      truncate(row.description),
    ]);
    for (const line of formatTable(["NAME", "STATUS", "UPDATEDAT", "DESCRIPTION"], table)) {
      emitBare(line);
    }
  },
});
