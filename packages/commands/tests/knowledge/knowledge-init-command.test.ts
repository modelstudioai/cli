import { afterEach, expect, test, vi } from "vite-plus/test";
import { CommandRegistry } from "bailian-cli-runtime";
import command from "../../src/commands/knowledge/init.ts";
import deleteIndex from "../../src/commands/knowledge/kb-delete.ts";
import deleteService from "../../src/commands/knowledge/service-delete.ts";
import deleteFile from "../../src/commands/knowledge/file-delete.ts";
import search from "../../src/commands/knowledge/search.ts";
import * as workflow from "../../src/commands/knowledge/init-workflow.ts";

afterEach(() => vi.restoreAllMocks());
function fixture(binName = "kscli") {
  const registry = new CommandRegistry(
    binName === "kscli"
      ? {
          "kb delete": deleteIndex,
          "service delete": deleteService,
          "file delete": deleteFile,
          search,
        }
      : {
          "knowledge delete": deleteIndex,
          "knowledge service delete": deleteService,
          "knowledge file delete": deleteFile,
          "knowledge search": search,
        },
    binName,
  );
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const context = {
    flags: { workspaceId: "ws-test" },
    settings: { output: "json", quiet: true, timeout: 1 },
    prepared: { state: { target: { workspaceId: "ws-test" } } },
    identity: { binName },
    commandPath: registry.commandPath.bind(registry),
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
  } as unknown as Parameters<typeof command.run>[0];
  return { context, stdout, stderr };
}

test.each(["kscli", "bl"])(
  "success includes product-correct cleanup only for newly created resources: %s",
  async (binName) => {
    const { context, stdout } = fixture(binName);
    const resources = [
      { kind: "knowledge-base", id: "index-1", created: true },
      { kind: "service", id: "agent-1", created: false },
    ] as const;
    vi.spyOn(workflow, "runKnowledgeInit").mockResolvedValue({
      indexId: "index-1",
      agentId: "agent-1",
      fileId: "file-1",
      agentVersion: "beta",
      sampleMatched: true,
      resources: [...resources],
      stateFile: "state.json",
      timeToFirstValueMs: 1,
    });
    await command.run(context);
    const output = JSON.parse(stdout.mock.calls.map(([text]) => text).join(""));
    expect(output.cleanup).toEqual([
      {
        path: binName === "kscli" ? ["kb", "delete"] : ["knowledge", "delete"],
        args: ["--index-id", "index-1", "--workspace-id", "ws-test"],
      },
    ]);
    expect(output.nextSearch.path).toEqual(
      binName === "kscli" ? ["search"] : ["knowledge", "search"],
    );
    expect(output.nextSearch.args).toContain("beta");
    expect(output.notices[0].message).toContain("720");
  },
);

test("failure after creation prints the billable ID and cleanup even in quiet mode", async () => {
  const { context, stderr, stdout } = fixture();
  const failure = new Error("raw failure");
  vi.spyOn(workflow, "runKnowledgeInit").mockImplementation(async (options) => {
    options.report({ kind: "knowledge-base", id: "billable-id", created: true });
    throw failure;
  });
  await expect(command.run(context)).rejects.toBe(failure);
  const warning = JSON.parse(
    stderr.mock.calls
      .map(([text]) => text)
      .join("")
      .trim(),
  );
  expect(warning.resource).toMatchObject({ id: "billable-id", created: true });
  expect(warning.cleanup[0].args).toContain("billable-id");
  expect(warning.message).toContain("charges");
  expect(stdout).not.toHaveBeenCalled();
});

test("missing product route omits the command instead of inventing one", async () => {
  const { context, stdout } = fixture();
  context.commandPath = undefined;
  vi.spyOn(workflow, "runKnowledgeInit").mockResolvedValue({
    indexId: "index-1",
    agentId: "agent-1",
    fileId: "file-1",
    agentVersion: "beta",
    sampleMatched: true,
    resources: [{ kind: "knowledge-base", id: "index-1", created: true }],
    stateFile: "state.json",
    timeToFirstValueMs: 1,
  });
  await command.run(context);
  const output = JSON.parse(stdout.mock.calls.map(([text]) => text).join(""));
  expect(output.cleanup).toEqual([]);
  expect(output.nextSearch).toBeUndefined();
  expect(output.resources[0].id).toBe("index-1");
});

test.each([
  { name: "" },
  { name: "x".repeat(21) },
  { pollInterval: 0 },
  { pollInterval: -1 },
  { pollInterval: Infinity },
  { stateFile: " " },
])("invalid initialization flags fail before preparation %#", (flags) => {
  expect(command.validate?.(flags)).toBeDefined();
});
