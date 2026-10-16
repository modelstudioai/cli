import { describe, expect, test } from "vite-plus/test";
import { UsageError } from "bailian-cli-core";
import {
  autoStep,
  buildTelemetryFilters,
  ensureTelemetryRegionSupported,
  resolveTimeRange,
} from "../src/commands/shared/telemetry.ts";
import {
  buildAlertRuleReqDTO,
  parseCondition,
  validateAlertRuleFlags,
  validateTemplateConditions,
  NO_SILENCE,
} from "../src/commands/alert/shared.ts";

describe("ensureTelemetryRegionSupported", () => {
  test("支持的 region 放行", () => {
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "cn-beijing" })).not.toThrow();
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "ap-southeast-1" })).not.toThrow();
  });

  test("未设置 region 时默认 cn-beijing 放行", () => {
    expect(() => ensureTelemetryRegionSupported({})).not.toThrow();
  });

  test("未部署遥测服务的 region 报 UsageError", () => {
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "cn-shanghai" })).toThrow(
      UsageError,
    );
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "us-east-1" })).toThrow(
      /not available in console region "us-east-1"/,
    );
  });
});

describe("resolveTimeRange", () => {
  test("默认按 days 向前推", () => {
    const { startTime, endTime } = resolveTimeRange({ days: 7 });
    expect(endTime - startTime).toBe(7 * 86_400_000);
  });

  test("hours 优先于 days", () => {
    const { startTime, endTime } = resolveTimeRange({ days: 7, hours: 2 });
    expect(endTime - startTime).toBe(2 * 3_600_000);
  });

  test("start-time/end-time 覆盖相对窗口", () => {
    const { startTime, endTime } = resolveTimeRange({
      startTime: "2026-08-01T00:00:00+08:00",
      endTime: "2026-08-02T00:00:00+08:00",
    });
    expect(endTime - startTime).toBe(86_400_000);
  });

  test("支持毫秒时间戳字符串", () => {
    const { startTime } = resolveTimeRange({
      startTime: "1754000000000",
      endTime: "1754100000000",
    });
    expect(startTime).toBe(1754000000000);
  });

  test("start 不早于 end 报错", () => {
    expect(() => resolveTimeRange({ startTime: "2026-08-02", endTime: "2026-08-01" })).toThrow(
      UsageError,
    );
  });

  test("非法时间格式报错", () => {
    expect(() => resolveTimeRange({ startTime: "昨天" })).toThrow(UsageError);
  });
});

describe("autoStep", () => {
  const hoursAgo = (hours: number) => ({ startTime: 0, endTime: hours * 3_600_000 });

  test("按时间范围选档", () => {
    expect(autoStep(0, hoursAgo(12).endTime)).toBe(60);
    expect(autoStep(0, hoursAgo(24).endTime)).toBe(3600);
    expect(autoStep(0, hoursAgo(48).endTime)).toBe(3600);
    expect(autoStep(0, hoursAgo(96).endTime)).toBe(3600);
    expect(autoStep(0, hoursAgo(24 * 30).endTime)).toBe(86400);
  });
});

describe("buildTelemetryFilters", () => {
  test("逗号列表拆分并映射字段名", () => {
    const filters = buildTelemetryFilters(
      { model: "a, b ,a", apiKeyId: "k1", callSource: "Online" },
      "ws-1",
    );
    expect(filters).toEqual({
      workspaceId: "ws-1",
      models: ["a", "b"],
      apikeyIds: ["k1"],
      channels: undefined,
      sources: undefined,
      modelCallSource: "Online",
    });
  });
});

describe("validateAlertRuleFlags", () => {
  test("合法配置通过", () => {
    expect(
      validateAlertRuleFlags({ notifyWindow: "09:00-18:00", notifyDays: "1,2,3", silence: 600 }),
    ).toBeUndefined();
  });

  test("notify-window 格式非法", () => {
    expect(validateAlertRuleFlags({ notifyWindow: "9点-18点" })).toContain("--notify-window");
  });

  test("notify-days 超出 1-7", () => {
    expect(validateAlertRuleFlags({ notifyDays: "1,8" })).toContain("--notify-days");
  });

  test("gmt-offset 格式非法", () => {
    expect(validateAlertRuleFlags({ gmtOffset: "8" })).toContain("--gmt-offset");
  });
});

describe("buildAlertRuleReqDTO", () => {
  const base = { name: "n", templateId: "t1", model: "qwen3.6-plus,qwen-turbo" };

  test("默认值与控制台一致", () => {
    const reqDTO = buildAlertRuleReqDTO(base) as {
      resourceIds: string[];
      level: string;
      interval: number;
      notification: {
        startTime: string;
        endTime: string;
        gmtOffset: string;
        dayOfWeek: number[];
        silenceTime: number;
      };
    };
    expect(reqDTO.resourceIds).toEqual(["qwen3.6-plus", "qwen-turbo"]);
    expect(reqDTO.level).toBe("INFO");
    expect(reqDTO.interval).toBe(60);
    expect(reqDTO.notification.startTime).toBe("00:00");
    expect(reqDTO.notification.endTime).toBe("23:59");
    expect(reqDTO.notification.gmtOffset).toBe("+0800");
    expect(reqDTO.notification.dayOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(reqDTO.notification.silenceTime).toBe(NO_SILENCE);
  });

  test("通知窗口与静默时间映射", () => {
    const reqDTO = buildAlertRuleReqDTO({
      ...base,
      notifyWindow: "09:00-18:00",
      notifyDays: "6,7",
      silence: 1800,
      contactGroup: "g1,g2",
    }) as {
      notification: {
        startTime: string;
        endTime: string;
        dayOfWeek: number[];
        silenceTime: number;
        contactGroups: string[];
      };
    };
    expect(reqDTO.notification.startTime).toBe("09:00");
    expect(reqDTO.notification.endTime).toBe("18:00");
    expect(reqDTO.notification.dayOfWeek).toEqual([6, 7]);
    expect(reqDTO.notification.silenceTime).toBe(1800);
    expect(reqDTO.notification.contactGroups).toEqual(["g1", "g2"]);
  });
});

describe("parseCondition", () => {
  test("解析五段式条件", () => {
    expect(parseCondition("model_call_failed_count:sum:>:10:60")).toEqual({
      metricName: "model_call_failed_count",
      aggregator: "sum",
      compareType: ">",
      compareValue: "10",
      period: 60,
    });
  });

  test("段数不对报错", () => {
    expect(() => parseCondition("bad-format")).toThrow(UsageError);
  });

  test("非法比较符报错", () => {
    expect(() => parseCondition("m:sum:<>:10:60")).toThrow(UsageError);
  });

  test("period 非正数报错", () => {
    expect(() => parseCondition("m:sum:>:10:0")).toThrow(UsageError);
  });
});

describe("validateTemplateConditions", () => {
  test("无条件且无 --from 报错", () => {
    expect(validateTemplateConditions(undefined, false)).toContain("--condition");
  });

  test("无条件但有 --from 放行", () => {
    expect(validateTemplateConditions(undefined, true)).toBeUndefined();
  });

  test("超过 10 条报错", () => {
    const conditions = Array.from({ length: 11 }, () => "m:sum:>:1:60");
    expect(validateTemplateConditions(conditions, false)).toContain("At most 10");
  });

  test("条件格式错误透传解析报错", () => {
    expect(validateTemplateConditions(["bad"], false)).toContain("Invalid --condition");
  });
});
