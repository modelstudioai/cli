import { afterEach, expect, test, vi } from "vite-plus/test";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import create from "../../src/commands/knowledge/kb-create.ts";
import deleteIndex from "../../src/commands/knowledge/kb-delete.ts";
import { reportCreatedKnowledgeBase } from "../../src/commands/knowledge/billing.ts";

afterEach(() => vi.restoreAllMocks());

function fixture(
  options: { dryRun?: boolean; wait?: boolean; quiet?: boolean; locale?: "en-US" | "zh-CN" } = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  const requestJson = vi
    .fn()
    .mockResolvedValue({ data: { pipelineId: "idx-billed", ingestionId: "job-import" } });
  const context = {
    flags: {
      name: "fixture",
      description: "fixture",
      docId: ["file-sample"],
      workspaceId: "ws-test",
      wait: options.wait,
    },
    settings: { dryRun: options.dryRun, quiet: options.quiet, output: "json", timeout: 10 },
    localize: (text: LocalizedText) =>
      typeof text === "string" ? text : text[options.locale ?? "en-US"],
    client: { requestJson },
  } as unknown as Parameters<typeof create.run>[0];
  return { context, requestJson, stdout, stderr };
}

test("direct creation declares billing risk for runtime confirmation and discovery", () => {
  expect(create.risk).toMatchObject({ level: "high", reason: "billing" });
  expect(create.risk?.message).toMatchObject({
    "en-US": expect.stringContaining("720"),
    "zh-CN": expect.stringContaining("30"),
  });
});

test.each(["en-US", "zh-CN"] as const)(
  "dry-run contains billing policy and unknown allowance in %s without network",
  async (locale) => {
    const { context, requestJson, stdout } = fixture({ dryRun: true, locale });
    await create.run(context);
    expect(requestJson).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      notices: [
        {
          code: "KNOWLEDGE_BILLING",
          remainingAllowance: "unknown",
          url: expect.stringContaining("billing-for-knowledge-base"),
          message: expect.stringContaining("720"),
        },
      ],
    });
  },
);

test("success preserves server response and adds billing resources without polluting JSON", async () => {
  const { context, stdout, stderr } = fixture();
  await create.run(context);
  expect(JSON.parse(stdout.join(""))).toMatchObject({
    data: { pipelineId: "idx-billed" },
    resources: [{ indexId: "idx-billed", created: true }],
    notices: [{ code: "KNOWLEDGE_BILLING" }],
  });
  expect(stderr.join("")).toContain("KNOWLEDGE_BILLING");
});

test("failed wait retains created resource diagnostics even in quiet mode and preserves server error", async () => {
  const { context, requestJson, stderr } = fixture({ wait: true, quiet: true });
  const original = new BailianError("HTTP 400: original service error", ExitCode.GENERAL);
  requestJson
    .mockResolvedValueOnce({ data: { pipelineId: "idx-billed", ingestionId: "job-import" } })
    .mockRejectedValueOnce(original);
  await expect(create.run(context)).rejects.toBe(original);
  expect(stderr.join("")).toContain("idx-billed");
  expect(stderr.join("")).toContain("KNOWLEDGE_RESOURCE_CREATED");
  expect(stderr.join("")).toContain("delete-knowledge-base");
});

test.each([
  { binName: "bl", path: ["knowledge", "delete"] },
  { binName: "kscli", path: ["kb", "delete"] },
])(
  "direct create reports the actual $binName cleanup command before a failed wait",
  async ({ binName, path }) => {
    const { context, requestJson, stderr } = fixture({ wait: true, quiet: true });
    context.identity = { binName, version: "test", npmPackage: "test", clientName: "test" };
    context.commandPath = (command) => (command === deleteIndex ? path : undefined);
    const original = new BailianError("original polling failure", ExitCode.GENERAL);
    requestJson
      .mockResolvedValueOnce({ data: { pipelineId: "idx-billed", ingestionId: "job-import" } })
      .mockRejectedValueOnce(original);
    await expect(create.run(context)).rejects.toBe(original);
    const record = stderr
      .join("")
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line))
      .find((value) => value.warning?.code === "KNOWLEDGE_RESOURCE_CREATED");
    expect(record.warning.resource.cleanup.command).toEqual({
      bin: binName,
      path,
      args: ["--index-id", "idx-billed", "--workspace-id", "ws-test"],
    });
    expect(JSON.stringify(record.warning.resource.cleanup.command)).not.toContain("--yes");
  },
);

test("human cleanup instructions quote IDs safely and do not guess a missing route", () => {
  const { context, stderr } = fixture();
  context.settings.output = "text";
  context.identity = {
    binName: "custom-cli",
    version: "test",
    npmPackage: "test",
    clientName: "test",
  };
  context.commandPath = () => ["kb", "delete"];
  const resource = reportCreatedKnowledgeBase(context, "ws space", "idx'quoted");
  expect(resource.cleanup.command?.args).toEqual([
    "--index-id",
    "idx'quoted",
    "--workspace-id",
    "ws space",
  ]);
  expect(stderr.join("")).toContain(
    "custom-cli kb delete --index-id 'idx'\\''quoted' --workspace-id 'ws space'",
  );
  context.commandPath = () => undefined;
  expect(reportCreatedKnowledgeBase(context, "ws", "idx").cleanup.command).toBeUndefined();
});
