/**
 * Shared dataset-input pipeline for `finetune <modality> create` and
 * `finetune opd run`: resolve comma-separated file-id / local-path tokens,
 * validate local files through the training profile, and defer upload until
 * pre-flight checks pass.
 */
import { existsSync, statSync } from "fs";
import { basename } from "path";
import {
  BailianError,
  ExitCode,
  formatCommand,
  formatIssue,
  uploadDataset,
  type CommandContext,
  type DataModality,
  type DatasetFile,
  type TrainingProfile,
} from "bailian-cli-core";

/**
 * A `--datasets` / `--validations` token is treated as a local file to upload
 * when it resolves to an existing file on disk; otherwise it is forwarded
 * verbatim as a previously-uploaded file-id (the `file-xxx` shape returned by
 * `dataset upload`). This lets users skip the manual upload step:
 * `--datasets ./train.jsonl` uploads then trains in one shot.
 */
export function isLocalPath(token: string): boolean {
  return existsSync(token) && statSync(token).isFile();
}

export interface ResolvedDataset {
  /**
   * Tokens in input order. Local paths are kept as-is here (a placeholder
   * until `uploadResolvedLocal` swaps them for real file-ids); bare file-ids
   * pass through untouched. In dry-run the paths stay (the previewed body
   * reflects exactly what the user typed).
   */
  fileIds: string[];
  /** Local paths in input order, for the deferred upload step. */
  localPaths: string[];
  /** In-hand size for the first local token, if known (local statSync). */
  firstSize?: number;
  /**
   * Total training-sample count across local tokens, when known. Sourced from
   * `validateDataset`'s `stats.totalRecords` (summed per token). Undefined when
   * any token is a bare file-id (no local file to count) or in dry-run — the
   * pre-submit batch-size gate only fires when this is known, so file-id flows
   * fall through to the platform rather than risk a false positive.
   */
  recordCount?: number;
}

/**
 * Analyze a comma-separated `--datasets` / `--validations` value WITHOUT
 * uploading: bare file-ids pass through; local paths are validated through the
 * same pipeline as `dataset upload` (so structural errors surface here),
 * their sample count and size are captured for the pre-submit gate, and the
 * path itself is recorded in `localPaths` for a later, deferred upload.
 *
 * Splitting analysis from upload lets the batch-size gate fire before any
 * network call — a doomed job (too few samples) is rejected without burning an
 * upload, and is offline-testable. In dry-run mode local paths are not
 * validated (the preview never touches the network or the disk beyond stat).
 */
export async function analyzeDatasetTokens(
  context: Pick<CommandContext, "settings" | "identity" | "output">,
  raw: string,
  label: string,
  profile: TrainingProfile,
  modality: DataModality,
  model: string,
  /** Pre-detected modality for a known path (avoids re-opening the file). */
  knownModality?: { path: string; modality: DataModality },
): Promise<ResolvedDataset> {
  const { settings } = context;
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new BailianError(`--${label} must contain at least one entry.`, ExitCode.USAGE);
  }

  const fileIds: string[] = [];
  const localPaths: string[] = [];
  let firstSize: number | undefined;
  let recordCount: number | undefined;
  // A file-id token has no local file to count, so the total sample count is
  // only knowable when every token is a local path. Once any file-id is seen,
  // flip to unknown and stop accumulating to avoid an undercount that could
  // trip the batch-size gate falsely.
  let recordCountKnown = true;

  for (const token of tokens) {
    if (!isLocalPath(token)) {
      fileIds.push(token);
      recordCountKnown = false;
      continue;
    }

    fileIds.push(token);
    localPaths.push(token);

    if (settings.dryRun) continue;

    // The command's modality is authoritative; each local file is validated
    // under that modality's schema. Reuse the caller's pre-detected modality
    // when available to avoid opening the same file twice (matters for large
    // ZIPs).
    const tokenModality =
      knownModality && knownModality.path === token ? knownModality.modality : modality;

    // Local path → validate through the profile. The profile internally routes
    // to the correct validator based on modality. Upload is deferred to
    // `uploadResolvedLocal` so the gate can run first. `model` is forwarded for
    // schema-agnostic cross-checks.
    const result = await profile.validate(token, tokenModality, { model });
    if (!result.valid) {
      const lines = [
        `Dataset validation failed for ${token}`,
        ...result.errors.slice(0, 10).map(formatIssue),
      ];
      if (result.errors.length > 10) {
        lines.push(`  … and ${result.errors.length - 10} more error(s).`);
      }
      lines.push(
        "",
        `Hint: re-run \`${formatCommand(context.identity, "dataset validate --file <path>")}\` for the full report,`,
        `      or upload manually with \`${formatCommand(context.identity, "dataset upload --no-validate")}\` and`,
        "      pass the resulting file-id here.",
      );
      throw new BailianError(lines.join("\n"), ExitCode.GENERAL);
    }
    if (result.warnings.length > 0) {
      context.output.warning({
        code: "DATASET_VALIDATION_WARNINGS",
        message: {
          "en-US": `Dataset validation passed with ${result.warnings.length} warning(s) for ${token}.`,
          "zh-CN": `${token} 数据集校验通过，共 ${result.warnings.length} 条警告。`,
        },
        details: { file: token, warnings: result.warnings },
      });
    }

    // Accumulate the sample count so the caller can pre-flight the batch-size
    // gate before submitting. `totalRecords` is set by the jsonl validator as
    // (non-blank lines); undefined stats fall back to "unknown" (no gate).
    const tokenRecords = result.stats.totalRecords;
    if (typeof tokenRecords === "number") {
      recordCount = (recordCount ?? 0) + tokenRecords;
    }
    if (firstSize === undefined) firstSize = statSync(token).size;
  }

  return {
    fileIds,
    localPaths,
    firstSize,
    recordCount: recordCountKnown ? recordCount : undefined,
  };
}

/**
 * Upload each local path recorded in `resolved.localPaths`, swapping the
 * placeholder path entries in `resolved.fileIds` for the returned file-ids.
 * Returns the uploaded file records. No-op in dry-run. Validation already
 * happened in `analyzeDatasetTokens`, so this is pure upload.
 */
export async function uploadResolvedLocal(
  context: Pick<CommandContext, "client" | "output">,
  resolved: ResolvedDataset,
  purpose: string,
  label: string,
  workspaceId?: string,
): Promise<DatasetFile[]> {
  const { client } = context;
  const uploaded: DatasetFile[] = [];
  for (const [index, token] of resolved.fileIds.entries()) {
    if (!isLocalPath(token)) continue;
    const file: DatasetFile = await uploadDataset(client, {
      filePath: token,
      purpose,
      workspaceId,
    });
    if (!file.file_id) {
      throw new BailianError(
        `Upload of ${token} succeeded but no file_id was returned.`,
        ExitCode.GENERAL,
      );
    }
    uploaded.push(file);
    resolved.fileIds[index] = file.file_id;
    context.output.info({
      "en-US": `Uploaded ${basename(token)} → ${file.file_id} (auto from --${label})`,
      "zh-CN": `已上传 ${basename(token)} → ${file.file_id}（来自 --${label}）`,
    });
  }
  return uploaded;
}
