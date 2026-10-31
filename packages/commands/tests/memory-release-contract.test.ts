import { createOutputReporter } from "bailian-cli-runtime";
import { expect, test, vi } from "vite-plus/test";
import { ExitCode } from "bailian-cli-core";
import create from "../src/commands/memory/profile-create.ts";
import update from "../src/commands/memory/profile-update.ts";
import { parseJsonArrayFlag } from "../src/commands/memory/shared.ts";

// JSON is untrusted: TypeScript casts must not let invalid payloads reach transport.
test.each([null, 1, "text", [], true].map((entry) => [entry]))(
  "rejects non-object array member %j",
  (entry) => {
    expect(() => parseJsonArrayFlag("--messages", JSON.stringify([entry]))).toThrow(
      expect.objectContaining({ exitCode: ExitCode.USAGE }),
    );
  },
);
for (const command of [create, update]) {
  test.each([
    { name: 1 },
    { name: "field", description: [] },
    { name: "field", default_value: {} },
  ])(
    `${command === create ? "create" : "update"} rejects wrong attribute types before transport: %j`,
    async (attribute) => {
      const requestJson = vi.fn();
      const flags =
        command === create
          ? { name: "schema", attributes: JSON.stringify([attribute]), workspaceId: "ws_test" }
          : {
              schemaId: "schema",
              attributesOperations: JSON.stringify([{ op: "add", ...attribute }]),
              workspaceId: "ws_test",
            };
      await expect(
        command.run({
          flags,
          settings: { output: "json" },
          client: { requestJson },
          output: createOutputReporter({
            settings: { output: "json", quiet: false, verbose: false },
          }).output,
        } as never),
      ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
      expect(requestJson).not.toHaveBeenCalled();
    },
  );
}
