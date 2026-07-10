/**
 * `cpt` profile — Continual Pre-Training (full-parameter).
 * Maps to the server's `cpt` training type. CPT record schema.
 */
import { textProfile } from "./common.ts";

export const cptProfile = textProfile("cpt", "cpt", "cpt");
