declare class RemoteTracker {
  constructor(config: { pid: string; debug?: boolean; [key: string]: unknown });
  use(plugin: unknown): (...args: any[]) => void;
  send(gokey: string): Promise<void>;
}

export = RemoteTracker;
