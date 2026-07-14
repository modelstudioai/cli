import type { CommandPackMeta } from "bailian-cli-core";

export interface CommandPackDefinition {
  commandPrefixes: readonly string[];
  /** Raw credential domains explicitly delegated to this trusted package. */
  credentialAccess?: readonly CommandPackCredentialAccess[];
}

export type CommandPackCredentialAccess = "apiKey";

/** Product policy: each CLI explicitly declares which Command Packs it accepts. */
export interface CommandPackPolicy {
  supported: Readonly<Record<string, CommandPackDefinition>>;
}

export interface CommandPackPackageJson {
  name?: string;
  version?: string;
  bailianCli?: CommandPackMeta;
}

export interface CommandPackSandboxManifest {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
}
