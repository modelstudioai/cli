import {
  Modalities,
  type FlagsDef,
  type ModelGroupItem,
  type ModelPriceInfo,
  type Modality,
} from "bailian-cli-core";

/** Derived from the advisor vocabulary so the accepted values cannot drift. */
export const MODALITY_CHOICES = Object.values(Modalities);

/**
 * Catalog filters shared by `model list` and `model search`.
 *
 * provider / capability / feature / context-window are understood by the
 * server; the modality and lifecycle filters are applied locally because the
 * list API has no parameter for either.
 */
export const MODEL_FILTER_FLAGS = {
  provider: {
    type: "array",
    valueHint: "<p>",
    description: {
      "en-US": "Filter by provider (repeatable, e.g. --provider alibaba --provider deepseek)",
      "zh-CN": "按提供商筛选（可重复，例如 --provider alibaba --provider deepseek）",
    },
  },
  capability: {
    type: "array",
    valueHint: "<c>",
    description: {
      "en-US": "Filter by capability code (TG, Reasoning, VU, IG, VG, TTS, ASR, …)",
      "zh-CN": "按能力代码筛选（TG、Reasoning、VU、IG、VG、TTS、ASR 等）",
    },
  },
  feature: {
    type: "array",
    valueHint: "<f>",
    description: {
      "en-US": "Filter by feature (function-calling, web-search, structured-outputs, …)",
      "zh-CN": "按特性筛选（function-calling、web-search、structured-outputs 等）",
    },
  },
  contextWindow: {
    type: "array",
    valueHint: "<w>",
    description: {
      "en-US": "Filter by context window range bucket",
      "zh-CN": "按上下文窗口范围筛选",
    },
  },
  inputModality: {
    type: "array",
    valueHint: "<m>",
    choices: MODALITY_CHOICES,
    description: {
      "en-US": "Require an input modality (repeatable: Text, Image, Video, Audio)",
      "zh-CN": "限定输入模态（可重复：Text、Image、Video、Audio）",
    },
  },
  outputModality: {
    type: "array",
    valueHint: "<m>",
    choices: MODALITY_CHOICES,
    description: {
      "en-US": "Require an output modality (repeatable: Text, Image, Video, Audio)",
      "zh-CN": "限定输出模态（可重复：Text、Image、Video、Audio）",
    },
  },
  includeDeprecated: {
    type: "switch",
    description: {
      "en-US": "Include models that are already offline (hidden by default)",
      "zh-CN": "包含已下线的模型（默认隐藏）",
    },
  },
} satisfies FlagsDef;

/** Flags accepted by both commands that map onto server-side list parameters. */
export interface ModelFilterFlags {
  provider?: string[];
  capability?: string[];
  feature?: string[];
  contextWindow?: string[];
  inputModality?: Modality[];
  outputModality?: Modality[];
  includeDeprecated?: boolean;
}

/** Server-side portion of the filters, ready to spread into a list request. */
export function modelFilterParams(flags: ModelFilterFlags) {
  return {
    providers: flags.provider?.length ? flags.provider : undefined,
    capabilities: flags.capability?.length ? flags.capability : undefined,
    features: flags.feature?.length ? flags.feature : undefined,
    contextWindows: flags.contextWindow?.length ? flags.contextWindow : undefined,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Render one price entry compactly for a table cell, preferring the input price. */
export function formatPriceCompact(prices: ModelPriceInfo[] | undefined): string {
  if (!prices?.length) return "-";
  const inputPrice =
    prices.find(
      (priceEntry) => typeof priceEntry.type === "string" && priceEntry.type.includes("input"),
    ) ?? prices[0];
  const typeLabel = inputPrice.type ?? "";
  const priceStr = String(inputPrice.price ?? "?");
  const unit = inputPrice.priceUnit ?? "";
  return `${typeLabel}:${priceStr}/${unit}`;
}

// ---------------------------------------------------------------------------
// Model id normalization
// ---------------------------------------------------------------------------

/** Date-suffixed snapshot ids (`qwen-max-2024-09-19`) roll up to their trunk. */
const SNAPSHOT_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;

export function isSnapshotModel(modelId: string | undefined): boolean {
  return SNAPSHOT_SUFFIX_RE.test(modelId ?? "");
}

/** Lowercase, drop the snapshot suffix, collapse separators — for fuzzy compares. */
export function normalizeModelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(SNAPSHOT_SUFFIX_RE, "")
    .replace(/[\s_-]+/g, "");
}

/** Pick trunk items: exclude date-suffixed snapshots; if all snapshots, keep the latest. */
export function pickTrunkItems(items: ModelGroupItem[]): ModelGroupItem[] {
  if (items.length === 0) return [];
  const trunk = items.filter((item) => !isSnapshotModel(item.model));
  if (trunk.length > 0) return trunk;
  return [...items]
    .sort((first, second) => String(second.model).localeCompare(String(first.model)))
    .slice(0, 1);
}

// ---------------------------------------------------------------------------
// Modality
// ---------------------------------------------------------------------------

export interface ModelModalities {
  input: Modality[];
  output: Modality[];
}

function toModalities(value: unknown): Modality[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Modality =>
      typeof entry === "string" && (MODALITY_CHOICES as string[]).includes(entry),
  );
}

export function itemModalities(item: ModelGroupItem): ModelModalities {
  const metadata = item.inferenceMetadata ?? {};
  return {
    input: toModalities(metadata.request_modality),
    output: toModalities(metadata.response_modality),
  };
}

/** Directional some-intersection gate; an empty filter does not constrain. */
export function matchesModality(
  item: ModelGroupItem,
  input: Modality[],
  output: Modality[],
): boolean {
  const modalities = itemModalities(item);
  if (input.length > 0 && !input.some((wanted) => modalities.input.includes(wanted))) return false;
  if (output.length > 0 && !output.some((wanted) => modalities.output.includes(wanted))) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export interface ModelLifecycle {
  /** Retirement has taken effect — the model can no longer be called. */
  offline: boolean;
  /** Set when retirement is announced but not yet in effect. */
  upcomingOfflineAt?: string;
  announceUrl?: string;
}

/**
 * `offlineInfo.inference.offlineTime` is platform-local wall time without a
 * zone, so it is read as local time; day-granularity comparisons are unaffected.
 */
export function modelLifecycle(item: ModelGroupItem, now: number = Date.now()): ModelLifecycle {
  if (item.offlineAt && Date.parse(item.offlineAt) <= now) return { offline: true };

  const notice = item.offlineInfo?.inference;
  const offlineTime = notice?.offlineTime;
  if (offlineTime) {
    const offlineAt = Date.parse(offlineTime.replace(" ", "T"));
    if (!Number.isNaN(offlineAt)) {
      return {
        offline: false,
        upcomingOfflineAt: offlineTime,
        announceUrl: notice?.announceUrl || undefined,
      };
    }
  }

  return { offline: false };
}

/** Short status token for table output; empty when nothing is worth flagging. */
export function formatOfflineMarker(lifecycle: ModelLifecycle): string {
  if (lifecycle.offline) return "OFFLINE";
  return lifecycle.upcomingOfflineAt ? `OFFLINE ${lifecycle.upcomingOfflineAt.slice(0, 10)}` : "";
}

// ---------------------------------------------------------------------------
// Local filtering
// ---------------------------------------------------------------------------

/** Apply the modality and lifecycle filters the server cannot express. */
export function filterModelsLocally(
  items: ModelGroupItem[],
  flags: ModelFilterFlags,
  now: number = Date.now(),
): ModelGroupItem[] {
  const inputModality = flags.inputModality ?? [];
  const outputModality = flags.outputModality ?? [];
  return items.filter((item) => {
    if (!matchesModality(item, inputModality, outputModality)) return false;
    if (!flags.includeDeprecated && modelLifecycle(item, now).offline) return false;
    return true;
  });
}
