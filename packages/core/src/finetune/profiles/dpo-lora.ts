/**
 * `dpo-lora` profile — LoRA variant of Direct Preference Optimization.
 * Maps to the server's `dpo_lora` training type. DPO record schema.
 */
import { textProfile } from "./common.ts";

export const dpoLoraProfile = textProfile("dpo-lora", "dpo_lora", "dpo");
