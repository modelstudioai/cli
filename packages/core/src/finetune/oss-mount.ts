/**
 * OSS-mounted dataset source of `POST /api/v1/fine-tunes`.
 *
 * A dataset can be read in place from an OSS bucket instead of being uploaded:
 * the uncompressed dataset folder is uploaded to OSS as-is (the service cannot
 * mount a zip) and the job points at it with `data_source_type: "oss_mount"`.
 * Nothing here reaches OSS; a wrong bucket, key or region is judged by the server.
 */
import type { LocalizedText } from "../types/command.ts";
import type { FineTuneDatasetDescriptor } from "./types.ts";

/** Region used for every mount when no region flag is given. */
export const DEFAULT_OSS_MOUNT_REGION = "cn-beijing";

/** Scheme that marks a dataset entry as an OSS mount. */
const OSS_MOUNT_SCHEME = /^oss:\/\//i;

export interface OssMountLocation {
  bucket: string;
  /** Object key; for a multi-file dataset, the path of its data.jsonl. */
  filePath: string;
}

export type OssMountParse =
  | { valid: true; location: OssMountLocation }
  | { valid: false; reason: Exclude<LocalizedText, string> };

/** Whether a dataset entry addresses an OSS mount rather than a file-id or local path. */
export function isOssMountToken(token: string): boolean {
  return OSS_MOUNT_SCHEME.test(token);
}

/**
 * Parse `oss://<bucket>/<object key>` and check its shape. The bucket and key
 * cannot be checked from here.
 */
export function parseOssMountUri(token: string): OssMountParse {
  const remainder = token.replace(OSS_MOUNT_SCHEME, "");
  const slashIndex = remainder.indexOf("/");
  const bucket = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  const filePath = slashIndex === -1 ? "" : remainder.slice(slashIndex + 1);
  if (bucket === "") {
    return {
      valid: false,
      reason: {
        "en-US": "is missing the bucket; expected oss://<bucket>/<object key>.",
        "zh-CN": "缺少 bucket，应形如 oss://<bucket>/<object key>。",
      },
    };
  }
  if (filePath === "") {
    return {
      valid: false,
      reason: {
        "en-US":
          "is missing the object key; use oss://<bucket>/<object key> (for a multi-file dataset, the path of its data.jsonl).",
        "zh-CN":
          "缺少 object key，应形如 oss://<bucket>/<object key>（多文件数据集指向其 data.jsonl 的路径）。",
      },
    };
  }
  if (/\.zip$/i.test(filePath)) {
    return {
      valid: false,
      reason: {
        "en-US":
          "points at a zip file, which cannot be mounted; upload the uncompressed dataset folder and point at its data.jsonl.",
        "zh-CN":
          "指向 zip 文件，无法挂载；请将未压缩的数据集文件夹上传到 OSS，并指向其中的 data.jsonl。",
      },
    };
  }
  return { valid: true, location: { bucket, filePath } };
}

/** Request entry that mounts a dataset from OSS. */
export function buildOssMountDataset(
  location: OssMountLocation,
  region: string,
): FineTuneDatasetDescriptor {
  return {
    data_source_type: "oss_mount",
    mount_storage: { region, bucket: location.bucket, file_path: location.filePath },
  };
}
