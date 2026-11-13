import type { AnyCommand, LocalizedText } from "bailian-cli-core";

/**
 * Wrap a command as a deprecated alias of its replacement product path.
 *
 * The wrapper keeps the original auth/risk/flags/prepare/validate intact (via
 * spread) and only adds user-facing deprecation signals: a `[Deprecated]`
 * description prefix, a leading note pointing at the replacement, and a stderr
 * warning emitted on invocation. `--help` is rendered by the runtime before
 * `run`, so it shows the note without emitting the warning.
 *
 * This lives in the product layer: the command library stays path-agnostic and
 * the runtime gains no deprecation concept.
 */
export function deprecatedCommand(command: AnyCommand, replacementPath: string): AnyCommand {
  const note: LocalizedText = {
    "en-US": `Deprecated: use \`bl ${replacementPath}\` instead. This command will be removed in a future release.`,
    "zh-CN": `已废弃：请改用 \`bl ${replacementPath}\`。该命令将在未来版本移除。`,
  };
  const prefix = (text: LocalizedText): LocalizedText =>
    typeof text === "string"
      ? `[Deprecated] ${text}`
      : {
          "en-US": `[Deprecated] ${text["en-US"]}`,
          "zh-CN": `[已废弃] ${text["zh-CN"]}`,
        };
  return {
    ...command,
    description: prefix(command.description),
    notes: [note, ...(command.notes ?? [])],
    async run(ctx) {
      ctx.output.info({
        "en-US": `Warning: this command is deprecated; use \`bl ${replacementPath}\` instead.`,
        "zh-CN": `警告：该命令已废弃，请改用 \`bl ${replacementPath}\`。`,
      });
      return command.run(ctx);
    },
  };
}
