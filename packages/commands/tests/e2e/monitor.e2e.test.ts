import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MONITOR_ROUTES } from "./topic-routes.ts";

// 只覆盖 help / 参数校验 / dry-run；真实调用依赖 console 凭证与已开通的监控服务。
describe("e2e: monitor", () => {
  test("monitor overview --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "overview",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--days");
    expect(stderr).toContain("--api-key-id");
  });

  test("monitor models --help 包含排序与分页参数", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "models",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--sort-by");
    expect(stderr).toContain("--max-results");
    expect(stderr).toContain("--next-token");
  });

  test("monitor models --max-results 超范围报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "models",
      "--max-results",
      "100",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--max-results must be between 1 and 50");
  });

  test("monitor metrics 缺少 --metric 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "metrics",
      "--days",
      "1",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--metric");
  });

  test("monitor metrics 未知指标名报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "metrics",
      "--metric",
      "not_a_metric",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown metric");
  });

  test("monitor metrics --dry-run 输出 reqDTO 与自动 step", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "metrics",
      "--metric",
      "model_call_count,model_call_failed_count",
      "--agg",
      "p99",
      "--days",
      "1",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        reqDTO?: {
          metricFilters?: { metricName: string; aggMethod: string }[];
          step?: number;
        };
      };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.platform-model.getModelMonitorDataWithOss");
    expect(data.data?.reqDTO?.metricFilters).toHaveLength(2);
    expect(data.data?.reqDTO?.metricFilters?.[0]?.aggMethod).toBe("p99");
    // 1 天范围自动 step = 3600s
    expect(data.data?.reqDTO?.step).toBe(3600);
  });

  test("monitor metrics 非法 step 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "metrics",
      "--metric",
      "model_call_count",
      "--step",
      "300",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--step must be one of 60, 3600, 86400");
  });

  test("monitor overview --dry-run 输出统计 API", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "overview",
      "--model",
      "qwen3.6-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { models?: string[] } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.platform-model.getModelStatistic");
    expect(data.data?.reqDTO?.models).toEqual(["qwen3.6-plus"]);
  });

  test("monitor errors --dry-run 输出错误码统计 API", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "errors",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string }>(stdout);
    expect(data.api).toBe(
      "zeldaEasy.bailian-telemetry.platform-model.getModelErrorCodeStatisticData",
    );
  });

  test("monitor delivery enable --dry-run 输出开通链路 API", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "delivery",
      "enable",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ apis?: string[] }>(stdout);
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.getTelemetrySlrStatus");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.createTelemetrySlr");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.getTelemetryServiceStatus");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.initCmsService");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.initTelemetryStoreInstance");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.telemetryGroup.enableTelemetryGroup");
  });

  test("monitor delivery disable --dry-run 输出 Monitor 开关关闭请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "delivery",
      "disable",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { telemetryType?: string; resourceId?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.telemetryGroup.disableTelemetryGroup");
    expect(data.data?.reqDTO?.telemetryType).toBe("Monitor");
    expect(data.data?.reqDTO?.resourceId).toBe("all");
  });

  test("--start-time 晚于 --end-time 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MONITOR_ROUTES, [
      "monitor",
      "overview",
      "--start-time",
      "2026-08-02",
      "--end-time",
      "2026-08-01",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--start-time must be earlier than --end-time");
  });
});
