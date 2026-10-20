import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "vite-plus/test";
import { makeE2eOutputDir, parseStdoutJson, runCommandE2e } from "../../helpers.ts";
import { MEMORY_DELETE_ROUTES, MEMORY_PROFILE_DELETE_ROUTES } from "../../topic-routes.ts";
import type {
  MemoryAddBody,
  MemoryNodeDetailBody,
  MemoryNodeListBody,
  UserProfileBody,
} from "../shared.ts";

const routes = { ...MEMORY_DELETE_ROUTES, ...MEMORY_PROFILE_DELETE_ROUTES };
export type MemoryNode = NonNullable<MemoryNodeListBody["memory_nodes"]>[number];
export const liveEnabled = () => process.env.BAILIAN_MEMORY_JOURNEYS === "1";
export const liveBudget = 600_000;

export async function eventually<Value>(
  read: () => Promise<Value>,
  matches: (value: Value) => boolean,
  label: string,
  timeoutMs = 120_000,
): Promise<Value> {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await read();
    if (matches(value)) return value;
    await delay(2000);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}`);
}

export function profileText(profile: UserProfileBody): string {
  return (profile.profile?.attributes ?? [])
    .flatMap((attribute) =>
      attribute.value_items?.length
        ? attribute.value_items
            .filter((item) => item.status !== "delete")
            .map((item) => item.value ?? "")
        : [attribute.value ?? ""],
    )
    .join("\n");
}

/** Synthetic identities only. Resources are recorded before assertions can fail. */
export class MemoryJourney {
  readonly userId = `journey-${randomUUID()}`;
  readonly outputDir: string;
  readonly events = new Set<string>();
  readonly schemas = new Set<string>();
  readonly nodes = new Set<string>();
  private readonly steps: Array<{
    label: string;
    durationMs: number;
    result?: unknown;
    error?: string;
  }> = [];
  private readonly pending = new Set<string>();
  private readonly deleted = new Set<string>();
  private cleanupErrors: string[] = [];
  private uncertainSubmission = false;
  private readonly uncertainSchemas = new Set<string>();
  private outcome: "RUNNING" | "PASS" | "FAIL" = "RUNNING";

  constructor(readonly journeyId: string) {
    this.outputDir = makeE2eOutputDir(`memory-${journeyId}-${this.userId}`);
    this.flush();
  }

  private flush() {
    writeFileSync(
      join(this.outputDir, "evidence.json"),
      JSON.stringify(
        {
          journey: this.journeyId,
          layer: "live-cli",
          userId: this.userId,
          events: [...this.events],
          pending: [...this.pending],
          schemas: [...this.schemas],
          nodes: [...this.nodes],
          deleted: [...this.deleted],
          cleanupErrors: this.cleanupErrors,
          uncertainSubmission: this.uncertainSubmission,
          uncertainSchemas: [...this.uncertainSchemas],
          outcome: this.outcome,
          steps: this.steps,
        },
        null,
        2,
      ),
    );
  }

  async command<Value>(label: string, args: string[], allowMissing = false): Promise<Value> {
    const started = Date.now();
    const result = await runCommandE2e(routes, [
      "memory",
      ...args,
      "--workspace-id",
      process.env.BAILIAN_WORKSPACE_ID!.trim(),
      "--output",
      "json",
      "--timeout",
      "30",
    ]);
    this.steps.push({ label, durationMs: Date.now() - started, result });
    this.flush();
    if (allowMissing && result.exitCode !== 0) {
      try {
        const failure = JSON.parse(result.stderr);
        if (failure.error?.http_status === 404) return {} as Value;
      } catch {
        /* Preserve the original command failure below. */
      }
    }
    expect(result.exitCode, `${label}: ${result.stderr}; evidence ${this.outputDir}`).toBe(0);
    return parseStdoutJson<Value>(result.stdout);
  }

  async list(userId = this.userId): Promise<MemoryNode[]> {
    const all: MemoryNode[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const result = await this.command<MemoryNodeListBody>("list", [
        "list",
        "--user-id",
        userId,
        "--page",
        String(page),
        "--page-size",
        "100",
      ]);
      expect(Array.isArray(result.memory_nodes)).toBe(true);
      const rows = result.memory_nodes!;
      all.push(...rows);
      if (userId === this.userId) for (const node of rows) this.nodes.add(node.memory_node_id);
      this.flush();
      if (rows.length === 0 || (result.total !== undefined && all.length >= result.total))
        return all;
    }
    throw new Error("Incomplete node pagination");
  }

  async search(query: string, userId = this.userId): Promise<MemoryNode[]> {
    const result = await this.command<MemoryNodeListBody>("search", [
      "search",
      "--user-id",
      userId,
      "--query",
      query,
      "--memory-types",
      "observation",
      "--min-score",
      "0",
      "--top-k",
      "20",
      "--plan-version",
      "pro",
    ]);
    expect(Array.isArray(result.memory_nodes)).toBe(true);
    if (userId === this.userId)
      for (const node of result.memory_nodes!) this.nodes.add(node.memory_node_id);
    this.flush();
    return result.memory_nodes!;
  }

  async settle(eventId: string): Promise<NonNullable<MemoryAddBody["events"]>> {
    const started = Date.now();
    const result = await eventually(
      async () => {
        const response = await fetch(
          `https://${process.env.BAILIAN_WORKSPACE_ID!.trim()}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/events/${encodeURIComponent(eventId)}`,
          {
            headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
            signal: AbortSignal.timeout(30_000),
          },
        );
        expect(response.ok, `event status HTTP ${response.status}`).toBe(true);
        const body = (await response.json()) as MemoryAddBody;
        for (const event of body.events ?? [])
          for (const item of event.result ?? [])
            if (item.memory_node_id) this.nodes.add(item.memory_node_id);
        this.flush();
        return body;
      },
      (body) =>
        Boolean(body.events?.length) &&
        body.events!.every((event) =>
          ["SUCCEEDED", "SUCCESS", "UNRECORDED", "FAILED"].includes(event.status ?? ""),
        ),
      "event terminal status",
      180_000,
    );
    this.pending.delete(eventId);
    this.steps.push({ label: "event terminal", durationMs: Date.now() - started, result });
    this.flush();
    return result.events!;
  }

  async add(text: string, options: { direct?: boolean; schemaId?: string } = {}): Promise<string> {
    const payload = options.direct
      ? ["--content", text]
      : ["--messages", JSON.stringify([{ role: "user", content: text }])];
    this.uncertainSubmission = true;
    this.flush();
    const receipt = await this.command<MemoryAddBody>("add", [
      "add",
      "--user-id",
      this.userId,
      ...payload,
      ...(options.schemaId ? ["--profile-schema", options.schemaId] : []),
      "--wait",
      "0",
    ]);
    expect(receipt.event_id).toBeTruthy();
    this.events.add(receipt.event_id!);
    this.pending.add(receipt.event_id!);
    this.uncertainSubmission = false;
    this.flush();
    const events = await this.settle(receipt.event_id!);
    expect(
      events.some((event) => event.status === "FAILED"),
      JSON.stringify(events),
    ).toBe(false);
    expect(events.some((event) => ["SUCCEEDED", "SUCCESS"].includes(event.status ?? ""))).toBe(
      true,
    );
    return receipt.event_id!;
  }

  async remove(nodeId: string, allowMissing = false) {
    expect(this.nodes.has(nodeId), "may only delete this journey's nodes").toBe(true);
    await this.command("delete", ["delete", "--node-id", nodeId, "--yes"], allowMissing);
    this.deleted.add(nodeId);
    this.flush();
  }

  async detail(nodeId: string) {
    return this.command<MemoryNodeDetailBody>("node show", ["node", "show", "--node-id", nodeId]);
  }

  async createProfile(): Promise<string> {
    const name = `journey_${randomUUID().slice(0, 16)}`;
    this.uncertainSchemas.add(name);
    this.flush();
    const result = await this.command<{ profile_schema_id: string }>("profile create", [
      "profile",
      "create",
      "--name",
      name,
      "--attributes",
      JSON.stringify([
        { name: "current_favorite_sport", description: "用户当前最喜欢的运动，仅保留最新偏好" },
      ]),
      "--extract-scene",
      "efficient",
      "--plan-version",
      "pro",
    ]);
    expect(result.profile_schema_id).toBeTruthy();
    this.schemas.add(result.profile_schema_id);
    this.uncertainSchemas.delete(name);
    this.flush();
    return result.profile_schema_id;
  }

  async profile(schemaId: string) {
    return this.command<UserProfileBody>("profile get", [
      "profile",
      "get",
      "--schema-id",
      schemaId,
      "--user-id",
      this.userId,
    ]);
  }

  async cleanup() {
    const failed = (error: unknown) => {
      this.cleanupErrors.push(error instanceof Error ? error.message : String(error));
      this.flush();
    };
    for (const eventId of this.pending) {
      try {
        await this.settle(eventId);
      } catch (error) {
        failed(error);
      }
    }
    for (const nodeId of this.nodes) {
      if (this.deleted.has(nodeId)) continue;
      try {
        await this.remove(nodeId, true);
      } catch (error) {
        failed(error);
      }
    }
    try {
      for (let round = 0; round < 10; round += 1) {
        const active = (await this.list()).filter((node) => node.status !== "delete");
        if (!active.length) break;
        for (const node of active) await this.remove(node.memory_node_id);
        await delay(2000);
      }
      expect((await this.list()).filter((node) => node.status !== "delete")).toEqual([]);
    } catch (error) {
      failed(error);
    }
    for (const schemaId of this.schemas) {
      try {
        await this.command("profile cleanup", [
          "profile",
          "delete",
          "--schema-id",
          schemaId,
          "--yes",
        ]);
        this.deleted.add(schemaId);
      } catch (error) {
        failed(error);
      }
    }
    this.flush();
    if (this.uncertainSubmission) {
      this.cleanupErrors.push(
        "Submission receipt unavailable: late writes may require manual cleanup for this synthetic user",
      );
      this.flush();
    }
    if (this.uncertainSchemas.size)
      failed(
        `Profile creation receipt unavailable; reconcile schema names: ${[...this.uncertainSchemas].join(", ")}`,
      );
    if (this.cleanupErrors.length || this.pending.size)
      throw new Error(`Cleanup incomplete: ${this.outputDir}`);
  }

  finish(passed: boolean) {
    this.outcome = passed ? "PASS" : "FAIL";
    this.flush();
  }
}

export async function journey(journeyId: string, run: (fixture: MemoryJourney) => Promise<void>) {
  const fixture = new MemoryJourney(journeyId);
  const failures: unknown[] = [];
  try {
    await run(fixture);
  } catch (error) {
    failures.push(error);
  }
  try {
    await fixture.cleanup();
  } catch (error) {
    failures.push(error);
  }
  fixture.finish(failures.length === 0);
  if (failures.length)
    throw new AggregateError(failures, `${journeyId} failed; evidence: ${fixture.outputDir}`);
}
