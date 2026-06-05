import type { Config } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { ApiSource } from "./sources/api.ts";
import { CatalogSource } from "./sources/catalog.ts";
import type { ModelSource } from "./sources/types.ts";
import type { ModelProfile } from "./types.ts";

export interface GetModelsOptions {
  onPrepareStart?: () => void;
}

export async function getModels(
  config: Config,
  options?: GetModelsOptions,
): Promise<ModelProfile[]> {
  const sources: ModelSource[] = [
    new CatalogSource({ onPrepareStart: options?.onPrepareStart }),
    new ApiSource(config),
  ];

  for (const source of sources) {
    if (source.available()) {
      const models = await source.load();
      if (models.length > 0) return models;
    }
  }

  // CatalogSource not available → trigger install + load
  const catalog = sources[0] as CatalogSource;
  const models = await catalog.load();
  if (models.length > 0) return models;

  throw new BailianError("No model data available.", ExitCode.GENERAL);
}
