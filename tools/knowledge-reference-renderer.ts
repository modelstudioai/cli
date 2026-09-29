import type { FlagDef, LocalizedText } from "../packages/core/src/types/command.ts";
import type { CommandSchema } from "../packages/runtime/src/introspect.ts";

type Locale = "en-US" | "zh-CN";
const text = (value: LocalizedText, locale: Locale) =>
  typeof value === "string" ? value : value[locale];
const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", "<br>");

function codeBlock(value: string): string {
  const longestFence = Math.max(2, ...(value.match(/`+/g) ?? []).map((fence) => fence.length));
  const fence = "`".repeat(longestFence + 1);
  return `${fence}sh\n${value}\n${fence}`;
}

function flagRows(flags: Record<string, FlagDef>, locale: Locale): string[] {
  return Object.entries(flags)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, flag]) => {
      const usage =
        flag.type === "switch"
          ? name
          : `${name} ${flag.choices ? `<${flag.choices.join("|")}>` : flag.valueHint}`;
      const required = flag.type !== "switch" && flag.required ? "yes" : "—";
      return `| ${cell(usage)} | ${flag.type} | ${required} | ${cell(text(flag.description, locale))} |`;
    });
}

/** Render declarative schema only; do not re-read command definitions or infer defaults. */
export function renderKnowledgeReference(schema: CommandSchema, locale: Locale = "en-US"): string {
  const pick = (english: string, chinese: string) => (locale === "en-US" ? english : chinese);
  const lines = [
    `# ${schema.bin} ${pick("command reference", "命令参考")}`,
    "",
    pick(
      "> Generated from the same schema as `--introspect`. Do not edit by hand.",
      "> 与 `--introspect` 使用同一份 schema 自动生成，请勿手动修改。",
    ),
    `> ${pick("Version", "版本")}: ${schema.version}; schema: ${schema.schema_version}.`,
    "",
    pick(
      "Cross-flag constraints are validated at execution and are not exported by this schema.",
      "跨参数约束由执行时校验，不由此 schema 导出。",
    ),
    "",
  ];
  if (schema.bin === "kscli")
    lines.push(
      pick(
        "`config` and `update` are product utility commands, not knowledge-base operations.",
        "`config` 和 `update` 是产品通用命令，不是知识库业务操作。",
      ),
      "",
    );
  for (const command of schema.commands) {
    lines.push(
      `## ${[schema.bin, ...command.path].join(" ")}`,
      "",
      text(command.description, locale),
      "",
      codeBlock(command.usage),
      "",
    );
    lines.push(
      `- ${pick("Authentication", "鉴权")}: ${command.auth}`,
      `- ${pick("Preparation", "预检")}: ${command.preparation}`,
      "",
    );
    if (command.risk) {
      lines.push(
        `**${pick("Risk", "风险")}: ${command.risk.level}${command.risk.reason ? ` (${command.risk.reason})` : ""}**`,
        "",
        text(command.risk.message, locale),
        "",
        pick(
          "Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.",
          "仅在用户已确认本次操作及范围后使用 `--yes`。退出码 7 表示需要确认，不是程序故障。",
        ),
        "",
      );
    }
    if (command.preparation === "read-only")
      lines.push(
        pick(
          "`--dry-run` may authenticate and read remote resources; it makes no resource or checkpoint changes.",
          "`--dry-run` 可能鉴权并读取远端资源，但不会修改资源或恢复记录。",
        ),
        "",
      );
    lines.push(
      `### ${pick("Flags", "选项")}`,
      "",
      pick("| Flag | Type | Required | Description |", "| 选项 | 类型 | 必填 | 说明 |"),
      "| --- | --- | --- | --- |",
      ...flagRows(
        { ...schema.globalFlags, ...schema.credentialFlags[command.auth], ...command.flags },
        locale,
      ),
      "",
    );
    if (command.notes.length)
      lines.push(
        `### ${pick("Notes", "说明")}`,
        "",
        ...command.notes.flatMap((note) => [text(note, locale), ""]),
      );
    if (command.examples.length)
      lines.push(
        `### ${pick("Examples", "示例")}`,
        "",
        ...command.examples.flatMap((example) => [codeBlock(text(example, locale)), ""]),
      );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderKnowledgeReferenceIndex(): string {
  return [
    "# Knowledge CLI references",
    "",
    "> Generated from the same command schema as `--introspect`. Do not edit by hand.",
    "",
    "- [bl knowledge commands](knowledge.md)",
    "- [kscli commands](kscli.md)",
    "",
    "Use the reference for the current product. Paths come from its actual registry; do not substitute prefixes when switching products.",
    "",
    "Inspect the installed version with `bl knowledge --introspect` or `kscli --introspect` before using newly introduced commands.",
    "",
  ].join("\n");
}
