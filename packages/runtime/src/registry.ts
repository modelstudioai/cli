import type {
  AnyCommand,
  AuthRequirement,
  FlagDef,
  FlagsDef,
  LocalizedText,
} from "bailian-cli-core";
import { UsageError } from "bailian-cli-core";
import {
  CONSOLE_AUTH_FLAGS,
  GLOBAL_FLAGS,
  MODEL_AUTH_FLAGS,
  OPENAPI_AUTH_FLAGS,
  credentialFlagDefs,
} from "bailian-cli-core";
import { camelToKebab } from "./args.ts";
import type { Translator } from "./i18n.ts";
import { printQuickStart, printWelcomeBanner } from "./output/banner.ts";
import { ansi } from "./output/color.ts";

export type { Command, AnyCommand, FlagDef, FlagsDef } from "bailian-cli-core";

/** "--max-tokens <count>" for a value flag, "--quiet" for a switch. */
function flagDisplay(key: string, def: FlagDef): string {
  const flag = `--${camelToKebab(key)}`;
  if (def.type === "switch") return flag;
  const hint = def.choices ? `<${def.choices.join("|")}>` : def.valueHint;
  return `${flag} ${hint}`;
}

interface CommandNode {
  command?: AnyCommand;
  children: Map<string, CommandNode>;
}

const HELP_TEXT = {
  usage: { "en-US": "Usage:", "zh-CN": "用法：" },
  commands: { "en-US": "Commands:", "zh-CN": "命令：" },
  flags: { "en-US": "Flags:", "zh-CN": "选项：" },
  globalFlags: { "en-US": "Global Flags:", "zh-CN": "全局选项：" },
  modelAuthFlags: { "en-US": "Model Auth Flags:", "zh-CN": "模型鉴权选项：" },
  modelAuthScope: { "en-US": "(model-domain commands)", "zh-CN": "（模型域命令）" },
  consoleAuthFlags: { "en-US": "Console Auth Flags:", "zh-CN": "控制台鉴权选项：" },
  consoleAuthScope: { "en-US": "(console-domain commands)", "zh-CN": "（控制台域命令）" },
  openApiAuthFlags: { "en-US": "OpenAPI Auth Flags:", "zh-CN": "OpenAPI 鉴权选项：" },
  openApiAuthScope: { "en-US": "(openapi-domain commands)", "zh-CN": "（OpenAPI 域命令）" },
  gettingHelp: { "en-US": "Getting Help:", "zh-CN": "获取帮助：" },
  gettingHelpDescription1: {
    "en-US": "Add --help after any command to see its full list of flags, defaults,",
    "zh-CN": "在任意命令后添加 --help，查看完整的选项和默认值，",
  },
  gettingHelpDescription2: {
    "en-US": "and usage examples. For example:",
    "zh-CN": "以及用法示例。例如：",
  },
  notes: { "en-US": "Notes:", "zh-CN": "说明：" },
  examples: { "en-US": "Examples:", "zh-CN": "示例：" },
  minimalWorkflow: { "en-US": "Minimal workflow.yaml:", "zh-CN": "最小 workflow.yaml：" },
  tryIt: { "en-US": "Try it:", "zh-CN": "试一试：" },
} satisfies Record<string, LocalizedText>;

/**
 * What a command path resolves to in the registry. The single judgement that
 * feeds `resolve()` — no scattered `isGroupPath` + throwing `resolve`.
 *  - leaf:    landed *exactly* on an executable command (no leftover tokens).
 *  - group:   landed on a command group with no executable of its own (incl. root []).
 *  - unknown: the path doesn't exist, or a valid command had unexpected trailing
 *             tokens (no positionals); `error` carries the message + hint.
 */
export type LocateResult =
  | { kind: "leaf"; command: AnyCommand; matched: string[] }
  | { kind: "group"; matched: string[] }
  | { kind: "unknown"; error: UsageError };

export class CommandRegistry {
  private root: CommandNode = { children: new Map() };
  /** Binary name shown in usage/help/error strings (e.g. "bl", "rag"). */
  private readonly cliName: string;
  private readonly translator?: Translator;
  private readonly authRequirements = new Set<AuthRequirement>();

  constructor(commands: Record<string, AnyCommand>, cliName: string, translator?: Translator) {
    this.cliName = cliName;
    this.translator = translator;
    for (const [path, cmd] of Object.entries(commands)) {
      this.register(path, cmd);
    }
  }

  private localize(text: LocalizedText): string {
    return this.translator?.localize(text) ?? (typeof text === "string" ? text : text["en-US"]);
  }

  private register(path: string, command: AnyCommand): void {
    // 同名守卫:命令自有 flag 不得与全局或其可见凭证域 flag 同名。
    const reserved = { ...GLOBAL_FLAGS, ...credentialFlagDefs(command) };
    for (const key of Object.keys(command.flags ?? {})) {
      if (key in reserved) {
        throw new Error(`Command "${path}" redeclares reserved flag "${key}".`);
      }
    }
    const parts = path.split(" ");
    let node = this.root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map() });
      }
      node = node.children.get(part)!;
    }
    node.command = command;
    this.authRequirements.add(command.auth);
  }

  getAllCommands(): AnyCommand[] {
    const commands: AnyCommand[] = [];
    const traverse = (node: CommandNode) => {
      if (node.command) commands.push(node.command);
      for (const child of node.children.values()) {
        traverse(child);
      }
    };
    traverse(this.root);
    return commands;
  }

  /** First registered command path, for the "Getting Help" example (e.g. "knowledge retrieve"). */
  private helpExample(): string {
    const walk = (node: CommandNode, path: string[]): string | null => {
      for (const [name, child] of node.children) {
        if (child.command) return [...path, name].join(" ");
        const deeper = walk(child, [...path, name]);
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(this.root, []) ?? "<resource> <command>";
  }

  /**
   * Resolve a command path to a leaf / group / unknown outcome. Pure: walks the
   * trie taking the longest registered prefix as the command. There are no
   * positionals, so a valid command followed by leftover tokens is `unknown`
   * (unexpected argument). Never throws — unknown paths return a carried UsageError.
   */
  locate(commandPath: string[]): LocateResult {
    let node = this.root;
    const matched: string[] = [];

    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) break;
      node = child;
      matched.push(part);
    }

    if (node.command) {
      const leftover = commandPath.slice(matched.length);
      if (leftover.length === 0) {
        return { kind: "leaf", command: node.command, matched };
      }
      return {
        kind: "unknown",
        error: new UsageError(
          `Unexpected argument: ${leftover.join(" ")}`,
          `${this.cliName} ${matched.join(" ")} --help`,
        ),
      };
    }

    if (matched.length === commandPath.length && node.children.size > 0) {
      return { kind: "group", matched };
    }

    if (matched.length > 0 && node.children.size > 0) {
      const subcommands = Array.from(node.children.entries())
        .map(([name, n]) => {
          if (n.command)
            return `  ${matched.join(" ")} ${name}    ${this.localize(n.command.description)}`;
          const subs = Array.from(n.children.keys()).join(", ");
          return `  ${matched.join(" ")} ${name} [${subs}]`;
        })
        .join("\n");
      return {
        kind: "unknown",
        error: new UsageError(
          `Unknown command: ${this.cliName} ${commandPath.join(" ")}\n\nAvailable commands:\n${subcommands}`,
          `${this.cliName} ${matched.join(" ")} --help`,
        ),
      };
    }

    return {
      kind: "unknown",
      error: new UsageError(
        `Unknown command: ${this.cliName} ${commandPath.join(" ")}`,
        `${this.cliName} --help`,
      ),
    };
  }

  private buildResourceLines(a: (s: string) => string, d: (s: string) => string): string {
    const entries: Array<{ path: string; desc: string }> = [];

    const collect = (node: CommandNode, prefix: string) => {
      for (const [name, child] of node.children) {
        const fullPath = prefix ? `${prefix} ${name}` : name;
        if (child.command) {
          entries.push({ path: fullPath, desc: this.localize(child.command.description) });
        }
        if (child.children.size > 0) {
          collect(child, fullPath);
        }
      }
    };
    collect(this.root, "");

    const maxLen = Math.max(...entries.map((e) => e.path.length));
    return entries.map((e) => `  ${a(e.path.padEnd(maxLen + 2))} ${d(e.desc)}`).join("\n");
  }

  private buildFlagLines(
    defs: FlagsDef,
    a: (s: string) => string,
    d: (s: string) => string,
  ): string {
    const lines = Object.entries(defs).map(([k, def]) => ({
      flag: flagDisplay(k, def),
      desc: this.localize(def.description),
    }));
    const maxLen = Math.max(...lines.map((l) => l.flag.length));
    return lines.map((l) => `  ${a(l.flag.padEnd(maxLen + 2))} ${d(l.desc)}`).join("\n");
  }

  private buildAuthFlagSection(
    auth: AuthRequirement,
    label: string,
    scope: string,
    defs: FlagsDef,
    b: (s: string) => string,
    a: (s: string) => string,
    d: (s: string) => string,
  ): string | null {
    if (!this.authRequirements.has(auth)) return null;
    return `${b(label)} ${d(scope)}\n${this.buildFlagLines(defs, a, d)}`;
  }

  // Color helpers — no-ops when output is not a TTY.
  private bold = (s: string, out: NodeJS.WriteStream) => ansi(out).bold(s);
  private accent = (s: string, out: NodeJS.WriteStream) => ansi(out).accent(s);
  private dim = (s: string, out: NodeJS.WriteStream) => ansi(out).dim(s);

  printHelp(commandPath: string[], out: NodeJS.WriteStream = process.stdout): void {
    if (commandPath.length === 0) {
      this.printRootHelp(out);
      return;
    }

    let node = this.root;
    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) {
        this.printRootHelp(out);
        return;
      }
      node = child;
    }

    if (node.command) {
      this.printCommandHelp(node.command, commandPath, out);
      return;
    }

    // Group help (e.g. `bl auth --help`)
    const prefix = commandPath.join(" ");
    out.write(
      `\n${this.bold(this.localize(HELP_TEXT.usage), out)} ${this.cliName} ${prefix} <command> [flags]\n\n`,
    );
    out.write(`${this.bold(this.localize(HELP_TEXT.commands), out)}\n`);
    this.printChildren(node, prefix, out);
    if (prefix === "pipeline") {
      this.printPipelineQuickStart(out);
    }
    out.write("\n");
  }

  printWelcome(): void {
    printWelcomeBanner(this.cliName, this.translator);
  }

  printQuickStart(tasks: readonly string[]): void {
    printQuickStart(tasks, this.translator?.language);
  }

  private printPipelineQuickStart(out: NodeJS.WriteStream): void {
    const b = (s: string) => this.bold(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`
${b(this.localize(HELP_TEXT.minimalWorkflow))}
${d("  version: workflow/v1")}
${d("  steps:")}
${d("    - id: chat")}
${d("      type: text/chat")}
${d("      input:")}
${d('        message: "Who are you?"')}
${d('        system: "You are a concise assistant."')}

${b(this.localize(HELP_TEXT.tryIt))}
${d(`  ${this.cliName} pipeline validate workflow.yaml`)}
${d(`  ${this.cliName} pipeline run workflow.yaml --dry-run --output json`)}
`);
  }

  private printRootHelp(out: NodeJS.WriteStream): void {
    // Bailian brand color: #615ced → RGB(97, 92, 237)
    const LOGO = [
      "██████╗  █████╗ ██╗██╗     ██╗ █████╗ ███╗   ██╗",
      "██╔══██╗██╔══██╗██║██║     ██║██╔══██╗████╗  ██║",
      "██████╔╝███████║██║██║     ██║███████║██╔██╗ ██║",
      "██╔══██╗██╔══██║██║██║     ██║██╔══██║██║╚██╗██║",
      "██████╔╝██║  ██║██║███████╗██║██║  ██║██║ ╚████║",
      "╚═════╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝",
    ];
    const color = ansi(out);

    out.write("\n");
    for (const line of LOGO) {
      out.write(`${color.logo(line)}\n`);
    }

    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    const commandLines = this.buildResourceLines(a, d);
    const globalFlagLines = this.buildFlagLines(GLOBAL_FLAGS, a, d);
    const authFlagSections = [
      this.buildAuthFlagSection(
        "apiKey",
        this.localize(HELP_TEXT.modelAuthFlags),
        this.localize(HELP_TEXT.modelAuthScope),
        MODEL_AUTH_FLAGS,
        b,
        a,
        d,
      ),
      this.buildAuthFlagSection(
        "console",
        this.localize(HELP_TEXT.consoleAuthFlags),
        this.localize(HELP_TEXT.consoleAuthScope),
        CONSOLE_AUTH_FLAGS,
        b,
        a,
        d,
      ),
      this.buildAuthFlagSection(
        "openapi",
        this.localize(HELP_TEXT.openApiAuthFlags),
        this.localize(HELP_TEXT.openApiAuthScope),
        OPENAPI_AUTH_FLAGS,
        b,
        a,
        d,
      ),
    ]
      .filter((section): section is string => section !== null)
      .join("\n\n");

    out.write(`
${b(this.localize(HELP_TEXT.usage))} ${this.cliName} <resource> <command> [flags]

${b(this.localize(HELP_TEXT.commands))}
${commandLines}

${b(this.localize(HELP_TEXT.globalFlags))}
${globalFlagLines}

${authFlagSections ? `${authFlagSections}\n\n` : ""}${b(this.localize(HELP_TEXT.gettingHelp))}
  ${d(this.localize(HELP_TEXT.gettingHelpDescription1))}
  ${d(this.localize(HELP_TEXT.gettingHelpDescription2))} ${this.cliName} ${this.helpExample()} --help
`);
  }

  private printCommandHelp(cmd: AnyCommand, commandPath: string[], out: NodeJS.WriteStream): void {
    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    // `<bin> <path>` prefix is rendered here, not stored in the command, so the
    // same command shows the right invocation under any product (bl / rag / …).
    const prefix = [this.cliName, ...commandPath].join(" ");

    out.write(`\n${this.localize(cmd.description)}\n`);
    out.write(
      `${b(this.localize(HELP_TEXT.usage))} ${prefix}${cmd.usageArgs ? ` ${cmd.usageArgs}` : ""}\n`,
    );
    const ownFlagEntries = Object.entries(cmd.flags ?? {}) as [string, FlagDef][];
    const credentialFlagEntries = Object.entries(credentialFlagDefs(cmd)) as [string, FlagDef][];
    const flagEntries = [...ownFlagEntries, ...credentialFlagEntries];
    if (flagEntries.length > 0) {
      const lines = flagEntries.map(([key, def]) => ({
        flag: flagDisplay(key, def),
        desc: this.localize(def.description),
      }));
      const maxLen = Math.max(...lines.map((l) => l.flag.length));
      out.write(`\n${b(this.localize(HELP_TEXT.flags))}\n`);
      for (const l of lines) {
        out.write(`  ${a(l.flag.padEnd(maxLen + 2))} ${d(l.desc)}\n`);
      }
    }
    out.write(`\n${b(this.localize(HELP_TEXT.globalFlags))}\n`);
    out.write(this.buildFlagLines(GLOBAL_FLAGS, a, d) + "\n");
    if (cmd.notes && cmd.notes.length > 0) {
      out.write(`\n${b(this.localize(HELP_TEXT.notes))}\n`);
      for (const note of cmd.notes) {
        out.write(`  ${this.localize(note)}\n`);
      }
    }
    if (cmd.exampleArgs && cmd.exampleArgs.length > 0) {
      out.write(`\n${b(this.localize(HELP_TEXT.examples))}\n`);
      for (const example of cmd.exampleArgs) {
        const localizedExample = this.localize(example);
        const line = localizedExample.startsWith("#")
          ? localizedExample
          : localizedExample
            ? `${prefix} ${localizedExample}`
            : prefix;
        out.write(`  ${d(line)}\n`);
      }
    }
  }

  private printChildren(node: CommandNode, prefix: string, out: NodeJS.WriteStream): void {
    const entries: Array<{ fullName: string; description: string }> = [];
    const collect = (n: CommandNode, p: string) => {
      for (const [name, child] of n.children) {
        if (child.command)
          entries.push({
            fullName: `${p} ${name}`,
            description: this.localize(child.command.description),
          });
        if (child.children.size > 0) collect(child, `${p} ${name}`);
      }
    };
    collect(node, prefix);
    const maxLen = Math.max(...entries.map((e) => e.fullName.length));
    for (const { fullName, description } of entries) {
      out.write(`  ${this.accent(fullName.padEnd(maxLen), out)}  ${this.dim(description, out)}\n`);
    }
  }
}
