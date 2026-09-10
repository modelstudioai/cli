import { UsageError } from "../errors/base.ts";
import type { VocabularyEntry } from "./vocabulary.ts";

/** Shared JSON decode + top-level shape guard for both hot-word flags. */
function decodeVocabularyJson(raw: string, flagName: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`${flagName} is not valid JSON — ${(error as Error).message}`);
  }
}

/**
 * Instant hot words for `recognize --vocabulary`.
 * The API field is a flat word→weight object, so an array is a usage error here.
 */
export function parseInstantVocabulary(raw: string): Record<string, number> {
  const parsed = decodeVocabularyJson(raw, "--vocabulary");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError("--vocabulary must decode to a JSON object of word→weight.");
  }
  for (const [word, weight] of Object.entries(parsed)) {
    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      throw new UsageError(`--vocabulary weight for "${word}" must be a number.`);
    }
  }
  return parsed as Record<string, number>;
}

/**
 * Vocabulary create/update --words.
 * Accepts the same word→weight object as recognize, or the API entry array
 * when per-entry lang is needed. Array form ignores the optional lang param.
 */
export function parseVocabularyEntries(raw: string, lang?: string): VocabularyEntry[] {
  const flagName = "--words";
  const parsed = decodeVocabularyJson(raw, flagName);
  let entries: VocabularyEntry[];
  if (Array.isArray(parsed)) {
    entries = parsed.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new UsageError(
          `${flagName} entry #${index} must be an object with string "text" and number "weight".`,
        );
      }
      const entry = item as Partial<VocabularyEntry>;
      if (typeof entry.text !== "string" || typeof entry.weight !== "number") {
        throw new UsageError(
          `${flagName} entry #${index} must have a string "text" and a number "weight".`,
        );
      }
      if (!Number.isFinite(entry.weight)) {
        throw new UsageError(`${flagName} entry #${index} weight must be a finite number.`);
      }
      return {
        text: entry.text,
        weight: entry.weight,
        ...(typeof entry.lang === "string" ? { lang: entry.lang } : {}),
      };
    });
  } else if (!parsed || typeof parsed !== "object") {
    throw new UsageError(`${flagName} must decode to a JSON object or array.`);
  } else {
    entries = [];
    for (const [text, weight] of Object.entries(parsed)) {
      if (typeof weight !== "number" || !Number.isFinite(weight)) {
        throw new UsageError(`${flagName} weight for "${text}" must be a number.`);
      }
      entries.push({ text, weight, ...(lang ? { lang } : {}) });
    }
  }
  if (entries.length === 0) {
    throw new UsageError(`${flagName} must contain at least one hot word.`);
  }
  return entries;
}
