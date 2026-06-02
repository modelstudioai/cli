import type { Command } from "bailian-cli-core";
import { BailianError } from "bailian-cli-core";
import { ExitCode } from "bailian-cli-core";
import { DOCS_HOSTS, GLOBAL_OPTIONS, type Region } from "bailian-cli-core";

export type { Command, OptionDef } from "bailian-cli-core";

interface CommandNode {
  command?: Command;
  children: Map<string, CommandNode>;
}

export class CommandRegistry {
  private root: CommandNode = { children: new Map() };

  constructor(commands: Record<string, Command>) {
    for (const [path, cmd] of Object.entries(commands)) {
      this.register(path, cmd);
    }
  }

  private register(path: string, command: Command): void {
    const parts = path.split(" ");
    let node = this.root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map() });
      }
      node = node.children.get(part)!;
    }
    node.command = command;
  }

  getAllCommands(): Command[] {
    const commands: Command[] = [];
    const traverse = (node: CommandNode) => {
      if (node.command) commands.push(node.command);
      for (const child of node.children.values()) {
        traverse(child);
      }
    };
    traverse(this.root);
    return commands;
  }

  isGroupPath(commandPath: string[]): boolean {
    let node = this.root;
    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) return false;
      node = child;
    }
    return !node.command && node.children.size > 0;
  }

  resolve(commandPath: string[]): { command: Command; extra: string[] } {
    let node = this.root;
    const matched: string[] = [];

    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) break;
      node = child;
      matched.push(part);
    }

    if (node.command) {
      return { command: node.command, extra: commandPath.slice(matched.length) };
    }

    // Single child: auto-forward (e.g. `bl config` → `bl config show`)
    if (matched.length > 0 && node.children.size === 1) {
      const [, child] = node.children.entries().next().value as [string, CommandNode];
      if (child.command) {
        return { command: child.command, extra: commandPath.slice(matched.length) };
      }
    }

    // If we matched some path but no command, show help for that group
    if (matched.length > 0 && node.children.size > 0) {
      const subcommands = Array.from(node.children.entries())
        .map(([name, n]) => {
          if (n.command) return `  ${matched.join(" ")} ${name}    ${n.command.description}`;
          const subs = Array.from(n.children.keys()).join(", ");
          return `  ${matched.join(" ")} ${name} [${subs}]`;
        })
        .join("\n");
      throw new BailianError(
        `Unknown command: bl ${commandPath.join(" ")}\n\nAvailable commands:\n${subcommands}`,
        ExitCode.USAGE,
        `bl ${matched.join(" ")} --help`,
      );
    }

    throw new BailianError(
      `Unknown command: bl ${commandPath.join(" ")}`,
      ExitCode.USAGE,
      "bl --help",
    );
  }

  private buildResourceLines(a: (s: string) => string, d: (s: string) => string): string {
    const entries: Array<{ path: string; desc: string }> = [];

    const collect = (node: CommandNode, prefix: string) => {
      for (const [name, child] of node.children) {
        const fullPath = prefix ? `${prefix} ${name}` : name;
        if (child.command) {
          entries.push({ path: fullPath, desc: child.command.description });
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

  private buildGlobalFlagLines(a: (s: string) => string, d: (s: string) => string): string {
    const maxLen = Math.max(...GLOBAL_OPTIONS.map((o) => o.flag.length));
    return GLOBAL_OPTIONS.map((o) => `  ${a(o.flag.padEnd(maxLen + 2))} ${d(o.description)}`).join(
      "\n",
    );
  }

  // Color helpers — no-ops when output is not a TTY
  private bold = (s: string, out: NodeJS.WriteStream) => (out.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
  private accent = (s: string, out: NodeJS.WriteStream) =>
    out.isTTY ? `\x1b[38;2;59;130;246m${s}\x1b[0m` : s;
  private dim = (s: string, out: NodeJS.WriteStream) => (out.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

  printHelp(
    commandPath: string[],
    out: NodeJS.WriteStream = process.stdout,
    region: Region = "cn",
  ): void {
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
      this.printCommandHelp(node.command, out, region);
      return;
    }

    // Group help (e.g. `bl auth --help`)
    const prefix = commandPath.join(" ");
    out.write(`\n${this.bold("Usage:", out)} bl ${prefix} <command> [flags]\n\n`);
    out.write(`${this.bold("Commands:", out)}\n`);
    this.printChildren(node, prefix, out);
    if (prefix === "pipeline") {
      this.printPipelineQuickStart(out);
    }
    out.write("\n");
  }

  private printPipelineQuickStart(out: NodeJS.WriteStream): void {
    const b = (s: string) => this.bold(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`
${b("Minimal workflow.yaml:")}
${d("  version: workflow/v1")}
${d("  steps:")}
${d("    - id: chat")}
${d("      type: text/chat")}
${d("      input:")}
${d('        message: "Who are you?"')}
${d('        system: "You are a concise assistant."')}

${b("Try it:")}
${d("  bl pipeline validate workflow.yaml")}
${d("  bl pipeline run workflow.yaml --dry-run --output json")}
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
    const PURPLE = "\x1b[38;2;97;92;237m";
    const RESET = "\x1b[0m";

    out.write("\n");
    for (const line of LOGO) {
      if (out.isTTY) {
        out.write(`${PURPLE}${line}${RESET}\n`);
      } else {
        out.write(line + "\n");
      }
    }

    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    const commandLines = this.buildResourceLines(a, d);
    const globalFlagLines = this.buildGlobalFlagLines(a, d);

    out.write(`
${b("Usage:")} bl <resource> <command> [flags]

${b("Commands:")}
${commandLines}

${b("Global Flags:")}
${globalFlagLines}

${b("Getting Help:")}
  ${d("Add --help after any command to see its full list of options, defaults,")}
  ${d("and usage examples. For example:")} bl text chat --help
`);
  }

  private printCommandHelp(cmd: Command, out: NodeJS.WriteStream, region: Region = "cn"): void {
    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`\n${cmd.description}\n`);
    if (cmd.usage) out.write(`${b("Usage:")} ${cmd.usage}\n`);
    if (cmd.options && cmd.options.length > 0) {
      const maxLen = Math.max(...cmd.options.map((o) => o.flag.length));
      out.write(`\n${b("Options:")}\n`);
      for (const opt of cmd.options) {
        out.write(`  ${a(opt.flag.padEnd(maxLen + 2))} ${d(opt.description)}\n`);
      }
    }
    if (cmd.examples && cmd.examples.length > 0) {
      out.write(`\n${b("Examples:")}\n`);
      for (const ex of cmd.examples) {
        out.write(`  ${d(ex)}\n`);
      }
    }
    if (cmd.apiDocs) {
      out.write(`\n${b("API Reference:")} ${d(DOCS_HOSTS[region] + cmd.apiDocs)}\n`);
    }
    out.write(
      `\n${d("Global flags (--api-key, --output, --quiet, etc.) are always available.")}\n`,
    );
    out.write(`${d("Run")} bl --help ${d("for the full list.")}\n`);
  }

  private printChildren(node: CommandNode, prefix: string, out: NodeJS.WriteStream): void {
    const entries: Array<{ fullName: string; description: string }> = [];
    const collect = (n: CommandNode, p: string) => {
      for (const [name, child] of n.children) {
        if (child.command)
          entries.push({ fullName: `${p} ${name}`, description: child.command.description });
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

let registryPromise: Promise<CommandRegistry> | undefined;
let activeRegistry: CommandRegistry | undefined;

export function resetRegistry(): void {
  activeRegistry = undefined;
  registryPromise = undefined;
}

/** 异步创建命令注册表（内置 + 插件） */
export async function createRegistry(): Promise<CommandRegistry> {
  if (activeRegistry) return activeRegistry;
  if (!registryPromise) {
    registryPromise = (async () => {
      const { loadCommandCatalog } = await import("./load-commands.ts");
      const catalog = await loadCommandCatalog();
      activeRegistry = new CommandRegistry(catalog.commands);
      return activeRegistry;
    })();
  }
  return registryPromise;
}

/** main 初始化后获取 registry */
export function getActiveRegistry(): CommandRegistry {
  if (!activeRegistry) {
    throw new Error("Command registry is not initialized yet.");
  }
  return activeRegistry;
}
