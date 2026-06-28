const MODEL_LIST_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";

export interface ModelListParams {
  pageNo?: number;
  pageSize?: number;
  name?: string;
  providers?: string[];
  capabilities?: string[];
}

export interface ModelListResult {
  total: number;
  models: Record<string, unknown>[];
}

/** Page the console model-list API. `call` makes the gateway request (e.g. `client.console`). */
export async function fetchModelList(
  call: (api: string, data: Record<string, unknown>) => Promise<unknown>,
  params: ModelListParams = {},
): Promise<ModelListResult> {
  const { pageNo = 1, pageSize = 50, name = "", providers = [], capabilities = [] } = params;

  const result = (await call(MODEL_LIST_API, {
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
