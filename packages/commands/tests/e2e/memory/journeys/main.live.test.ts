import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vite-plus/test";
import { eventually, journey, liveBudget, liveEnabled, profileText } from "./helpers.ts";

describe.skipIf(!liveEnabled())("Memory J1–J5 (real cloud, isolated CLI subprocesses)", () => {
  test(
    "J1 first message extraction reaches terminal state and is recalled",
    async () =>
      journey("J1", async (fixture) => {
        await fixture.add("请记住，我最喜欢的运动是徒步旅行。");
        const rows = await eventually(
          () => fixture.list(),
          (nodes) => nodes.some((node) => /徒步/.test(node.content)),
          "extracted hiking fact",
        );
        const node = rows.find((candidate) => /徒步/.test(candidate.content))!;
        expect((await fixture.detail(node.memory_node_id)).memory_node?.content).toMatch(/徒步/);
        await eventually(
          () => fixture.search("我最喜欢什么运动？"),
          (nodes) => nodes.some((hit) => /徒步/.test(hit.content)),
          "semantic recall",
        );
      }),
    liveBudget,
  );

  test(
    "J2 fresh process recalls without answer leakage and isolates another user",
    async () =>
      journey("J2", async (fixture) => {
        await fixture.add("我最喜欢的饮品是无糖茉莉花茶，请长期记住。");
        const hits = await eventually(
          () => fixture.search("我喜欢喝什么？"),
          (nodes) => nodes.some((node) => /茉莉/.test(node.content)),
          "fresh reader recall",
        );
        const outsider = `journey-${randomUUID()}`;
        const outsiderHits = await fixture.search("我喜欢喝什么？", outsider);
        const ownedIds = new Set(hits.map((node) => node.memory_node_id));
        expect(outsiderHits.some((node) => ownedIds.has(node.memory_node_id))).toBe(false);
        expect(await fixture.list(outsider)).toEqual([]);
      }),
    liveBudget,
  );

  test(
    "J3 a later correction becomes a searchable current preference",
    async () =>
      journey("J3", async (fixture) => {
        await fixture.add("请记住，我当前最喜欢的运动是徒步。");
        await eventually(
          () => fixture.search("当前最喜欢的运动是什么？"),
          (nodes) => nodes.some((node) => /徒步/.test(node.content)),
          "initial preference",
        );
        await fixture.add(
          "更新我的长期偏好：我以前最喜欢徒步，但现在已经改成游泳。游泳是我当前最喜欢的运动，徒步只是过去的偏好。",
        );
        await eventually(
          () => fixture.list(),
          (nodes) => nodes.some((node) => /游泳/.test(node.content)),
          "corrected node",
        );
        await eventually(
          () => fixture.search("当前最喜欢的运动是什么？"),
          (nodes) => nodes.some((node) => /游泳/.test(node.content)),
          "corrected recall",
        );
      }),
    liveBudget,
  );

  test(
    "J4 forget removes only the target and a new write restores it",
    async () =>
      journey("J4", async (fixture) => {
        const target = "用户最喜欢的饮品是无糖茉莉花茶。";
        const originalEvent = await fixture.add(target, { direct: true });
        await fixture.add("用户每周日固定练习书法。", { direct: true });
        const rows = await eventually(
          () => fixture.list(),
          (nodes) => nodes.length >= 2,
          "two independent facts",
        );
        const removed = rows.find((node) => node.content === target)!;
        expect(removed).toBeDefined();
        await fixture.remove(removed.memory_node_id);
        const detail = await fixture.detail(removed.memory_node_id);
        expect(detail.memory_node?.status).toBe("delete");
        await eventually(
          () => fixture.list(),
          (nodes) =>
            !nodes.some(
              (node) => node.memory_node_id === removed.memory_node_id && node.status !== "delete",
            ) && nodes.some((node) => /书法/.test(node.content)),
          "target removed, control retained",
        );
        await eventually(
          () => fixture.search("我喜欢的饮品是什么？"),
          (nodes) =>
            !nodes.some(
              (node) => node.memory_node_id === removed.memory_node_id || /茉莉/.test(node.content),
            ),
          "deleted fact not recalled",
        );
        const newEvent = await fixture.add(target, { direct: true });
        expect(newEvent).not.toBe(originalEvent);
        await eventually(
          () => fixture.search("我喜欢的饮品是什么？"),
          (nodes) => nodes.some((node) => /茉莉/.test(node.content)),
          "remembered again",
        );
      }),
    liveBudget,
  );

  test(
    "J5 profile values are extracted and evolve after a correction",
    async () =>
      journey("J5", async (fixture) => {
        const schemaId = await fixture.createProfile();
        expect(profileText(await fixture.profile(schemaId))).toBe("");
        await fixture.add("请记住，我目前最喜欢的运动是徒步旅行。", { schemaId });
        await eventually(
          () => fixture.profile(schemaId),
          (profile) => /徒步/.test(profileText(profile)),
          "first profile value",
        );
        await fixture.add(
          "更正个人资料：我现在最喜欢的运动是游泳，以前喜欢徒步，现在已经不喜欢徒步了。请把当前最喜欢的运动更新为游泳。",
          { schemaId },
        );
        await eventually(
          () => fixture.profile(schemaId),
          (profile) => /游泳/.test(profileText(profile)) && !/徒步/.test(profileText(profile)),
          "current profile value",
        );
        await eventually(
          () => fixture.search("我现在最喜欢什么运动？"),
          (nodes) => nodes.some((node) => /游泳/.test(node.content)),
          "observation from joint extraction",
        );
      }),
    liveBudget,
  );
});
