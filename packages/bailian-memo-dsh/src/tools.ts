/**
 * Explicit personal-memory tools for the model / user (dsh 0.2.1 defineTool).
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-user-approval";
import type { MemoryClient, MemorySearchInput } from "./memory-client.js";
import {
  isAutomaticOpsAllowed,
  markPaused,
  readPersonalMemoryConfig,
  type PersonalMemoryConfig,
} from "./personal-config.js";
import { filterForUpload } from "./sensitive.js";
import { submitAddIntent, type TaskStore } from "./task-store.js";
import type { ResolvedConfig } from "./config.js";
import { ensureInitialized, resumeAndEnsure } from "./initialize.js";

export interface MemoToolDeps {
  client: MemoryClient;
  store: TaskStore;
  ctx: Context;
  resolveConfig: () => ResolvedConfig;
}

const textOutput = {
  schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      message: { type: "string" as const, required: true as const },
    },
  },
  render: (_args: unknown, value: { message: string }) => [
    { type: "text" as const, text: value.message },
  ],
};

async function requireActive(): Promise<PersonalMemoryConfig> {
  const config = await readPersonalMemoryConfig();
  if (!isAutomaticOpsAllowed(config) && config.status !== "paused") {
    throw new Error(
      "Bailian personal memory is not active. Enable it from the Bailian Memory settings page first.",
    );
  }
  return config;
}

export function createMemoTools(deps: MemoToolDeps) {
  const { client, store, ctx } = deps;

  const search = defineTool({
    name: "bailian_memo_search",
    description:
      "Search Bailian personal memories (observations) for the configured user_id. Use when personal context may change the answer.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Search query text",
      },
      top_k: {
        type: "number",
        description: "Max hits (1-20, default 5)",
      },
      min_score: {
        type: "number",
        description:
          "Minimum similarity score (0-1). Omitted uses the configured minimum score (default 0).",
      },
    },
    output: textOutput,
    async execute(args) {
      const config = await requireActive();
      if (config.status === "paused") {
        return { message: "Personal memory is paused. Resume before searching." };
      }
      const topK =
        typeof args.top_k === "number" && args.top_k >= 1 && args.top_k <= 20 ? args.top_k : 5;
      const configuredMinScore = deps.resolveConfig().minScore;
      const minScore =
        typeof args.min_score === "number" && args.min_score >= 0 && args.min_score <= 1
          ? args.min_score
          : typeof configuredMinScore === "number" &&
              configuredMinScore >= 0 &&
              configuredMinScore <= 1
            ? configuredMinScore
            : 0;
      const searchInput: MemorySearchInput = {
        userId: config.user_id!,
        query: String(args.query),
        topK,
        minScore,
        memoryTypes: ["observation"],
        planVersion: "pro",
      };
      const response = await client.search(searchInput);
      const hits = response.memory_nodes ?? [];
      if (hits.length === 0) {
        const scope = await client.describeSearchScope(searchInput);
        return { message: `(no hits)\nscope=${JSON.stringify(scope)}` };
      }
      const lines = hits.map((hit, index) => {
        const id = hit.memory_node_id ?? "?";
        const score = typeof hit.score === "number" ? ` score=${hit.score.toFixed(3)}` : "";
        return `${index + 1}. [${id}]${score} ${hit.content ?? ""}`;
      });
      return { message: lines.join("\n") };
    },
  });

  const status = defineTool({
    name: "bailian_memo_status",
    description:
      "Show Bailian personal-memory enablement status, identity ids (not secrets), and recent async write tasks.",
    parameters: {},
    output: textOutput,
    async execute() {
      const config = await readPersonalMemoryConfig();
      const recent = await store.listRecent(10);
      const summary = {
        status: config.status,
        workspace_id: config.workspace_id,
        user_id: config.user_id,
        profile_schema_id: config.profile_schema_id,
        consented_at: config.consented_at,
        last_error: config.last_error ?? null,
        recent_tasks: recent.map((task) => ({
          intentId: task.intentId,
          eventId: task.eventId,
          status: task.status,
          updatedAt: task.updatedAt,
          lastError: task.lastError,
          resultCount: task.resultCount,
          resultEventTypes: task.resultEventTypes,
        })),
      };
      return { message: JSON.stringify(summary, null, 2) };
    },
  });

  const remember = defineTool({
    name: "bailian_memo_remember",
    description:
      "Explicitly remember a user-approved fact into Bailian personal memory. Provide the exact text the user wants stored.",
    parameters: {
      text: {
        type: "string",
        required: true,
        description: "Exact memory text to store",
      },
      include_profile: {
        type: "boolean",
        description: "Also extract into the personal profile schema",
      },
      allow_sensitive: {
        type: "boolean",
        description: "Set true only when the user explicitly asked to store sensitive content",
      },
    },
    output: textOutput,
    async execute(args) {
      const config = await requireActive();
      if (config.status === "paused") {
        return {
          message: "Personal memory is paused. Call bailian_memo_resume first.",
        };
      }
      const filtered = filterForUpload(String(args.text), {
        allowSensitive: args.allow_sensitive === true,
      });
      if (!filtered.safeText) {
        return {
          message: filtered.blockedCredential
            ? "Refused: credential-like content is never stored."
            : "Refused: sensitive content requires an explicit user request (allow_sensitive).",
        };
      }
      const task = await submitAddIntent({
        store,
        client,
        userId: config.user_id!,
        messages: [{ role: "user", content: filtered.safeText }],
        profileSchema:
          args.include_profile === true ? (config.profile_schema_id ?? undefined) : undefined,
        note: "explicit-remember",
      });
      return {
        message: `Submitted remember intent ${task.intentId} (event ${task.eventId ?? "none"}, status=${task.status}).`,
      };
    },
  });

  const forget = defineTool({
    name: "bailian_memo_forget",
    description:
      "Locate candidate personal memories matching a query and delete confirmed observation nodes after user approval. Profile value deletion uses need_detail + PATCH when available.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "What the user wants forgotten",
      },
      node_id: {
        type: "string",
        description: "Optional exact observation node id to delete",
      },
      profile_attribute_id: {
        type: "string",
        description: "Optional profile attribute id for value deletion",
      },
      profile_item_id: {
        type: "number",
        description: "Optional profile value item_id (need_detail)",
      },
    },
    output: textOutput,
    async execute(args, exec) {
      const config = await requireActive();
      const approval = ctx.get("approval");

      const candidates: string[] = [];
      if (typeof args.node_id === "string" && args.node_id) {
        candidates.push(args.node_id);
      } else {
        const searchResult = await client.search({
          userId: config.user_id!,
          query: String(args.query),
          topK: 5,
          memoryTypes: ["observation"],
        });
        for (const hit of searchResult.memory_nodes ?? []) {
          if (hit.memory_node_id) {
            candidates.push(`${hit.memory_node_id}: ${(hit.content ?? "").slice(0, 160)}`);
          }
        }
      }

      const reason = [
        "Delete Bailian personal memory matching the forget request.",
        `Query: ${String(args.query)}`,
        candidates.length > 0
          ? `Candidates:\n${candidates.join("\n")}`
          : "No observation candidates found.",
        args.profile_attribute_id
          ? `Also delete profile attribute ${args.profile_attribute_id} item ${args.profile_item_id ?? "?"}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      if (!approval || !exec.agent) {
        return { message: "Forget cancelled: no auditable approval channel is available." };
      }
      const outcome = await approval.request({
        agent: exec.agent,
        toolName: "bailian_memo_forget",
        callId: exec.callId,
        reason,
        signal: exec.signal,
      });
      if (outcome !== "allowed-once") {
        return { message: `Forget cancelled: approval outcome was ${outcome}.` };
      }

      const deleted: string[] = [];
      const errors: string[] = [];
      const nodeIds =
        typeof args.node_id === "string" && args.node_id
          ? [args.node_id]
          : candidates
              .map((line) => line.split(":")[0]?.trim())
              .filter((id): id is string => Boolean(id));

      for (const nodeId of nodeIds.slice(0, 5)) {
        try {
          await client.deleteNode(nodeId);
          deleted.push(nodeId);
        } catch (error) {
          errors.push(`${nodeId}: ${error instanceof Error ? error.message : "delete failed"}`);
        }
      }

      if (
        typeof args.profile_attribute_id === "string" &&
        args.profile_attribute_id &&
        config.profile_schema_id
      ) {
        try {
          const detailed = await client.getProfile({
            schemaId: config.profile_schema_id,
            userId: config.user_id!,
            needDetail: true,
          });
          const attribute = (detailed.profile?.attributes ?? []).find(
            (entry) =>
              entry.id === args.profile_attribute_id || entry.name === args.profile_attribute_id,
          );
          const itemId =
            typeof args.profile_item_id === "number"
              ? args.profile_item_id
              : attribute?.value_items?.[0]?.item_id;
          if (attribute && itemId !== undefined) {
            await client.patchProfileValue({
              schemaId: config.profile_schema_id,
              entityId: config.user_id!,
              attributeId: attribute.id,
              opType: "delete",
              itemId,
            });
            const verified = await client.getProfile({
              schemaId: config.profile_schema_id,
              userId: config.user_id!,
              needDetail: true,
            });
            const verifiedAttribute = (verified.profile?.attributes ?? []).find(
              (entry) => entry.id === attribute.id,
            );
            const stillPresent = verifiedAttribute?.value_items?.some(
              (item) => item.item_id === itemId && item.status !== "delete",
            );
            if (stillPresent) {
              errors.push(`profile:${attribute.id}:${itemId}: delete verification failed`);
              await markPaused("forget-profile-unverified");
            } else {
              deleted.push(`profile:${attribute.id}:${itemId}`);
            }
          } else {
            errors.push(
              "Profile value delete skipped: item_id unavailable (need_detail path may be unsupported).",
            );
            await markPaused("forget-profile-partial");
          }
        } catch (error) {
          errors.push(
            `profile: ${error instanceof Error ? error.message : "profile delete failed"}`,
          );
          await markPaused("forget-profile-failed");
        }
      }

      return {
        message: [
          deleted.length > 0 ? `Deleted: ${deleted.join(", ")}` : "No deletions completed.",
          errors.length > 0 ? `Errors: ${errors.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
  });

  const pause = defineTool({
    name: "bailian_memo_pause",
    description: "Pause automatic Bailian personal memory read/write. Does not delete cloud data.",
    parameters: {},
    output: textOutput,
    async execute() {
      const config = await markPaused("user-pause");
      return {
        message: `Personal memory status is now ${config.status}. Cloud data was not deleted.`,
      };
    },
  });

  const resume = defineTool({
    name: "bailian_memo_resume",
    description:
      "Resume Bailian personal memory after a pause; continues initialization if needed.",
    parameters: {},
    output: textOutput,
    async execute() {
      const config = await resumeAndEnsure(client);
      return {
        message: `Personal memory status is now ${config.status}${
          config.last_error ? ` (last_error=${config.last_error})` : ""
        }.`,
      };
    },
  });

  return { search, status, remember, forget, pause, resume };
}

export function registerMemoTools(ctx: Context, deps: Omit<MemoToolDeps, "ctx">): void {
  const tools = createMemoTools({ ...deps, ctx });
  ctx.tools.register(tools.search);
  ctx.tools.register(tools.status);
  ctx.tools.register(tools.remember);
  ctx.tools.register(tools.forget);
  ctx.tools.register(tools.pause);
  ctx.tools.register(tools.resume);
}

export { ensureInitialized };
