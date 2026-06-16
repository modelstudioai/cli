import { callConsoleGateway } from "./gateway.ts";
import type { Config } from "../config/schema.ts";

const MODEL_LIST_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";

export interface ModelListParams {
  pageNo?: number;
  pageSize?: number;
  name?: string;
  providers?: string[];
  capabilities?: string[];
  region?: string;
}

export interface ModelListResult {
  total: number;
  models: Record<string, unknown>[];
}

export async function fetchModelList(
  config: Config,
  token: string,
  params: ModelListParams = {},
): Promise<ModelListResult> {
  const { pageNo = 1, pageSize = 50, name = "", providers = [], capabilities = [] } = params;

  const result = (await callConsoleGateway(config, token, {
    api: MODEL_LIST_API,
    data: {
      input: {
        pageNo,
        pageSize,
        name,
        providers,
        inferenceProviders: [],
        features: [],
        group: true,
        capabilities,
        contextWindows: [],
      },
    },
  })) as any;

  const responseData = result?.data?.DataV2?.data ?? result?.data ?? {};
  const total: number = responseData?.data?.total ?? responseData?.total ?? 0;
  const groups: any[] = responseData?.data?.list ?? responseData?.list ?? [];

  const models: Record<string, unknown>[] = [];
  for (const group of groups) {
    if (group.items?.length) {
      for (const item of group.items) models.push(item);
    } else {
      models.push(group);
    }
  }

  return { total, models };
}
