import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "bailian-cli-commands";
import { readServiceMutationField } from "../e2e/knowledge/service-response.ts";

afterEach(() => vi.restoreAllMocks());
for (const nested of [false, true]) {
  test.each(["agent_id", "agent_version"] as const)(
    `Journey consumes %s from real quiet JSON and forwards it (nested=${nested})`,
    async (field) => {
      const data = { agent_id: "aid-one", agent_version: "2", agent_status: "draft" };
      const response = nested
        ? { request_id: "service-request", data }
        : { request_id: "service-request", ...data };
      const requests: unknown[] = [];
      vi.spyOn(httpTransport, "fetch").mockImplementation(async (_input, init) => {
        requests.push(JSON.parse(init?.body as string));
        return Response.json(response);
      });
      const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
      const settings = buildSettings({
        flags: { output: "json", quiet: true },
        file: { workspace_id: "ws-test" },
        env: {},
        configPath: "/tmp/service-journey/config.json",
      });
      const client = new Client({
        identity,
        settings,
        baseUrl: "https://fixture.invalid",
        apiCred: { token: "fixture-api-key", source: "flag", baseUrl: "https://fixture.invalid" },
      });
      const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
      async function run(command: AnyCommand, flags: Record<string, unknown>): Promise<string> {
        let stdout = "";
        const reporter = createOutputReporter({
          settings,
          localize,
          stdout: {
            write: (chunk) => {
              stdout += chunk;
            },
          },
          stderr: { write: () => {} },
        });
        await command.run({
          identity,
          settings,
          client,
          output: reporter.output,
          localize,
          flags,
        } as never);
        return stdout;
      }
      const stdout =
        field === "agent_id"
          ? await run(commands.knowledgeServiceCreate, { name: "Demo", scene: "search" })
          : await run(commands.knowledgeServiceDeploy, { agentId: "aid-one" });
      const value = readServiceMutationField(stdout, field);
      expect(value).toBe(field === "agent_id" ? "aid-one" : "2");
      if (field === "agent_id") {
        await run(commands.knowledgeServiceDelete, { agentId: value });
        expect(requests[1]).toEqual({ agent_id: "aid-one" });
      } else {
        await run(commands.knowledgeServiceGet, { agentId: "aid-one", agentVersion: value });
        expect(requests[1]).toEqual({ agent_id: "aid-one", agent_version: "2" });
      }
    },
  );
}
test.each(["aid-one\n", '"aid-one"', '{"data":{}}', '{"data":{"agent_id":7}}'])(
  "Journey rejects missing/non-JSON service identity: %s",
  (stdout) => {
    expect(() => readServiceMutationField(stdout, "agent_id")).toThrow();
  },
);

test("Journey reads the top-level string when the nested field is not a string", () => {
  expect(readServiceMutationField('{"data":{"agent_id":7},"agent_id":"aid-one"}', "agent_id")).toBe(
    "aid-one",
  );
});
