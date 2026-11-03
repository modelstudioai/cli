import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandHelp, runCommandInProcess } from "./helpers.ts";
import { CMODEL_ROUTES } from "./topic-routes.ts";

describe("e2e: cmodel", () => {
  test("cmodel --help 列出子命令", async () => {
    const { stderr, exitCode } = await runCommandHelp(CMODEL_ROUTES, ["cmodel", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("Usage: bl cmodel <command> [flags]");
    expect(stderr).toMatch(/import|get|list|watch|delete|base-models/);
  });

  test("cmodel import --help 展示导入参数与可选 console 预检 flag", async () => {
    const { stderr, exitCode } = await runCommandHelp(CMODEL_ROUTES, [
      "cmodel",
      "import",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--base-model");
    expect(stderr).toContain("--weight-type");
    expect(stderr).toContain("--bucket");
    expect(stderr).toContain("--object-key");
    // optionalConsole: apiKey 命令额外可见 console 域 flag
    expect(stderr).toContain("--console-region");
    expect(stderr).toContain("API Key");
  });

  test("cmodel import 缺少 --weight-type 报错", async () => {
    const { stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, [
      "cmodel",
      "import",
      "--base-model",
      "qwen3-32b",
      "--bucket",
      "my-model-bucket",
      "--object-key",
      "models/qwen3-32b-lora/",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--weight-type");
  });

  test("cmodel import --weight-type 非法取值报错", async () => {
    const { stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, [
      "cmodel",
      "import",
      "--base-model",
      "qwen3-32b",
      "--weight-type",
      "qlora",
      "--bucket",
      "my-model-bucket",
      "--object-key",
      "models/qwen3-32b-lora/",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--weight-type");
  });

  test.each([
    {
      name: "object-key 不以 / 结尾",
      objectKey: "models/qwen3-32b-lora",
      expected: "--object-key",
    },
    { name: "object-key 是 Bucket 根目录", objectKey: "/", expected: "--object-key" },
    {
      name: "display-name 超过 50 字符",
      displayName: "x".repeat(51),
      expected: "--display-name",
    },
    { name: "bucket 命名非法", bucket: "My_Model_Bucket", expected: "--bucket" },
  ])("cmodel 校验失败：$name", async ({ objectKey, displayName, bucket, expected }) => {
    const args = [
      "cmodel",
      "import",
      "--base-model",
      "qwen3-32b",
      "--weight-type",
      "lora",
      "--bucket",
      bucket ?? "my-model-bucket",
      "--object-key",
      objectKey ?? "models/qwen3-32b-lora/",
    ];
    if (displayName) args.push("--display-name", displayName);
    const { stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, args);
    expect(exitCode).toBe(2);
    expect(stderr).toContain(expected);
  });

  test("cmodel import --dry-run 构造 OSS 导入请求体且跳过预检", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, [
      "cmodel",
      "import",
      "--base-model",
      "qwen3-32b",
      "--weight-type",
      "lora",
      "--bucket",
      "my-model-bucket",
      "--object-key",
      "models/qwen3-32b-lora/",
      "--display-name",
      "my-lora",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      request?: {
        model_name?: string;
        display_name?: string;
        source?: string;
        weight_type?: string;
        storage_info?: { bucket_name?: string; object_key?: string };
      };
      precheck?: { performed?: boolean; reason?: string };
    }>(stdout);
    expect(data.action).toBe("cmodel.import");
    expect(data.request?.model_name).toBe("qwen3-32b");
    expect(data.request?.display_name).toBe("my-lora");
    expect(data.request?.source).toBe("oss");
    expect(data.request?.weight_type).toBe("lora");
    expect(data.request?.storage_info).toEqual({
      bucket_name: "my-model-bucket",
      object_key: "models/qwen3-32b-lora/",
    });
    expect(data.precheck).toEqual({ performed: false, reason: "dry-run" });
  });

  test.each([
    {
      name: "get",
      args: ["get", "--job-id", "937b-xxxx"],
      action: "cmodel.get",
    },
    {
      name: "list",
      args: ["list", "--status", "RUNNING", "--page", "2", "--page-size", "20"],
      action: "cmodel.list",
    },
    {
      name: "watch",
      args: ["watch", "--job-id", "937b-xxxx", "--follow", "--interval", "5"],
      action: "cmodel.watch",
    },
    { name: "delete", args: ["delete", "--job-id", "937b-xxxx"], action: "cmodel.delete" },
  ])("cmodel $name --dry-run 输出计划", async ({ args, action }) => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, [
      "cmodel",
      ...args,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      job_id?: string;
      status?: string;
      follow?: boolean;
    }>(stdout);
    expect(data.action).toBe(action);
    if (data.job_id) expect(data.job_id).toBe("937b-xxxx");
    if (action === "cmodel.list") expect(data.status).toBe("RUNNING");
    if (action === "cmodel.watch") expect(data.follow).toBe(true);
  });

  test.each([
    {
      name: "list --page-size 0",
      args: ["list", "--page-size", "0"],
      expected: "--page-size",
    },
    {
      name: "watch --interval 0",
      args: ["watch", "--job-id", "937b-xxxx", "--interval", "0"],
      expected: "--interval",
    },
  ])("cmodel 校验失败：$name", async ({ args, expected }) => {
    const { stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, ["cmodel", ...args]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain(expected);
  });

  test("cmodel import delete --help 展示高风险提示", async () => {
    const { stderr, exitCode } = await runCommandHelp(CMODEL_ROUTES, [
      "cmodel",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("Risk");
    expect(stderr).toContain("cannot be undone");
  });

  test("cmodel import base-models 使用 Console 鉴权并暴露地域 flag", async () => {
    const { stderr, exitCode } = await runCommandHelp(CMODEL_ROUTES, [
      "cmodel",
      "base-models",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("Console");
    expect(stderr).toContain("--console-region");
  });

  test("cmodel import base-models --dry-run 输出 console 目标", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(CMODEL_ROUTES, [
      "cmodel",
      "base-models",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      consoleRegion?: string;
      consoleSite?: string;
    }>(stdout);
    expect(data.action).toBe("cmodel.baseModels");
    expect(data.consoleRegion).toBe("cn-beijing");
    expect(data.consoleSite).toBe("domestic");
  });
});
