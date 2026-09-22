import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, isMemorySkillE2EReady } from "../helpers.ts";
import { memoryJourney } from "./live-helpers.ts";
import {
  memorySkillProjectId,
  type MemoryNodeDetailBody,
  type ProfileSchemaDetailBody,
  type ProfileSchemaListBody,
  type UserProfileBody,
} from "./shared.ts";

const observationProjects = () =>
  (process.env.BAILIAN_E2E_MEMORY_OBSERVATION_PROJECT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const otherLibrary = () => process.env.BAILIAN_E2E_MEMORY_OTHER_LIBRARY_ID?.trim();
const longTimeout = 600_000;

describe.skipIf(!isMemoryE2EReady())("memory positive scenarios (live)", () => {
  test.each([0, 180])(
    "wait=%s writes a node that can be read later",
    async (wait) => {
      const journey = memoryJourney();
      const content = `${journey.userId} 喜欢徒步旅行`;
      try {
        const receipt = await journey.add(["--content", content, "--wait", String(wait)]);
        // Read back even when the immediate receipt assertion fails, to allow async cleanup.
        const nodes = await journey.untilRows((rows) =>
          rows.some((node) => node.content === content),
        );
        expect(receipt.event_id).toBeTruthy();
        const node = nodes.find((item) => item.content === content)!;
        const detail = await journey.invoke<MemoryNodeDetailBody>([
          "node",
          "show",
          "--node-id",
          node.memory_node_id,
        ]);
        expect(detail.memory_node?.content).toBe(content);
      } finally {
        await journey.cleanup();
      }
    },
    longTimeout,
  );

  test(
    "content overrides conflicting messages; maximum 512-character content survives readback",
    async () => {
      const journey = memoryJourney();
      const content = `${journey.userId} 正文优先 `.padEnd(512, "好");
      try {
        await journey.add([
          "--content",
          content,
          "--messages",
          '[{"role":"user","content":"忽略此消息：用户最喜欢榴莲。"}]',
        ]);
        const nodes = await journey.untilRows((rows) =>
          rows.some((node) => node.content === content),
        );
        expect(nodes).toHaveLength(1);
        expect(nodes[0].content).toBe(content);
        expect(nodes[0].content).not.toContain("榴莲");
      } finally {
        await journey.cleanup();
      }
    },
    longTimeout,
  );

  test(
    "50-message extraction writes readable memories without a profile schema",
    async () => {
      const journey = memoryJourney();
      const messages = Array.from({ length: 50 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        content: index % 2 ? "记住了，您最喜欢游泳。" : "我最喜欢的运动是游泳，请记住。",
      }));
      try {
        await journey.add(["--messages", JSON.stringify(messages)]);
        const nodes = await journey.untilRows((rows) =>
          rows.some((node) => node.content.includes("游泳")),
        );
        expect(nodes.some((node) => node.content.includes("游泳"))).toBe(true);
      } finally {
        await journey.cleanup();
      }
    },
    longTimeout,
  );

  test(
    "OpenAI tool-call conversation is accepted and extracted",
    async () => {
      const journey = memoryJourney();
      const messages = [
        { role: "user", content: "请查询我的居住城市，并记住查询结果。" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_city",
              type: "function",
              function: { name: "get_user_city", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_city", content: "用户居住城市是杭州。" },
        { role: "assistant", content: "已记住您居住在杭州。" },
      ];
      try {
        await journey.add(["--messages", JSON.stringify(messages)]);
        const nodes = await journey.untilRows((rows) =>
          rows.some((node) => node.content.includes("杭州")),
        );
        expect(nodes.some((node) => node.content.includes("杭州"))).toBe(true);
      } finally {
        await journey.cleanup();
      }
    },
    longTimeout,
  );

  test.each(["lite", "pro", "default"])(
    "messages search with %s strategy enforces top-k and score",
    async (tier) => {
      const journey = memoryJourney();
      const content = `${journey.userId} 最喜欢的运动是游泳`;
      try {
        for (const suffix of ["周末去游泳", "最喜欢自由泳", "每次游泳一小时"])
          await journey.add(["--content", `${content}；${suffix}`]);
        const written = await journey.list();
        expect(written).toHaveLength(3);
        const plan = tier === "default" ? [] : ["--plan-version", tier];
        const base = [
          "--messages",
          JSON.stringify([{ role: "user", content: `${journey.userId} 的游泳习惯是什么？` }]),
          ...plan,
        ];
        const all = await journey.search([...base, "--top-k", "3", "--min-score", "0"]);
        expect(all).toHaveLength(3);
        expect(new Set(all.map((node) => node.memory_node_id))).toEqual(
          new Set(written.map((node) => node.memory_node_id)),
        );
        const top = await journey.search([...base, "--top-k", "1", "--min-score", "0"]);
        expect(top).toHaveLength(1);
        expect(written.map((node) => node.memory_node_id)).toContain(top[0].memory_node_id);
        const threshold = 0.8;
        const filtered = await journey.search([
          ...base,
          "--top-k",
          "3",
          "--min-score",
          String(threshold),
        ]);
        for (const node of filtered) {
          expect(typeof node.score).toBe("number");
          expect(node.score!, `Trace: ${journey.traceFile}`).toBeGreaterThanOrEqual(threshold);
          expect(written.map((item) => item.memory_node_id)).toContain(node.memory_node_id);
        }
        // Empty results are only evidence of filtering when baseline contains below-threshold scores.
        expect(all.every((node) => typeof node.score === "number")).toBe(true);
        for (const node of all.filter((item) => item.score! < threshold)) {
          expect(filtered.map((item) => item.memory_node_id)).not.toContain(node.memory_node_id);
        }
      } finally {
        await journey.cleanup();
      }
    },
    longTimeout,
  );

  test(
    "default library supports add/list/search/update/delete without library-id",
    async () => {
      // Empty string deliberately omits the library flag instead of using the configured library.
      const journey = memoryJourney("");
      const content = `${journey.userId} 默认库数据`;
      try {
        await journey.add(["--content", content]);
        const nodes = await journey.untilRows((rows) =>
          rows.some((node) => node.content === content),
        );
        const node = nodes.find((item) => item.content === content)!;
        const searched = await journey.search([
          "--query",
          content,
          "--min-score",
          "0",
          "--plan-version",
          "lite",
        ]);
        expect(searched.map((item) => item.memory_node_id)).toContain(node.memory_node_id);
        await journey.invoke([
          "update",
          "--node-id",
          node.memory_node_id,
          "--content",
          `${content}已更新`,
        ]);
        expect(
          (await journey.list()).find((item) => item.memory_node_id === node.memory_node_id)
            ?.content,
        ).toBe(`${content}已更新`);
      } finally {
        await journey.cleanup();
      }
      expect(await journey.list()).toEqual([]);
    },
    longTimeout,
  );

  test(
    "node pagination has no overlap or omissions, and user scopes are isolated",
    async () => {
      const owner = memoryJourney();
      const stranger = memoryJourney();
      try {
        for (const index of [1, 2, 3])
          await owner.add(["--content", `${owner.userId} 记忆条目${index}`]);
        await stranger.add(["--content", `${stranger.userId} 私有记忆`]);
        const all = await owner.list(["--page-size", "10"]);
        expect(all).toHaveLength(3);
        const pages = [];
        for (const page of [1, 2, 3])
          pages.push(...(await owner.list(["--page", String(page), "--page-size", "1"])));
        expect(new Set(pages.map((node) => node.memory_node_id)).size).toBe(3);
        expect(new Set(pages.map((node) => node.memory_node_id))).toEqual(
          new Set(all.map((node) => node.memory_node_id)),
        );
        expect(await owner.list(["--page", "4", "--page-size", "1"])).toEqual([]);
        const ownNodes = await stranger.list();
        expect(ownNodes).toHaveLength(1);
        const foreignQuery = await stranger.search([
          "--query",
          owner.userId,
          "--min-score",
          "0",
          "--plan-version",
          "lite",
        ]);
        for (const node of foreignQuery)
          expect(ownNodes.map((item) => item.memory_node_id)).toContain(node.memory_node_id);
        expect(
          ownNodes.some((node) => all.some((item) => item.memory_node_id === node.memory_node_id)),
        ).toBe(false);
      } finally {
        await Promise.all([owner.cleanup(), stranger.cleanup()]);
      }
    },
    longTimeout,
  );

  test(
    "schema maximum field lengths, empty profile and guaranteed cross-page enumeration",
    async () => {
      const journey = memoryJourney();
      const schemaIds: string[] = [];
      const attribute = {
        name: "属".repeat(32),
        description: "描".repeat(128),
        default_value: "值".repeat(128),
      };
      try {
        for (const index of [1, 2, 3]) {
          const created = await journey.invoke<{ profile_schema_id: string }>([
            "profile",
            "create",
            "--name",
            `${journey.userId.slice(-30)}${index}`.padEnd(32, "名"),
            "--attributes",
            JSON.stringify([index === 1 ? attribute : { name: "hobby" }]),
            "--plan-version",
            "lite",
          ]);
          schemaIds.push(created.profile_schema_id);
        }
        const schema = await journey.invoke<ProfileSchemaDetailBody>([
          "profile",
          "show",
          "--schema-id",
          schemaIds[0],
        ]);
        expect(schema.attributes).toEqual(
          expect.arrayContaining([expect.objectContaining(attribute)]),
        );
        const profile = await journey.invoke<UserProfileBody>([
          "profile",
          "get",
          "--schema-id",
          schemaIds[1],
          "--user-id",
          journey.userId,
        ]);
        expect(profile.profile).toBeDefined();
        expect(Array.isArray(profile.profile?.attributes)).toBe(true);
        for (const item of profile.profile!.attributes!)
          expect([undefined, null, ""]).toContain(item.value);
        const ids: string[] = [];
        let total = 0;
        for (let page = 1; page <= 1000; page += 1) {
          const result = await journey.invoke<ProfileSchemaListBody>([
            "profile",
            "list",
            "--page-size",
            "2",
            "--page",
            String(page),
          ]);
          expect(Array.isArray(result.profile_schemas)).toBe(true);
          expect(result.profile_schemas!.length).toBeLessThanOrEqual(2);
          expect(typeof result.total).toBe("number");
          if (page === 1) total = result.total!;
          expect(result.total).toBe(total);
          ids.push(...result.profile_schemas!.map((item) => item.profile_schema_id));
          if (ids.length >= total || result.profile_schemas!.length === 0) break;
        }
        expect(total).toBeGreaterThanOrEqual(3);
        expect(ids).toHaveLength(total);
        expect(new Set(ids).size).toBe(total);
        for (const schemaId of schemaIds) expect(ids).toContain(schemaId);
      } finally {
        for (const schemaId of schemaIds)
          await journey.invoke(["profile", "delete", "--schema-id", schemaId, "--yes"]);
      }
    },
    longTimeout,
  );
});

describe.skipIf(!isMemorySkillE2EReady())("memory mixed types (live)", () => {
  test(
    "observation + skill retrieval and deprecated memory-type alias",
    async () => {
      const journey = memoryJourney();
      const query = `${journey.userId} 会议纪要整理`;
      try {
        const observation = await journey.add(["--content", `${query}，用户喜欢简洁的纪要`]);
        const observationProject = observation.events?.find(
          (event) => event.resource_type === "custom_observation",
        )?.resource_id;
        expect(observationProject).toBeTruthy();
        await journey.add([
          "--content",
          `${query}：先提取议题再生成摘要`,
          "--project-id",
          memorySkillProjectId(),
          "--skill-name",
          "纪要整理",
          "--skill-description",
          "整理会议摘要",
          "--skill-tags",
          "meeting",
        ]);
        const base = [
          "--query",
          query,
          "--min-score",
          "0",
          "--top-k",
          "100",
          "--plan-version",
          "lite",
        ];
        base.push("--project-ids", observationProject!, "--project-ids", memorySkillProjectId());
        const mixed = await journey.search([
          ...base,
          "--memory-types",
          "observation",
          "--memory-types",
          "skill",
        ]);
        expect(new Set(mixed.map((node) => node.memory_type))).toEqual(
          new Set(["observation", "skill"]),
        );
        for (const type of ["observation", "skill"]) {
          const canonical = await journey.search([...base, "--memory-types", type]);
          const alias = await journey.search([...base, "--memory-type", type]);
          expect(canonical.length).toBeGreaterThan(0);
          expect(canonical.every((node) => node.memory_type === type)).toBe(true);
          expect(new Set(alias.map((node) => node.memory_node_id))).toEqual(
            new Set(canonical.map((node) => node.memory_node_id)),
          );
        }
      } finally {
        await journey.cleanup();
      }
    },
    longTimeout,
  );
});

describe.skipIf(!isMemoryE2EReady() || new Set(observationProjects()).size < 5)(
  "memory five observation projects (live; requires OBSERVATION_PROJECT_IDS)",
  () => {
    test(
      "five-project message extraction, project filtering and union search",
      async () => {
        const journey = memoryJourney();
        const projects = observationProjects().slice(0, 5);
        try {
          await journey.add([
            "--messages",
            '[{"role":"user","content":"我居住在杭州，最喜欢的运动是游泳。请记住。"}]',
            ...projects.flatMap((project) => ["--project-id", project]),
          ]);
          const projectNodes = new Map<string, string[]>();
          for (const project of projects) {
            const nodes = await journey.untilRows(
              (rows) => rows.length > 0,
              ["--project-id", project],
            );
            expect(nodes.every((node) => node.project_id === project)).toBe(true);
            projectNodes.set(
              project,
              nodes.map((node) => node.memory_node_id),
            );
          }
          const base = [
            "--query",
            "用户居住城市和喜欢的运动",
            "--min-score",
            "0",
            "--top-k",
            "100",
            "--plan-version",
            "lite",
          ];
          const selected = projects.slice(0, 2);
          const result = await journey.search([
            ...base,
            ...selected.flatMap((project) => ["--project-ids", project]),
          ]);
          expect(result.length).toBeGreaterThan(0);
          expect(new Set(result.map((node) => node.project_id))).toEqual(new Set(selected));
          for (const project of selected)
            for (const nodeId of projectNodes.get(project)!)
              expect(result.map((node) => node.memory_node_id)).toContain(nodeId);
          const alias = await journey.search([
            ...base,
            ...selected.flatMap((project) => ["--project-id", project]),
          ]);
          expect(new Set(alias.map((node) => node.memory_node_id))).toEqual(
            new Set(result.map((node) => node.memory_node_id)),
          );
        } finally {
          await journey.cleanup();
        }
      },
      longTimeout,
    );
  },
);

describe.skipIf(!isMemoryE2EReady() || !otherLibrary())(
  "memory cross-library isolation (live; requires OTHER_LIBRARY_ID)",
  () => {
    test(
      "same user ID cannot retrieve another library's data",
      async () => {
        const first = memoryJourney();
        const second = memoryJourney(otherLibrary(), first.userId);
        expect(otherLibrary()).not.toBe(process.env.BAILIAN_E2E_MEMORY_LIBRARY_ID?.trim());
        try {
          await first.add(["--content", `${first.userId} 第一记忆库`]);
          await second.add(["--content", `${first.userId} 第二记忆库`]);
          const firstNodes = await first.list();
          const secondNodes = await second.list();
          expect(firstNodes).toHaveLength(1);
          expect(secondNodes).toHaveLength(1);
          expect(firstNodes[0].content).toContain("第一记忆库");
          expect(secondNodes[0].content).toContain("第二记忆库");
          for (const journey of [first, second]) {
            const nodes = await journey.search([
              "--query",
              first.userId,
              "--min-score",
              "0",
              "--plan-version",
              "lite",
            ]);
            expect(nodes).toHaveLength(1);
            expect(nodes[0].memory_node_id).toBe(
              journey === first ? firstNodes[0].memory_node_id : secondNodes[0].memory_node_id,
            );
          }
        } finally {
          await Promise.all([first.cleanup(), second.cleanup()]);
        }
      },
      longTimeout,
    );
  },
);
