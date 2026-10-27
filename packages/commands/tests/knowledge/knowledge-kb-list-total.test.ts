import { expect, test, vi } from "vite-plus/test";
import command from "../../src/commands/knowledge/kb-list.ts";

test("text output uses the observed total_count rather than the current page length", async () => {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    await command.run({
      flags: { workspaceId: "ws" },
      settings: { output: "text" },
      client: {
        requestJson: async () => ({
          data: { rows: [{ id: "index", name: "test" }], total_count: 42 },
        }),
      },
    } as unknown as Parameters<typeof command.run>[0]);
    expect(stdout.mock.calls.map(([text]) => text).join("")).toContain("total: 42");
  } finally {
    stdout.mockRestore();
  }
});
