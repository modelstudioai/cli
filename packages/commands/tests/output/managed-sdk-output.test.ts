import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  createProjectRuntime,
  resolveProjectConfigFromObject,
  StateManager,
  listRemoteAgents,
  type RuntimeFeedbackEvent,
} from "@openagentpack/sdk";
import { buildSettings, httpTransport, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { withStdoutProtected } from "../../src/commands/managed-agent/_engine/console-capture.ts";
import { renderAgentFeedback } from "../../src/commands/managed-agent/_engine/feedback.ts";
import { emitCollection } from "../../src/commands/managed-agent/_engine/api-helpers.ts";

const displays = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
let rawOut = "",
  rawErr = "";
beforeEach(() => {
  rawOut = "";
  rawErr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    rawOut += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    rawErr += String(chunk);
    return true;
  });
  vi.spyOn(httpTransport, "fetch").mockRejectedValue(new Error("Unexpected network"));
});
afterEach(() => vi.restoreAllMocks());
function context(display: (typeof displays)[number], clientName = "sdk-fixture") {
  const settings = buildSettings({
    flags: { output: display.format, quiet: display.quiet, verbose: display.verbose },
    env: {},
    file: {},
  });
  const identity = { binName: "bl", version: "fixture-version", clientName, npmPackage: "test" };
  const localize = (message: LocalizedText) =>
    typeof message === "string" ? message : message["en-US"];
  let stdout = "",
    stderr = "";
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  return {
    host: { settings, identity, localize, output: reporter.output },
    reporter,
    resultSpy: vi.spyOn(reporter.output, "result"),
    read: () => ({ stdout, stderr }),
  };
}
const items = [{ id: "agent-fixture", name: "Fixture", future: { values: [false, 0, null, []] } }];
test.each(displays)(
  "collection retains items and pagination under all output settings %j",
  (display) => {
    const current = context(display);
    emitCollection(current.host, {
      key: "agents",
      items,
      headers: ["ID", "NAME"],
      rows: [["agent-fixture", "Fixture"]],
      hasMore: true,
      nextPage: "opaque-next",
      truncated: false,
      scannedPages: 2,
    });
    expect(rawOut + rawErr).toBe("");
    expect(current.resultSpy).toHaveBeenCalledTimes(1);
    const result = current.read();
    if (display.format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        agents: items,
        has_more: true,
        next_page: "opaque-next",
        truncated: false,
        scanned_pages: 2,
      });
    else {
      expect(result.stdout).toContain("agent-fixture");
      expect(result.stdout).toContain("Total: 1");
      expect(result.stdout).toContain("opaque-next");
    }
  },
);
test.each(displays)("empty collection is still one complete result %j", (display) => {
  const current = context(display);
  emitCollection(current.host, {
    key: "agents",
    items: [],
    headers: ["ID"],
    rows: [],
    hasMore: false,
  });
  expect(rawOut + rawErr).toBe("");
  expect(current.resultSpy).toHaveBeenCalledTimes(1);
  if (display.format === "json")
    expect(JSON.parse(current.read().stdout)).toEqual({ agents: [], has_more: false });
  else expect(current.read().stdout).toBe("No resources found.\n");
});
for (const level of ["info", "success", "warning", "error"] as const)
  test.each(displays)(`SDK feedback ${level} follows channel visibility %j`, (display) => {
    const current = context(display);
    const event: RuntimeFeedbackEvent = {
      type: level === "error" ? "resource_action_failed" : "provider_wait",
      level,
      message: "fixture feedback",
      resource: { type: "agent", provider: "bailian", name: "fixture" },
    };
    renderAgentFeedback(current.host.output, event);
    expect(rawOut + rawErr).toBe("");
    expect(current.read().stdout).toBe("");
    const shown =
      level === "warning" || level === "error" || (display.format === "text" && !display.quiet);
    if (!shown) expect(current.read().stderr).toBe("");
    else if (display.format === "json")
      expect(JSON.parse(current.read().stderr)).toMatchObject({
        warning: {
          code: "AGENT_RUNTIME_FEEDBACK",
          message: "fixture feedback",
          details: { type: event.type, resource: event.resource },
        },
      });
    else expect(current.read().stderr).toContain("fixture feedback");
  });
for (const method of ["log", "info", "debug", "warn", "error"] as const)
  test.each(displays)(
    `SDK console.${method} cannot leak raw bodies or credentials %j`,
    async (display) => {
      const current = context(display);
      await withStdoutProtected(current.host, async () => {
        console[method](
          "[skill-upload] /files response:",
          JSON.stringify({ api_key: "fixture-secret-key", content: "fixture-private-body" }),
        );
      });
      expect(rawOut + rawErr).toBe("");
      expect(current.read().stdout).toBe("");
      const diagnostics = current.read().stderr;
      expect(diagnostics).not.toContain("fixture-secret-key");
      expect(diagnostics).not.toContain("fixture-private-body");
      if (method === "warn" || method === "error") expect(diagnostics).not.toBe("");
      else if (!display.verbose) expect(diagnostics).toBe("");
      else expect(diagnostics).not.toBe("");
      if (display.format === "json")
        for (const line of diagnostics.trim().split("\n").filter(Boolean))
          expect(() => JSON.parse(line)).not.toThrow();
    },
  );
test("overlapping real SDK calls retain their own UA and JSON diagnostics", async () => {
  const outsideLog = vi.spyOn(console, "log").mockImplementation(() => {});
  const first = context({ format: "text", quiet: true, verbose: false }, "first-client");
  const second = context({ format: "json", quiet: true, verbose: true }, "second-client");
  const requests: { hostname: string; agent: string | null }[] = [];
  vi.mocked(httpTransport.fetch).mockImplementation(async (url, init) => {
    const address = new URL(
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
    );
    requests.push({
      hostname: address.hostname,
      agent: new Headers(init?.headers).get("user-agent"),
    });
    return Response.json({ data: [{ id: address.hostname, name: "Fixture" }], has_more: false });
  });
  let releaseFirst!: () => void, releaseSecond!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const remote = async (name: string) => {
    const { config } = await resolveProjectConfigFromObject(
      {
        version: "1",
        agents: {},
        providers: {
          bailian: {
            api_key: "fixture-api-token",
            base_url: `https://${name}.fixture.invalid/v1/agentstudio`,
          },
        },
      },
      { projectName: "fixture", resolveEnv: false },
    );
    return createProjectRuntime({
      projectName: "fixture",
      config,
      state: StateManager.initialize(join(tmpdir(), `sdk-output-${randomUUID()}.json`)),
    });
  };
  const firstRun = withStdoutProtected(first.host, async () => {
    await firstGate;
    return listRemoteAgents(await remote("first"), { provider: "bailian", limit: 1 });
  });
  const secondRun = withStdoutProtected(second.host, async () => {
    await secondGate;
    return listRemoteAgents(await remote("second"), { provider: "bailian", limit: 1 });
  });
  void firstRun.catch(() => {});
  void secondRun.catch(() => {});
  releaseFirst();
  expect((await firstRun).data[0]!.id).toBe("first.fixture.invalid");
  console.log("outside SDK");
  releaseSecond();
  expect((await secondRun).data[0]!.id).toBe("second.fixture.invalid");
  expect(requests).toEqual([
    { hostname: "first.fixture.invalid", agent: "first-client/fixture-version" },
    { hostname: "second.fixture.invalid", agent: "second-client/fixture-version" },
  ]);
  expect(first.read().stderr).toBe("");
  expect(second.read().stderr).toContain("second.fixture.invalid");
  expect(second.read().stderr).not.toContain("first.fixture.invalid");
  for (const line of second.read().stderr.trim().split("\n"))
    expect(() => JSON.parse(line)).not.toThrow();
  expect(outsideLog).toHaveBeenCalledExactlyOnceWith("outside SDK");
  expect(rawOut + rawErr).toBe("");
});
test("SDK diagnostics scheduled after return still use their invocation channel", async () => {
  const current = context({ format: "json", quiet: true, verbose: true });
  let late!: Promise<void>;
  await withStdoutProtected(current.host, async () => {
    late = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log("[skill-upload] late diagnostic", "fixture-secret-key");
        resolve();
      }, 1);
    });
  });
  await late;
  expect(rawOut + rawErr).toBe("");
  expect(current.read().stderr).not.toContain("fixture-secret-key");
  expect(JSON.parse(current.read().stderr).debug).toBeDefined();
});
test("diagnostic writer failures never change SDK business success", async () => {
  const current = context({ format: "json", quiet: false, verbose: true });
  current.host.output.debug = () => {
    throw new Error("diagnostic failed");
  };
  await expect(
    withStdoutProtected(current.host, async () => {
      console.log("[skill-upload] diagnostic");
      return "business success";
    }),
  ).resolves.toBe("business success");
});
