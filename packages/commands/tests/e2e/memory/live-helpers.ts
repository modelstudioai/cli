import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "vite-plus/test";
import { makeE2eOutputDir, parseStdoutJson, runCommandE2e, type RunCliResult } from "../helpers.ts";
import { MEMORY_DELETE_ROUTES, MEMORY_PROFILE_DELETE_ROUTES } from "../topic-routes.ts";
import type { MemoryAddBody, MemoryNodeListBody } from "./shared.ts";

const routes = { ...MEMORY_DELETE_ROUTES, ...MEMORY_PROFILE_DELETE_ROUTES };
export type Node = NonNullable<MemoryNodeListBody["memory_nodes"]>[number];

export function assertMemoryServiceRejection(
  result: Pick<RunCliResult, "exitCode" | "stderr">,
): void {
  expect(result.exitCode, result.stderr).toBe(1);
  const { error } = parseStdoutJson<{
    error: { http_status?: number; request_id?: string; message: string; api_code?: string };
  }>(result.stderr);
  expect([400, 404], result.stderr).toContain(error.http_status);
  expect(error.request_id, result.stderr).toBeTruthy();
  expect(`${error.api_code ?? ""} ${error.message}`).toMatch(
    /not.?found|not.?exist|invalid.?parameter|不存在|未找到/i,
  );
}

/** Each journey owns only a fresh user; cleanup never touches existing user data. */
export function memoryJourney(
  libraryId: string | undefined = process.env.BAILIAN_E2E_MEMORY_LIBRARY_ID,
  userId = `live-${randomUUID()}`,
) {
  const projects = new Set<string>([""]);
  const traceFile = join(
    makeE2eOutputDir("memory-live"),
    `${userId}-${libraryId || "default"}.jsonl`,
  );
  const workspace = process.env.BAILIAN_WORKSPACE_ID!.trim();
  const scope = ["--workspace-id", workspace, ...(libraryId ? ["--library-id", libraryId] : [])];
  async function invoke<T>(args: string[]): Promise<T> {
    const workspaceOnly = args[0] === "node" || args[0] === "skill";
    const result = await runCommandE2e(routes, [
      "memory",
      ...args,
      ...(workspaceOnly ? ["--workspace-id", workspace] : scope),
      "--output",
      "json",
    ]);
    appendFileSync(traceFile, JSON.stringify({ args, userId, libraryId, ...result }) + "\n");
    expect(result.exitCode, `${result.stderr}\nTrace: ${traceFile}`).toBe(0);
    return parseStdoutJson<T>(result.stdout);
  }
  async function list(extra: string[] = []): Promise<Node[]> {
    const result = await invoke<MemoryNodeListBody>(["list", "--user-id", userId, ...extra]);
    expect(Array.isArray(result.memory_nodes)).toBe(true);
    return result.memory_nodes!;
  }
  async function untilRows(
    predicate: (nodes: Node[]) => boolean,
    extra: string[] = [],
  ): Promise<Node[]> {
    const deadline = Date.now() + 180_000;
    let nodes: Node[] = [];
    do {
      nodes = await list(extra);
      if (predicate(nodes)) return nodes;
      await delay(2000);
    } while (Date.now() < deadline);
    throw new Error(`Memory readback timed out for ${userId}: ${JSON.stringify(nodes)}`);
  }
  async function add(args: string[]): Promise<MemoryAddBody> {
    for (const [index, argument] of args.entries()) {
      if (argument === "--project-id") projects.add(args[index + 1]);
    }
    return invoke(["add", "--user-id", userId, ...args]);
  }
  async function search(args: string[]): Promise<Node[]> {
    const result = await invoke<MemoryNodeListBody>(["search", "--user-id", userId, ...args]);
    expect(Array.isArray(result.memory_nodes)).toBe(true);
    return result.memory_nodes!;
  }
  async function cleanup(): Promise<void> {
    const failures: unknown[] = [];
    for (const project of projects) {
      try {
        const filter = project ? ["--project-id", project] : [];
        let empty = false;
        for (let round = 0; round < 100; round += 1) {
          const nodes = await list(["--page-size", "100", ...filter]);
          if (!nodes.length) {
            empty = true;
            break;
          }
          for (const node of nodes)
            await invoke(["delete", "--node-id", node.memory_node_id, "--yes"]);
        }
        expect(
          empty,
          `Cleanup incomplete for ${userId}, project ${project}; trace ${traceFile}`,
        ).toBe(true);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, `Memory cleanup failed; trace ${traceFile}`);
  }
  return { userId, invoke, list, untilRows, add, search, cleanup, traceFile };
}
