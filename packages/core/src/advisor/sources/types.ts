import type { ModelProfile } from "../types.ts";

export interface ModelSource {
  name: string;
  available(): boolean;
  load(): Promise<ModelProfile[]>;
}
