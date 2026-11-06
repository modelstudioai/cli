declare class RemoteTracker {
  constructor(config: { pid: string; debug?: boolean; [key: string]: unknown });
  use(plugin: unknown): (...args: any[]) => void;
  send(gokey: string, options?: { signal?: AbortSignal }): Promise<void>;
}

export = RemoteTracker;
