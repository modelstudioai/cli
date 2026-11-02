import type { Identity } from "../config/schema.ts";

type Invocation = Pick<Identity, "binName" | "commandInvocation"> | string;
export type CommandFormatter = (arguments_?: string) => string;
const COMMAND_PREFIX = "{{commandPrefix}}";

export interface ExecutableCommand {
  bin: string;
  path: string[];
  args: string[];
}

/** Build argv for shell:false consumers; never interpret a human-facing prefix. */
export function buildCommandInvocation(
  identity: Pick<Identity, "binName" | "commandInvocation">,
  path: readonly string[] = [],
  args: readonly string[] = [],
): ExecutableCommand {
  return {
    bin: identity.commandInvocation?.bin ?? identity.binName,
    path: [...(identity.commandInvocation?.path ?? []), ...path],
    args: [...args],
  };
}

/** Format a complete instruction at the point where the invocation is known. */
export function formatCommand(invocation: Invocation, arguments_ = ""): string {
  const prefix =
    typeof invocation === "string"
      ? invocation
      : [
          invocation.commandInvocation?.bin ?? invocation.binName,
          ...(invocation.commandInvocation?.path ?? []),
        ].join(" ");
  return arguments_ ? `${prefix} ${arguments_}` : prefix;
}

/** Reference used only in fixed CLI metadata, before the invocation is known. */
export function commandRef(arguments_ = ""): string {
  return formatCommand(COMMAND_PREFIX, arguments_);
}

/** Resolve fixed help/reference templates; never pass service or user-generated text. */
export function renderCommandText(text: string, invocation: Invocation): string {
  return text.split(COMMAND_PREFIX).join(formatCommand(invocation));
}
