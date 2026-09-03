import { describe, expect, it, vi } from "vite-plus/test";
import type { ServiceListResponse } from "../src/api-types.js";
import type { KbClient } from "../src/client.js";
import { listServices } from "../src/services.js";

/** A page of `count` rows, all deployed unless overridden. */
function page(
  count: number,
  total: number,
  overrides: Record<string, unknown> = {},
): ServiceListResponse {
  return {
    code: "Success",
    data: {
      total_count: total,
      rows: Array.from({ length: count }, (_row, index) => ({
        agent_id: `aid-${index}`,
        agent_name: `service-${index}`,
        agent_status: "deployed",
        modify_time: "2026-08-20T10:00:00",
        ...overrides,
      })),
    },
  };
}

/** A client whose postJson is driven by a queue of per-call responses or errors. */
function clientReturning(...outcomes: (ServiceListResponse | Error)[]): {
  client: KbClient;
  postJson: ReturnType<typeof vi.fn>;
} {
  const postJson = vi.fn(async () => {
    const next = outcomes.shift();
    if (next === undefined) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: { postJson } as unknown as KbClient, postJson };
}

describe("listServices", () => {
  it("queries both scenes for deployed services only and tags each entry with its scene", async () => {
    const { client, postJson } = clientReturning(page(1, 1), page(1, 1));
    const result = await listServices(client);

    expect(postJson.mock.calls[0]?.[1]).toMatchObject({
      agent_scene: "search",
      // Verified server-side: this filter is honored and excludes drafts.
      agent_status: "deployed",
      page_number: 1,
      page_size: 100,
    });
    expect(postJson.mock.calls[1]?.[1]).toMatchObject({ agent_scene: "chat" });
    expect(result.entries.map((e) => e.scene)).toEqual(["search", "chat"]);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.failedScenes).toEqual([]);
  });

  it("stops at a short page without asking for another", async () => {
    // 3 rows on a 100-row page is the last page; a second request would be waste.
    const { client, postJson } = clientReturning(page(3, 3), page(0, 0));
    const result = await listServices(client);
    expect(postJson).toHaveBeenCalledTimes(2); // one per scene, not one per page
    expect(result.entries).toHaveLength(3);
  });

  it("caps at two pages per scene and reports the shortfall as truncated", async () => {
    // A workspace claiming 500 rows: fetch 200, flag the rest as unfetched.
    const { client, postJson } = clientReturning(page(100, 500), page(100, 500), page(0, 0));
    const result = await listServices(client);
    // 2 pages for search + 1 short page for chat: the cap holds.
    expect(postJson).toHaveBeenCalledTimes(3);
    expect(result.entries).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });

  it("keeps one scene when the other fails instead of losing the whole list", async () => {
    const { client } = clientReturning(page(2, 2), new Error("chat scene exploded"));
    const result = await listServices(client);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.scene === "search")).toBe(true);
    expect(result.failedScenes).toEqual(["chat"]);
  });

  it("reports both scenes as failed without throwing", async () => {
    const { client } = clientReturning(new Error("down"), new Error("down"));
    const result = await listServices(client);
    expect(result.entries).toEqual([]);
    expect(result.failedScenes).toEqual(["search", "chat"]);
  });

  it("drops rows without an agent_id and never reads pipeline_list", async () => {
    // pipeline_list is unreliable in production (missing names, sometimes empty),
    // so entries must not carry any knowledge-base label derived from it.
    const { client } = clientReturning(
      {
        code: "Success",
        data: {
          total_count: 2,
          rows: [
            { agent_name: "no id", agent_status: "deployed" },
            {
              agent_id: "aid-1",
              agent_name: "ok",
              agent_status: "deployed",
              pipeline_list: [{ pipeline_id: "p1" }],
            },
          ],
        },
      },
      page(0, 0),
    );
    const result = await listServices(client);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      agent_id: "aid-1",
      agent_name: "ok",
      scene: "search",
      status: "deployed",
    });
    expect(JSON.stringify(result.entries)).not.toContain("p1");
  });
});
