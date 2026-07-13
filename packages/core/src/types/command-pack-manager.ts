export interface CommandPackMutationResult {
  name: string;
  version?: string;
  commands: string[];
}

export interface CommandPackReport {
  name: string;
  version?: string;
  source: "installed" | "linked";
  status: "loaded" | "failed";
  commands: string[];
  error?: string;
}

/** Product-bound Command Pack management surface injected by the CLI runtime. */
export interface CommandPackManager {
  install(spec: string): Promise<CommandPackMutationResult>;
  link(path: string): Promise<CommandPackMutationResult>;
  list(): Promise<CommandPackReport[]>;
  remove(name: string): Promise<void>;
}
