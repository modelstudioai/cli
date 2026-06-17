import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";

const APP_LIST_API = "zeldaEasy.broadscope-bailian.app-control.list";

export default defineCommand({
  name: "app list",
  description: "List Bailian applications",
  skipDefaultApiKeySetup: true,
  usage: "bl app list [flags]",
  options: [
    {
      flag: "--name <name>",
      description: "Filter by app name (keyword search)",
    },
    {
      flag: "--page <n>",
      description: "Page number (default: 1)",
      type: "number",
    },
    {
      flag: "--page-size <n>",
      description: "Results per page (default: 30)",
      type: "number",
    },
    {
      flag: "--region <region>",
      description: "API region (default: cn-beijing)",
    },
  ],
  examples: [
    "bl app list",
    "bl app list --name 客服",
    "bl app list --page 2 --page-size 10",
    "bl app list --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const name = (flags.name as string) || "";
    const pageNo = (flags.page as number) || 1;
    const pageSize = (flags.pageSize as number) || 30;
    const region = (flags.region as string) || "cn-beijing";
    const format = detectOutputFormat(config.output);

    const credential = await resolveConsoleGatewayCredential(config);

    const data = {
      reqDTO: {
        name,
        notInTypes: [10],
        type: 5,
        statuses: [1, 4],
        page_no: pageNo,
        page_size: pageSize,
      },
    };

    if (config.dryRun) {
      emitResult(
        { api: APP_LIST_API, data, region, token: credential.token.slice(0, 8) + "..." },
        format,
      );
      return;
    }

    const result = (await callConsoleGateway(config, credential.token, {
      api: APP_LIST_API,
      data,
      region,
    })) as any;

    const list: unknown[] = result?.data?.DataV2?.data?.data?.list ?? [];
    const total: number = result?.data?.DataV2?.data?.data?.total ?? 0;

    const apps = list.map((item: any) => ({
      code: item.code,
      name: item.name,
      user_prompt_params: item.config?.user_prompt_params ?? [],
    }));

    emitResult({ total, apps }, format);
  },
});
