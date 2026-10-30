import { expect, test, vi } from "vite-plus/test";
import memoryAdd from "../src/commands/memory/add.ts";

test("user_profile text output identifies the attribute and its change", async () => {
  const output: string[] = [];
  const writer = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  const requestJson = vi
    .fn()
    .mockResolvedValueOnce({ request_id: "submit", event_id: "event1", events: [] })
    .mockResolvedValueOnce({
      request_id: "poll",
      events: [
        {
          resource_type: "user_profile",
          resource_id: "schema1",
          status: "SUCCEEDED",
          result: [{ memory_type: "user_profile", name: "爱好", content: "游泳", event: "ADD" }],
        },
      ],
    });
  try {
    await memoryAdd.run({
      flags: { userId: "user1", content: "fact", workspaceId: "workspace1" },
      settings: { output: "text" },
      client: { requestJson },
    } as unknown as Parameters<typeof memoryAdd.run>[0]);
    expect(output.join("")).toContain("爱好");
    expect(output.join("")).toContain("游泳");
    expect(output.join("")).toContain("user_profile");
  } finally {
    writer.mockRestore();
  }
});
