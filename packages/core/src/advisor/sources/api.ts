import type { Config } from "../../config/schema.ts";
import { callConsoleGateway } from "../../console/gateway.ts";
import { fetchModelList } from "../../console/models.ts";
import type { ModelProfile } from "../types.ts";
import type { ModelSource } from "./types.ts";

const PAGE_SIZE = 50;

function toModelProfile(item: Record<string, unknown>): ModelProfile | null {
  if (!item.model) return null;
  const meta = item.inferenceMetadata as Record<string, unknown> | undefined;
  return {
    model: item.model as string,
    name: (item.name as string) ?? (item.model as string),
    description: (item.description as string) ?? (item.shortDescription as string) ?? "",
    shortDescription: item.shortDescription as string | undefined,
    provider: (item.provider as string) ?? "",
    capabilities: (item.capabilities as string[]) ?? [],
    features: (item.features as string[]) ?? [],
    category: item.category as ModelProfile["category"],
    contextWindow: (item.contextWindow as number) ?? undefined,
    maxOutputTokens: (item.maxOutputTokens as number) ?? undefined,
    maxInputTokens: (item.maxInputTokens as number) ?? undefined,
    docUrl: item.docUrl as string | undefined,
    collectionTag: item.collectionTag as string | undefined,
    inferenceMetadata: meta as ModelProfile["inferenceMetadata"],
    prices: item.prices as ModelProfile["prices"],
    qpmInfo: item.qpmInfo as ModelProfile["qpmInfo"],
    versionTag: item.versionTag as string | undefined,
    openSource: item.openSource as boolean | undefined,
  };
}

export class ApiSource implements ModelSource {
  readonly name = "api";
  constructor(private config: Config) {}

  available(): boolean {
    return true;
  }

  async load(): Promise<ModelProfile[]> {
    // Public model catalog — no console token (advisor runs unauthenticated).
    const call = (api: string, data: Record<string, unknown>) =>
      callConsoleGateway(this.config, "", { api, data });

    const first = await fetchModelList(call, { pageNo: 1, pageSize: PAGE_SIZE });
    const allRaw = [...first.models];

    const totalPages = Math.ceil(first.total / PAGE_SIZE);
    for (let page = 2; page <= totalPages; page++) {
      const result = await fetchModelList(call, { pageNo: page, pageSize: PAGE_SIZE });
      allRaw.push(...result.models);
    }

    return allRaw
      .map(toModelProfile)
      .filter((profile): profile is ModelProfile => profile !== null);
  }
}
