/**
 * `sft` profile — full-parameter Supervised Fine-Tuning.
 * Maps to the server's `sft` training type. ChatML record schema.
 */
import { textProfile } from "./common.ts";

export const sftProfile = textProfile("sft", "sft", "chatml");
