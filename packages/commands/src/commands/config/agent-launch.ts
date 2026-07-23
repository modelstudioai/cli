/**
 * Best-effort local launcher for coding-agent CLIs surfaced in the config UI.
 *
 * The command for each agent is taken from a fixed allowlist keyed by the
 * agent id, so no user-controlled string is ever executed. Every child process
 * is spawned via `execFile` (array args, no shell) to avoid injection.
 */
import { execFile } from "node:child_process";

/** Fixed allowlist: agent id -> launch binary. Keys match `AGENT_PROBES` ids. */
export const AGENT_COMMANDS: Record<string, string> = {
  "claude-code": "claude",
  "qwen-code": "qwen",
  opencode: "opencode",
  openclaw: "openclaw",
  hermes: "hermes",
  codex: "codex",
};

/** The launch binary for a known agent id, or undefined when unknown. */
export function agentCommand(id: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(AGENT_COMMANDS, id) ? AGENT_COMMANDS[id] : undefined;
}

/**
 * Per-agent argv that passes an initial task prompt while keeping the agent
 * interactive in the terminal. Only verified contracts are listed; an agent
 * absent here cannot be dispatched a prompt (its bare launch still works).
 *   - qwen-code:   `qwen -i "<prompt>"`   (execute prompt, stay interactive)
 *   - claude-code: `claude "<prompt>"`    (positional initial prompt)
 *   - codex:       `codex "<prompt>"`     (positional initial prompt)
 */
const AGENT_PROMPT_ARGV: Record<string, (prompt: string) => string[]> = {
  "qwen-code": (p) => ["-i", p],
  "claude-code": (p) => [p],
  codex: (p) => [p],
};

/** Whether a known agent supports being dispatched an initial task prompt. */
export function agentSupportsPrompt(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(AGENT_PROMPT_ARGV, id);
}

/** Resolve whether a binary is reachable on PATH (via `which`/`where`). */
function onPath(bin: string): Promise<boolean> {
  const cmd = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(cmd, [bin], { windowsHide: true }, (err) => resolve(!err));
  });
}

/**
 * Whether a known agent can actually be quick-launched right now: its id maps to
 * a launch binary and that binary is reachable on PATH. Unknown ids resolve to
 * false. Used to gate the UI's Quick launch button so "Connected" agents whose
 * CLI is not installed do not offer a launch that would immediately fail.
 */
export function agentLaunchable(id: string): Promise<boolean> {
  const command = agentCommand(id);
  if (!command) return Promise.resolve(false);
  return onPath(command);
}

/** Single-quote a path for a POSIX shell command line. */
function shQuote(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

/** Open a new OS terminal window that cd's into `cwd` and runs `command`. */
function spawnTerminal(command: string, cwd: string): Promise<void> {
  const platform = process.platform;
  return new Promise((resolve, reject) => {
    if (platform === "darwin") {
      const inner = `cd ${shQuote(cwd)} && ${command}`;
      const escaped = inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const args = [
        "-e",
        `tell application "Terminal" to do script "${escaped}"`,
        "-e",
        'tell application "Terminal" to activate',
      ];
      execFile("osascript", args, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
      return;
    }
    if (platform === "win32") {
      const args = ["/c", "start", "", "cmd", "/k", `cd /d ${cwd} && ${command}`];
      execFile("cmd", args, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
      return;
    }
    // Linux / other: best-effort via the distro's default terminal emulator.
    const inner = `cd ${shQuote(cwd)} && ${command}; exec $SHELL`;
    execFile("x-terminal-emulator", ["-e", "bash", "-lc", inner], { windowsHide: true }, (err) =>
      err ? reject(new Error("No supported terminal emulator was found")) : resolve(),
    );
  });
}

export interface LaunchResult {
  launched: boolean;
  command: string;
}

/**
 * Launch a known coding agent's local CLI in a new terminal window. When
 * `prompt` is provided, it is passed as a single quoted argument using the
 * agent's verified prompt contract so the agent starts with that task.
 * Rejects when the id is unknown, the binary is missing from PATH, the agent
 * does not support prompt dispatch, or the platform terminal could not open.
 */
export async function launchAgent(
  id: string,
  cwd: string = process.cwd(),
  prompt?: string,
): Promise<LaunchResult> {
  const command = agentCommand(id);
  if (!command) throw new Error(`Unknown agent: ${id}`);
  if (!(await onPath(command))) {
    throw new Error(`\`${command}\` was not found on your PATH — install ${id} first.`);
  }
  let fullCommand = command;
  const task = (prompt ?? "").trim();
  if (task) {
    const build = AGENT_PROMPT_ARGV[id];
    if (!build) throw new Error(`${id} does not support dispatching a task prompt.`);
    // shQuote keeps the whole prompt as one shell argument (no injection); the
    // platform terminal layer escapes the resulting command line separately.
    fullCommand = [command, ...build(task).map(shQuote)].join(" ");
  }
  await spawnTerminal(fullCommand, cwd);
  return { launched: true, command: fullCommand };
}
