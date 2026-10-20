import { expect, test, vi } from "vite-plus/test";
import { MemoryJourney } from "./e2e/memory/journeys/helpers.ts";

test("cleanup deletes known event nodes even while list is empty", async () => {
  const fixture = new MemoryJourney("cleanup-unit");
  fixture.nodes.add("known-but-not-listed");
  const command = vi.spyOn(fixture, "command").mockResolvedValue({});
  vi.spyOn(fixture, "list").mockResolvedValue([]);
  await fixture.cleanup();
  expect(command).toHaveBeenCalledWith(
    "delete",
    ["delete", "--node-id", "known-but-not-listed", "--yes"],
    true,
  );
});

test("an ambiguous profile creation cannot report clean success", async () => {
  const fixture = new MemoryJourney("schema-uncertain-unit");
  vi.spyOn(fixture, "command")
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValue({});
  vi.spyOn(fixture, "list").mockResolvedValue([]);
  await expect(fixture.createProfile()).rejects.toThrow("response lost");
  await expect(fixture.cleanup()).rejects.toThrow("Cleanup incomplete");
});
