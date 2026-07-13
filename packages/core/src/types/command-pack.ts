import type { ApiKeyCredential } from "../auth/types.ts";
import type { Client } from "../client/client.ts";
import type { Identity, Settings } from "../config/schema.ts";
import type { Command, FlagsDef, ParsedFlags } from "./command.ts";

/** Current Command Pack protocol version understood by this release. */
export const COMMAND_PACK_API_VERSION = 1 as const;

/** `package.json#bailianCli` metadata for a Command Pack package. */
export interface CommandPackMeta {
  type: "command-pack";
  apiVersion: number;
  /** ESM entry path relative to the package root. */
  entry: string;
  /** Optional minimum compatible bailian-cli version. */
  minCliVersion?: string;
}

/** Explicit credential delegation surface available only to trusted Command Packs. */
export interface CommandPackCredentials {
  apiKey(): ApiKeyCredential;
}

export interface CommandPackOutputOptions {
  /** Custom text-mode representation; JSON mode always serializes the primary data. */
  text?: string;
}

/** Stable stdout surface supplied by the host. */
export interface CommandPackOutput {
  result(data: unknown, options?: CommandPackOutputOptions): void;
  line(value: string): void;
  write(chunk: string): void;
}

export interface CommandPackErrorOptions {
  hint?: string;
  cause?: unknown;
}

/** Host-native semantic error factories; throw the returned Error. */
export interface CommandPackErrors {
  general(message: string, options?: CommandPackErrorOptions): Error;
  usage(message: string, hint?: string): Error;
  timeout(message?: string, options?: CommandPackErrorOptions): Error;
}

/** Stable API 1 execution context. It deliberately contains no raw credentials. */
export interface CommandPackContext<F extends FlagsDef = FlagsDef> {
  identity: Identity;
  settings: Settings;
  flags: ParsedFlags<F>;
  client: Client;
  output: CommandPackOutput;
  errors: CommandPackErrors;
}

/** Privileged context available only when product policy grants raw API-key access. */
export type CommandPackApiKeyContext<F extends FlagsDef = FlagsDef> = CommandPackContext<F> & {
  credentials: CommandPackCredentials;
};

/** Command shape exported by an API 1 Command Pack. */
export interface CommandPackCommand<
  F extends FlagsDef = FlagsDef,
  C extends CommandPackContext<F> = CommandPackContext<F>,
> extends Omit<Command<F>, "run"> {
  run(ctx: C): Promise<void>;
}

/** A Command Pack explicitly maps product command paths to command implementations. */
export type CommandPack = Record<string, CommandPackCommand<any, any>>;
