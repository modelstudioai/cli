import { expect, test } from "vite-plus/test";
import bootstrapCommand from "../src/commands/bootstrap/index.ts";

const API = {
  loginInfo: "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
  initSpace: "zeldaEasy.bailian-dash-workspace.space.initSpace",
  createUser: "zeldaEasy.bailian-dash-workspace.account.createUser",
  queryBuyResult: "zeldaEasy.bailian-commerce.bill.queryBuyPostpaidResult",
  commodityOrderInfo: "zeldaEasy.bailian-commerce.bill.postpaidCommodityOrderInfo",
  buyCommodity: "zeldaEasy.bailian-commerce.bill.buyPostpaidCommodity",
} as const;

interface ConsoleCall {
  api: string;
  data: Record<string, unknown>;
}

function captureStdout(): { read: () => string; restore: () => void } {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let stdout = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  return {
    read: () => stdout,
    restore: () => {
      process.stdout.write = originalWrite;
    },
  };
}

function gatewayResponse(data: unknown): unknown {
  return {
    data: {
      DataV2: {
        data: {
          data,
        },
      },
      success: true,
    },
  };
}

function createContext(
  consoleImpl: (api: string, data: Record<string, unknown>) => Promise<unknown>,
) {
  return {
    settings: {
      dryRun: false,
      output: "json",
      verbose: false,
    },
    client: {
      console: consoleImpl,
    },
  };
}

test("bootstrap --dry-run lists createUser after initSpace", async () => {
  const stdout = captureStdout();
  try {
    await bootstrapCommand.run({
      ...createContext(async () => ({})),
      settings: { dryRun: true, output: "json", verbose: false },
    } as any);
  } finally {
    stdout.restore();
  }

  const data = JSON.parse(stdout.read()) as {
    apis: Array<{ step: number; api: string }>;
  };
  expect(data.apis.map((item) => item.api)).toEqual([
    API.loginInfo,
    API.initSpace,
    API.createUser,
    API.queryBuyResult,
    API.commodityOrderInfo,
    API.buyCommodity,
  ]);
  expect(data.apis.map((item) => item.step)).toEqual([1, 2, 3, 4, 5, 6]);
});

test("bootstrap creates user from loginInfo uid when workspace is not initialized", async () => {
  const uid = "AssumedRoleUser300715349082471133";
  const calls: ConsoleCall[] = [];
  const stdout = captureStdout();
  const ctx = createContext(async (api, data) => {
    calls.push({ api, data });
    if (api === API.loginInfo) {
      return gatewayResponse({ spaceInited: false, aliyun: { uid } });
    }
    if (api === API.queryBuyResult) {
      return gatewayResponse("success");
    }
    if (api === API.commodityOrderInfo) {
      return gatewayResponse([{ commodityCode: "postpaid", status: 10 }]);
    }
    return gatewayResponse({});
  });

  try {
    await bootstrapCommand.run(ctx as any);
  } finally {
    stdout.restore();
  }

  expect(calls.map((call) => call.api)).toEqual([
    API.loginInfo,
    API.initSpace,
    API.createUser,
    API.queryBuyResult,
    API.commodityOrderInfo,
  ]);
  expect(calls.find((call) => call.api === API.createUser)?.data).toEqual({
    reqDTO: {
      outerKey: uid,
      nickName: uid,
      userName: uid,
    },
  });
});

test("bootstrap skips initSpace but still creates user when workspace is already initialized", async () => {
  const uid = "AssumedRoleUser300715349082471133";
  const calls: ConsoleCall[] = [];
  const stdout = captureStdout();
  const ctx = createContext(async (api, data) => {
    calls.push({ api, data });
    if (api === API.loginInfo) {
      return gatewayResponse({
        spaceInited: true,
        aliyun: { uid },
      });
    }
    if (api === API.queryBuyResult) {
      return gatewayResponse("success");
    }
    if (api === API.commodityOrderInfo) {
      return gatewayResponse([{ commodityCode: "postpaid", status: 10 }]);
    }
    return gatewayResponse({});
  });

  try {
    await bootstrapCommand.run(ctx as any);
  } finally {
    stdout.restore();
  }

  expect(calls.map((call) => call.api)).toEqual([
    API.loginInfo,
    API.createUser,
    API.queryBuyResult,
    API.commodityOrderInfo,
  ]);
  expect(calls.some((call) => call.api === API.initSpace)).toBe(false);
  expect(calls.find((call) => call.api === API.createUser)?.data).toEqual({
    reqDTO: {
      outerKey: uid,
      nickName: uid,
      userName: uid,
    },
  });
});
