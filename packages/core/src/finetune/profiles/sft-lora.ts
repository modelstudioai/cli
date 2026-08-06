/**
 * `sft-lora` profile — LoRA fine-tuning via the server's `efficient_sft`.
 *
 * Accepts `.jsonl` (text data with ChatML `{messages}` schema) and `.zip`
 * (audio / image data with a `data.jsonl` manifest inside). The data
 * inspector detects the modality from file content; this profile routes to the
 * correct validator and assembles modality-specific hyper-parameters.
 *
 * Text, audio, and image all share the same server training type
 * (`efficient_sft`) but differ in every other dimension: validation rules,
 * hyper-parameters, and pre-flight gates. All branching is internal —
 * `create.ts` calls the uniform profile interface without knowing the modality.
 */
import type { TrainingProfile, DataModality } from "./types.ts";
import type { ValidateOpts, ValidationResult } from "../../dataset/validate/types.ts";
import { validateDataset } from "../../dataset/validate/registry.ts";
import { makeIssue, MAX_MEDIA_ZIP_BYTES } from "../../dataset/validate/common.ts";
import { resolveTextHyperParameters } from "./common.ts";

/** Audio TTS hyper-parameter defaults (CosyVoice v3 Flash). */
const AUDIO_HYPER_PARAMS: Record<string, unknown> = {
  lm_max_epoch: 60,
  lm_step: 5,
  lm_num: 3,
  lm_batch_size: 1000,
  fm_max_epoch: 100,
  fm_step: 10,
  fm_num: 3,
  fm_batch_size: 2000,
};

/**
 * Image generation hyper-parameter defaults (Wan2.x).
 *
 * The platform accepts these via `hyper_parameters` in the POST /fine-tunes
 * body. `generation_type` controls `max_pixels` and `val_img_size` defaults:
 *   - t2i: "2k" (2048×2048)
 *   - i2i: "1k" (1024×1024)
 *
 * The default is "t2i". The generation type is auto-detected from data
 * content: if the first JSONL record has `input_img`, it's I2I; otherwise T2I.
 * The inspector returns `"image-i2i"` for I2I data, which this profile uses
 * directly to pick the right hyper-parameter set.
 * `split` (0.9) auto-splits training data into train/validation when no
 * explicit validation_file_ids are provided.
 */
const IMAGE_HYPER_PARAMS_T2I: Record<string, unknown> = {
  learning_rate: "3e-5",
  max_steps: 800,
  eval_steps: 200,
  max_token_length: "1k",
  gradient_clip: 0.5,
  weight_decay: 0.02,
  max_pixels: "2k",
  val_img_size: "2k",
  generation_type: "t2i",
  lora_rank: 32,
  save_total_limit: 10,
  split: 0.9,
};

const IMAGE_HYPER_PARAMS_I2I: Record<string, unknown> = {
  ...IMAGE_HYPER_PARAMS_T2I,
  max_pixels: "1k",
  val_img_size: "1k",
  generation_type: "i2i",
};

/**
 * Image / video ZIP size cap — shared constant from dataset/validate/common.ts.
 */

/**
 * Video generation hyper-parameter defaults (Wan i2v / kf2v).
 *
 * Shared across all video models; `batch_size` and `max_pixels` differ by model
 * family (resolved per model in `resolveHyperParameters`):
 *   - wan2.7 (e.g. wan2.7-i2v):           batch_size 1, max_pixels 102400
 *   - wan2.5 (e.g. wan2.5-i2v-preview):   batch_size 4, max_pixels 36864
 *   - wan2.2 (i2v-flash / kf2v-flash):    batch_size 4, max_pixels 262144
 *
 * `learning_rate` is a string to avoid JSON-number precision loss (consistent
 * with the image defaults). `split` (0.9) + `max_split_val_dataset_sample`
 * (5) drive the automatic train/validation split when no explicit
 * validation_file_ids are provided.
 *
 * Values aligned with the official user guide (2026-07):
 *   n_epochs 50, eval_epochs 20 (≥ n_epochs/10).
 */
const VIDEO_HYPER_PARAMS_BASE: Record<string, unknown> = {
  n_epochs: 50,
  learning_rate: "2e-5",
  split: 0.5,
  max_split_val_dataset_sample: 5,
  eval_epochs: 20,
  save_total_limit: 10,
  lora_rank: 32,
  lora_alpha: 32,
};

/** True for any image modality (base or subtype). */
function isImage(modality: DataModality): boolean {
  return modality === "image" || modality === "image-i2i";
}

/** True for any video modality (i2v base or kf2v subtype). */
function isVideo(modality: DataModality): boolean {
  return modality === "video" || modality === "video-kf2v";
}

/** wan2.5 family uses smaller batch_size / max_pixels than wan2.2. */
function isWan25(model: string | undefined): boolean {
  return typeof model === "string" && /wan2\.5/i.test(model);
}

/** wan2.7 family uses batch_size 1 and max_pixels 102400. */
function isWan27(model: string | undefined): boolean {
  return typeof model === "string" && /wan2\.7/i.test(model);
}

export const sftLoraProfile: TrainingProfile = {
  clientTrainingType: "sft-lora",
  serverTrainingType: "efficient_sft",
  acceptedExtensions: [".jsonl", ".zip"],

  async validate(
    filePath: string,
    modality: DataModality,
    opts: ValidateOpts,
  ): Promise<ValidationResult> {
    if (modality === "audio") {
      // ZIP validation: structure check + JSONL content via tts schema.
      // The zip validator internally calls jsonlValidator for data.jsonl.
      return validateDataset(filePath, { ...opts, schema: "tts" });
    }
    if (isImage(modality)) {
      // Image generation: flat ZIP with data.jsonl + image files.
      // The zip validator handles ≥25 image count + flat structure when
      // schema is "image". Size cap is 1 GB (vs 300 MB for text/audio).
      return validateDataset(filePath, {
        ...opts,
        schema: "image",
        maxBytes: MAX_MEDIA_ZIP_BYTES,
      });
    }
    if (isVideo(modality)) {
      // Video generation (Wan i2v/kf2v): ZIP with data.jsonl + frame images and
      // (for training) target videos. i2v is flat; kf2v uses image//video/
      // subfolders. 1 GB cap like image.
      const result = await validateDataset(filePath, {
        ...opts,
        schema: "video",
        maxBytes: MAX_MEDIA_ZIP_BYTES,
      });
      // Model <-> data cross-check: a kf2v model needs first+last-frame data,
      // an i2v model ignores last_frame_path. Only runs when we know the model
      // (bare file-id flows pass no model). Detected subtype comes from the
      // data inspector (video = i2v, video-kf2v = has last_frame_path).
      if (typeof opts.model === "string" && opts.model.length > 0) {
        const modelIsKf2v = /kf2v/i.test(opts.model);
        const dataIsKf2v = modality === "video-kf2v";
        if (modelIsKf2v && !dataIsKf2v) {
          result.errors.push(
            makeIssue(
              "error",
              "KF2V_DATA_MISMATCH",
              `Model "${opts.model}" is a first+last-frame (kf2v) model but the data has ` +
                `no "last_frame_path". kf2v training data must include a last frame per record.`,
            ),
          );
        } else if (!modelIsKf2v && dataIsKf2v) {
          result.warnings.push(
            makeIssue(
              "warning",
              "I2V_LAST_FRAME_IGNORED",
              `Model "${opts.model}" is a first-frame (i2v) model but the data includes ` +
                `"last_frame_path"; the last frame will be ignored during training.`,
            ),
          );
        }
      }
      result.valid = result.errors.length === 0;
      return result;
    }
    // Text: standard JSONL validation with chatml schema.
    return validateDataset(filePath, { ...opts, schema: "chatml" });
  },

  resolveHyperParameters(
    modality: DataModality,
    flags: Record<string, unknown>,
  ): Record<string, unknown> {
    if (modality === "audio") {
      // Audio: use TTS defaults, user flags override (MVP: all hardcoded).
      return { ...AUDIO_HYPER_PARAMS };
    }
    if (isImage(modality)) {
      // Image: modality "image-i2i" (auto-detected from data having input_img)
      // uses I2I defaults; plain "image" uses T2I defaults.
      const base = modality === "image-i2i" ? IMAGE_HYPER_PARAMS_I2I : IMAGE_HYPER_PARAMS_T2I;
      const hp = { ...base };
      if (flags.learningRate !== undefined) hp.learning_rate = flags.learningRate as string;
      return hp;
    }
    if (isVideo(modality)) {
      // Video: shared defaults + model-family-specific batch_size / max_pixels.
      //   wan2.7: batch_size 1, max_pixels 102400
      //   wan2.5: batch_size 4, max_pixels 36864
      //   wan2.2: batch_size 4, max_pixels 262144
      const model = (flags.model ?? flags.baseModel) as string | undefined;
      const hp: Record<string, unknown> = {
        ...VIDEO_HYPER_PARAMS_BASE,
        batch_size: isWan27(model) ? 1 : 4,
        max_pixels: isWan27(model) ? 102400 : isWan25(model) ? 36864 : 262144,
      };
      // Optional overrides (no clamping — video batch_size is intentionally small).
      if (flags.nEpochs !== undefined) hp.n_epochs = flags.nEpochs as number;
      if (flags.batchSize !== undefined) hp.batch_size = flags.batchSize as number;
      if (flags.learningRate !== undefined) hp.learning_rate = flags.learningRate as string;
      return hp;
    }
    // Text: existing hyper-parameter logic (n_epochs, batch_size, etc.).
    return resolveTextHyperParameters(flags);
  },

  shouldSkipGate(gate: string, modality: DataModality): boolean {
    if (modality === "audio" || isImage(modality) || isVideo(modality)) {
      // Audio has no batch_size hyper-parameter; image uses max_steps; video
      // datasets are intentionally small (batch_size 2/4). All skip the
      // batch-size pre-flight gate to avoid false rejections.
      if (gate === "batch_size") return true;
    }
    return false;
  },

  shouldSkipCapabilityCheck(modality: DataModality): boolean {
    // Audio models (e.g. cosyvoice-v3-flash), image models
    // (e.g. wan2.7-image-pro) and video models (e.g. wan2.5-i2v-preview) report
    // supports.sft=false in listFoundationModels but the API accepts
    // efficient_sft — skip to avoid false blocking.
    return modality === "audio" || isImage(modality) || isVideo(modality);
  },
};
