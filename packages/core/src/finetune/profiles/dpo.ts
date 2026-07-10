/**
 * `dpo` profile — Direct Preference Optimization (full-parameter).
 * Maps to the server's `dpo_full` training type. DPO record schema.
 */
import { textProfile } from "./common.ts";

export const dpoProfile = textProfile("dpo", "dpo_full", "dpo");
