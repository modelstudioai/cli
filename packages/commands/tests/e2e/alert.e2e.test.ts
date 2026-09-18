import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { ALERT_ROUTES } from "./topic-routes.ts";

// 只覆盖 help / 参数校验 / dry-run；真实调用依赖 console 凭证与已开通的 CMS 服务。
describe("e2e: alert", () => {
  test("alert metrics --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, ["alert", "metrics", "--help"]);
    expect(exitCode, stderr).toBe(0);
  });

  test("alert template list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--source");
    expect(stderr).toContain("--template-id");
  });

  test("alert list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, ["alert", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--enabled");
    expect(stderr).toContain("--level");
  });

  test("alert create 缺少必填参数报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "create",
      "--level",
      "INFO",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--name");
  });

  test("alert create --notify-window 格式非法报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "create",
      "--name",
      "test",
      "--template-id",
      "123",
      "--model",
      "qwen3.6-plus",
      "--notify-window",
      "9点-18点",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--notify-window must be in HH:mm-HH:mm format");
  });

  test("alert create --notify-days 超出 1-7 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "create",
      "--name",
      "test",
      "--template-id",
      "123",
      "--model",
      "qwen3.6-plus",
      "--notify-days",
      "1,8",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--notify-days accepts values 1-7");
  });

  test("alert create --dry-run 输出完整通知配置", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "create",
      "--name",
      "high-failure-rate",
      "--template-id",
      "123",
      "--model",
      "qwen3.6-plus,qwen-turbo",
      "--level",
      "ERROR",
      "--contact-group",
      "4004200",
      "--notify-window",
      "09:00-18:00",
      "--notify-days",
      "1,2,3,4,5",
      "--silence",
      "3600",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        reqDTO?: {
          name?: string;
          templateId?: string;
          resourceIds?: string[];
          level?: string;
          interval?: number;
          duration?: number;
          notification?: {
            startTime?: string;
            endTime?: string;
            dayOfWeek?: number[];
            silenceTime?: number;
            contactGroups?: string[];
          };
        };
      };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.alertRule.createAlertRule");
    const reqDTO = data.data?.reqDTO;
    expect(reqDTO?.resourceIds).toEqual(["qwen3.6-plus", "qwen-turbo"]);
    expect(reqDTO?.level).toBe("ERROR");
    expect(reqDTO?.interval).toBe(60);
    expect(reqDTO?.notification?.startTime).toBe("09:00");
    expect(reqDTO?.notification?.endTime).toBe("18:00");
    expect(reqDTO?.notification?.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(reqDTO?.notification?.silenceTime).toBe(3600);
    expect(reqDTO?.notification?.contactGroups).toEqual(["4004200"]);
  });

  test("alert update 缺少 --rule-id 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "update",
      "--name",
      "test",
      "--template-id",
      "123",
      "--model",
      "qwen3.6-plus",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--rule-id");
  });

  test("alert delete --dry-run 支持多 ID", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "delete",
      "--rule-id",
      "789,790",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { ruleIds?: string[] } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.alertRule.deleteAlertRules");
    expect(data.data?.reqDTO?.ruleIds).toEqual(["789", "790"]);
  });

  test("alert delete --help 展示 --yes", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, ["alert", "delete", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
  });

  test("alert delete 非 TTY 无 --yes 返回确认请求 (7)", async () => {
    // 确认门先于 console 凭证解析与任何网络请求触发
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "delete",
      "--rule-id",
      "789",
    ]);
    expect(exitCode).toBe(7);
    expect(stderr).toMatch(/--yes/);
  });

  test("alert enable / disable --dry-run 输出对应 API", async () => {
    for (const [verb, api] of [
      ["enable", "zeldaEasy.bailian-telemetry.alertRule.enableAlertRule"],
      ["disable", "zeldaEasy.bailian-telemetry.alertRule.disableAlertRule"],
    ] as const) {
      const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
        "alert",
        verb,
        "--rule-id",
        "789",
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        api?: string;
        data?: { reqDTO?: { bizSource?: string } };
      }>(stdout);
      expect(data.api).toBe(api);
      expect(data.data?.reqDTO?.bizSource).toBe("bailian");
    }
  });

  test("alert template create --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--condition");
    expect(stderr).toContain("--from");
    expect(stderr).toContain("--logical-operator");
  });

  test("alert template create 无条件且无 --from 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "create",
      "--name",
      "test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--condition");
  });

  test("alert template create --condition 格式非法报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "create",
      "--name",
      "test",
      "--condition",
      "bad-format",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid --condition");
  });

  test("alert template create --dry-run 输出条件结构", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "create",
      "--name",
      "失败率告警",
      "--condition",
      "model_call_failed_count:sum:>:10:60",
      "--condition",
      "model_call_5xx_count:sum:>=:5:300",
      "--logical-operator",
      "and",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        reqDTO?: {
          templateName?: string;
          resourceType?: string;
          logicalOperator?: string;
          conditions?: {
            metricName?: string;
            aggregator?: string;
            compareType?: string;
            compareValue?: string;
            period?: number;
          }[];
        };
      };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.alertTemplate.createAlertTemplate");
    const reqDTO = data.data?.reqDTO;
    expect(reqDTO?.resourceType).toBe("model");
    expect(reqDTO?.logicalOperator).toBe("and");
    expect(reqDTO?.conditions).toHaveLength(2);
    expect(reqDTO?.conditions?.[0]).toEqual({
      metricName: "model_call_failed_count",
      aggregator: "sum",
      compareType: ">",
      compareValue: "10",
      period: 60,
    });
  });

  test("alert template update --dry-run 输出更新请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "update",
      "--template-id",
      "123",
      "--name",
      "test",
      "--condition",
      "model_call_count:sum:>:100:60",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { templateId?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.alertTemplate.updateAlertTemplate");
    expect(data.data?.reqDTO?.templateId).toBe("123");
  });

  test("alert template delete --dry-run 支持多 ID", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "delete",
      "--template-id",
      "123,124",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { templateIds?: string[] } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.alertTemplate.deleteAlertTemplates");
    expect(data.data?.reqDTO?.templateIds).toEqual(["123", "124"]);
  });

  test("alert template delete --help 展示 --yes", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
  });

  test("alert template delete 非 TTY 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "template",
      "delete",
      "--template-id",
      "123",
    ]);
    expect(exitCode).toBe(7);
    expect(stderr).toMatch(/--yes/);
  });

  test("alert history --dry-run 输出时间范围映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ALERT_ROUTES, [
      "alert",
      "history",
      "--rule-id",
      "789",
      "--status",
      "ALARM",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        reqDTO?: {
          alertRuleId?: string;
          status?: string;
          startTimeFrom?: number;
          startTimeTo?: number;
        };
      };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.alertRule.listAlertHistories");
    expect(data.data?.reqDTO?.alertRuleId).toBe("789");
    expect(data.data?.reqDTO?.status).toBe("ALARM");
    expect(data.data?.reqDTO?.startTimeFrom).toBeTypeOf("number");
    expect(data.data?.reqDTO?.startTimeTo).toBeTypeOf("number");
  });
});
