import { observeCloudSkill } from "./update-check.ts";
import { BailianError, ExitCode, type CommandContext } from "bailian-cli-core";

type CatalogContext = Pick<CommandContext, "client" | "localize">;

export interface CatalogSkill {
  id: string;
  display_name: string;
  display_description: string;
  source: "official" | "customer";
  latest_version: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function invalidCatalogResponse(ctx: CatalogContext, requestId?: string): never {
  throw new BailianError(
    ctx.localize({
      "en-US": "The Skill API returned an invalid result.",
      "zh-CN": "Skill 接口返回的结果格式不正确。",
    }),
    ExitCode.GENERAL,
    undefined,
    { api: { requestId } },
  );
}

export async function requestCatalog<Data>(ctx: CatalogContext, path: string) {
  const response = await ctx.client.requestJson<{
    success: boolean;
    data: Data;
    request_id?: string;
  }>({ method: "GET", path });
  if (response?.success !== true || response.data == null)
    invalidCatalogResponse(ctx, response?.request_id);
  return response;
}

export function describeSkill(ctx: CatalogContext, skill: CatalogSkill, requestId?: string) {
  if (
    typeof skill?.id !== "string" ||
    !skill.id.trim() ||
    (skill.source !== "official" && skill.source !== "customer")
  )
    invalidCatalogResponse(ctx, requestId);
  observeCloudSkill(ctx, skill);
  return {
    skill_code: skill.id,
    skill_name: skill.display_name,
    description: skill.display_description,
    type: skill.source === "official" ? "official" : "private",
    source: skill.source,
    status: skill.status,
    latest_version: skill.latest_version ?? null,
    created_at: skill.created_at,
    updated_at: skill.updated_at,
  };
}
