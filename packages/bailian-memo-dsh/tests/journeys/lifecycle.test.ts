import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  beginEnable,
  markActive,
  markPaused,
  readPersonalMemoryConfig,
  resumePersonalMemory,
  writePersonalMemoryConfig,
  assertWorkspaceBinding,
} from "../../src/personal-config.ts";
import { ensureInitialized } from "../../src/initialize.ts";
import { installAutomaticRecall } from "../../src/recall.ts";
import { installAuxiliaryCurator } from "../../src/curator.ts";
import { installTaskPoller, submitAddIntent } from "../../src/task-store.ts";
import { createMemoTools } from "../../src/tools.ts";
import { CloudHarness, FileTaskStore, config, eventually, host, liveEnabled } from "./harness.ts";

const isolated = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => {
    if (!isolated.home) throw new Error("Real home forbidden");
    return isolated.home;
  },
}));

async function active(harness: CloudHarness) {
  isolated.home = harness.home;
  const personal = await beginEnable({ workspaceId: harness.workspace }, harness.path);
  harness.userId = personal.user_id!;
  await harness.client.list({ userId: harness.userId });
  await markActive(harness.path);
}
async function journey(id: string, run: (harness: CloudHarness) => Promise<void>) {
  const harness = await new CloudHarness().init();
  let passed = false;
  try {
    await run(harness);
    passed = true;
  } finally {
    await harness.finish(id, passed);
    isolated.home = "";
  }
}

describe.skipIf(!liveEnabled)("real cloud + controlled host lifecycle (not actual dsh)", () => {
  it("J6 keeps pause across recreated lifecycle, resumes same identity without backfill", async () => {
    await journey("J6", async (harness) => {
      await active(harness);
      await markPaused("journey pause", harness.path);
      const restarted = host(harness, "暂停期间我最喜欢的饮料是黑咖啡。");
      const store = new FileTaskStore(join(harness.home, "tasks.json"));
      await ensureInitialized(harness.client);
      const beforeRequests = harness.requests;
      installAutomaticRecall(restarted.context, {
        client: harness.client,
        resolveConfig: () => config,
      });
      installAuxiliaryCurator(restarted.context, {
        client: harness.client,
        store,
        resolveConfig: () => config,
      });
      const signal = AbortSignal.timeout(30000);
      const decision = { kind: "enter", messages: [] };
      expect(
        await restarted.hooks.get("agent/pre-step")!(
          {
            agent: restarted.agent,
            turn: 1,
            step: 0,
            signal,
            messages: [{ content: [{ type: "text", text: "Recall paused facts" }] }],
          },
          async () => decision,
        ),
      ).toBe(decision);
      await restarted.hooks.get("agent/turn-stopping")!({
        agent: restarted.agent,
        turn: 1,
        signal,
      });
      expect(harness.requests).toBe(beforeRequests);
      expect(harness.modelCalls).toBe(0);
      expect(await store.listRecent()).toEqual([]);
      const resumed = await resumePersonalMemory(harness.path);
      expect(resumed.user_id).toBe(harness.userId);
      expect(resumed.status).toBe("active");
      const task = await submitAddIntent({
        client: harness.client,
        store,
        userId: harness.userId,
        operationId: "J6:resume:new-call",
        messages: [{ role: "user", content: "我长期最喜欢的饮料是茉莉花茶。" }],
      });
      expect(task.eventId).toBeTruthy();
      await harness.settle(task.eventId!);
      const nodes = await eventually(
        () => harness.nodes(),
        (rows) => rows.some((row) => row.content?.includes("茉莉")),
      );
      expect(nodes.some((row) => row.content?.includes("咖啡"))).toBe(false);
      harness.steps.push(
        "persist pause",
        "recreate hooks: no network or model",
        "resume unchanged identity",
        "new fact stored, paused fact absent",
      );
    });
  }, 600000);

  it("J7 migrates shared v2 metadata and reads plugin/direct writes bidirectionally", async () => {
    await journey("J7", async (harness) => {
      await active(harness);
      const schema = await harness.request<{ profile_schema_id: string }>(
        "POST",
        "profile_schemas",
        {
          name: `journey_${randomUUID().slice(0, 12)}`,
          attributes: [{ name: "favorite_drink", description: "用户最喜欢的饮料" }],
          extract_scene: "efficient",
          plan_version: "pro",
        },
      );
      expect(schema.profile_schema_id).toBeTruthy();
      harness.schemas.add(schema.profile_schema_id);
      await writePersonalMemoryConfig(
        {
          ...(await readPersonalMemoryConfig(harness.path)),
          schema_version: 2,
          profile_schema_id: schema.profile_schema_id,
          profile_schema_version: 1,
        },
        harness.path,
      );
      await markPaused("skill migration", harness.path);
      await resumePersonalMemory(harness.path);
      const migrated = JSON.parse(await readFile(harness.path, "utf8"));
      expect(migrated).toMatchObject({
        schema_version: 3,
        user_id: harness.userId,
        profile_schema_id: schema.profile_schema_id,
        profile_schema_version: 1,
        status: "active",
      });
      await harness.client.getProfile({
        schemaId: schema.profile_schema_id,
        userId: harness.userId,
      });
      const direct = await harness.request<{ event_id: string }>("POST", "add-async", {
        user_id: harness.userId,
        messages: [{ role: "user", content: "我长期最喜欢的运动是羽毛球。" }],
      });
      harness.events.add(direct.event_id);
      await harness.settle(direct.event_id);
      await eventually(
        () => harness.client.search({ userId: harness.userId, query: "喜欢什么运动", topK: 10 }),
        (response) =>
          (response.memory_nodes ?? []).some((node) => node.content?.includes("羽毛球")),
      );
      const submitted = await harness.client.addAsync({
        userId: harness.userId,
        messages: [{ role: "user", content: "我通常每天早上七点起床。" }],
      });
      await harness.settle(submitted.event_id!);
      await eventually(
        () => harness.nodes(),
        (rows) =>
          rows.some((node) => node.content?.includes("七点") || node.content?.includes("7")),
      );
      const before = harness.requests;
      expect(() => assertWorkspaceBinding("wrong-workspace", harness.workspace)).toThrow(
        /mismatch/,
      );
      await writePersonalMemoryConfig(
        { ...(await readPersonalMemoryConfig(harness.path)), workspace_id: "wrong-workspace" },
        harness.path,
      );
      try {
        await expect(
          harness.client.search({ userId: harness.userId, query: "fact" }),
        ).rejects.toThrow(/mismatch/);
        expect(harness.requests).toBe(before);
      } finally {
        await writePersonalMemoryConfig(
          { ...(await readPersonalMemoryConfig(harness.path)), workspace_id: harness.workspace },
          harness.path,
        );
      }
      harness.steps.push(
        "v2 -> v3 retains Skill schema",
        "direct write -> plugin search",
        "plugin write -> direct list",
        "binding mismatch blocked before HTTP",
      );
    });
  }, 600000);

  it("J8 live curator, task recovery and explicit remember-forget-remember", async (test) => {
    if (!process.env.BAILIAN_MEMORY_CURATOR_MODEL) {
      const blocked = await new CloudHarness().init();
      blocked.blockers.push(
        "J8 BLOCKED: BAILIAN_MEMORY_CURATOR_MODEL required for live automatic curation",
      );
      await blocked.finish("J8", false);
      test.skip("Live curator model not configured; deterministic flow is not live acceptance");
    }
    await journey("J8", async (harness) => {
      await active(harness);
      const current = host(harness, "我长期喜欢在周末去徒步旅行，这是我稳定的个人爱好。");
      const path = join(harness.home, "tasks.json");
      const store = new FileTaskStore(path);
      installAuxiliaryCurator(current.context, {
        client: harness.client,
        store,
        resolveConfig: () => config,
      });
      await current.hooks.get("agent/turn-stopping")!({
        agent: current.agent,
        turn: 1,
        signal: AbortSignal.timeout(110000),
      });
      expect(current.events.at(-1)?.data).toMatchObject({ committed: true });
      expect(harness.modelCalls).toBe(1);
      const saved = await store.listOpen();
      expect(saved).toHaveLength(1);
      expect(saved[0]?.eventId).toBeTruthy();

      const reopened = new FileTaskStore(path);
      const recovery = host(harness, "");
      installTaskPoller(recovery.context, reopened, harness.client);
      try {
        const records = await eventually(
          () => reopened.listRecent(),
          (rows) => rows.length > 0 && rows.every((row) => row.status.startsWith("succeeded")),
        );
        expect(records[0]?.resultCount).toBeGreaterThan(0);
      } finally {
        for (const dispose of recovery.disposals) await dispose();
      }
      await eventually(
        () => harness.nodes(),
        (nodes) => nodes.some((node) => node.content?.includes("徒步")),
      );

      const temporary = host(
        harness,
        "这只是本次任务的临时要求：请计算 17 加 23，不代表我的个人资料或长期偏好。",
      );
      const beforeTemporary = harness.events.size;
      installAuxiliaryCurator(temporary.context, {
        client: harness.client,
        store: reopened,
        resolveConfig: () => config,
      });
      await temporary.hooks.get("agent/turn-stopping")!({
        agent: temporary.agent,
        turn: 1,
        signal: AbortSignal.timeout(110000),
      });
      expect(temporary.events.at(-1)?.data).toMatchObject({ committed: false });
      expect(harness.events.size).toBe(beforeTemporary);
      expect(harness.modelCalls).toBe(2);
      expect(harness.modelActions).toEqual(["commit", "skip"]);
      harness.steps.push("real curator skips transient task without submission");

      current.events.push({
        type: "turn/start",
        seq: current.events.length + 1,
        data: { turn: 2 },
      });
      const tools = createMemoTools({
        ctx: current.context,
        client: harness.client,
        store: reopened,
        resolveConfig: () => config,
      });
      const execute = (tool: unknown, args: unknown, callId: string) =>
        (tool as { execute: (args: unknown, execution: unknown) => Promise<unknown> }).execute(
          args,
          {
            agent: current.agent,
            callId,
            signal: AbortSignal.timeout(30000),
          },
        );
      const text = "我长期最喜欢的饮料是普洱茶。";
      await execute(tools.remember, { text }, "remember-first");
      const first = (await reopened.listRecent()).find(
        (entry) => entry.note === "explicit-remember",
      )!;
      await harness.settle(first.eventId!);
      const modelsBefore = harness.modelCalls;
      await current.hooks.get("agent/turn-stopping")!({
        agent: current.agent,
        turn: 2,
        signal: AbortSignal.timeout(30000),
      });
      expect(harness.modelCalls).toBe(modelsBefore);
      expect(current.events.at(-1)?.data.reason).toBe("explicit remember already submitted");
      const nodes = await eventually(
        () => harness.nodes(),
        (rows) => rows.some((node) => node.content?.includes("普洱")),
      );
      for (const node of nodes.filter((entry) => entry.content?.includes("普洱"))) {
        await execute(
          tools.forget,
          { query: "普洱茶", node_id: node.memory_node_id },
          `forget-${node.memory_node_id}`,
        );
      }
      await eventually(
        () => harness.nodes(),
        (rows) => !rows.some((node) => node.content?.includes("普洱")),
      );
      await execute(tools.remember, { text }, "remember-after-forget");
      const second = (await reopened.listRecent()).find(
        (entry) => entry.note === "explicit-remember",
      )!;
      expect(second.intentId).not.toBe(first.intentId);
      await harness.settle(second.eventId!);
      await eventually(
        () => harness.nodes(),
        (rows) => rows.some((node) => node.content?.includes("普洱")),
      );
      harness.steps.push(
        "real model through curator hook",
        "reopened filesystem task store -> real poller terminal",
        "readback",
        "same-turn suppression",
        "explicit forget then identical remember restored",
      );
    });
  }, 600000);
});
