import type { FlagsDef, LocalizedText, ParsedFlags } from "bailian-cli-core";
import { DEFAULT_LANGUAGE, GLOBAL_FLAGS, UsageError } from "bailian-cli-core";
import { createTranslator, type Translator } from "./i18n.ts";

const defaultLocalize: Translator["localize"] = (text) =>
  createTranslator(DEFAULT_LANGUAGE).localize(text);

function usageError(
  localize: Translator["localize"],
  message: LocalizedText,
  hint?: LocalizedText,
): UsageError {
  return new UsageError(localize(message), hint === undefined ? undefined : localize(hint));
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

/** maxTokens → max-tokens. For rendering flags in help / error messages. */
export function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export interface ParsePathResult {
  /** Command path: consecutive bare tokens after any leading global flags. */
  path: string[];
  /**
   * Flag region handed to parseFlags later.
   * Includes peeled leading GLOBAL_FLAGS plus everything after the command path.
   */
  rest: string[];
  hasHelpFlag: boolean;
  hasVersionFlag: boolean;
  hasIntrospectFlag: boolean;
}

/**
 * First-pass routing parse.
 * - Known GLOBAL_FLAGS may appear before the command path (git/docker style).
 * - Bare tokens form the command path; everything after the path goes into rest.
 * - Unknown flags before the path throw UsageError (no silent root-help fallback).
 */
export function parsePath(
  argv: string[],
  localize: Translator["localize"] = defaultLocalize,
): ParsePathResult {
  const leadingRest: string[] = [];
  let index = 0;

  while (index < argv.length) {
    const argument = argv[index]!;
    if (!argument.startsWith("-")) break;

    if (!argument.startsWith("--")) {
      throw usageError(localize, {
        "en-US": `Unknown flag "${argument}". Use the --long form.`,
        "zh-CN": `未知参数 "${argument}"。请使用 -- 开头的完整参数名。`,
      });
    }

    const equalsIndex = argument.indexOf("=");
    const rawKey = equalsIndex !== -1 ? argument.slice(2, equalsIndex) : argument.slice(2);
    if (rawKey === "") {
      throw usageError(localize, {
        "en-US": `Unknown flag "${argument}".`,
        "zh-CN": `未知参数 "${argument}"。`,
      });
    }

    const flagKey = kebabToCamel(rawKey);
    const flagDef = Object.hasOwn(GLOBAL_FLAGS, flagKey)
      ? GLOBAL_FLAGS[flagKey as keyof typeof GLOBAL_FLAGS]
      : undefined;
    if (!flagDef) {
      throw usageError(
        localize,
        {
          "en-US": `Unknown flag "--${rawKey}" before the command path.`,
          "zh-CN": `参数 "--${rawKey}" 不能放在命令路径之前。`,
        },
        {
          "en-US":
            "Only global flags may appear before the command path. Put command-specific and credential flags after the complete command path; use --help to see available flags.",
          "zh-CN":
            "命令路径之前只能使用全局参数。请将命令专属参数和鉴权参数放在完整命令路径之后；使用 --help 查看可用参数。",
        },
      );
    }

    if (flagDef.type === "switch" || equalsIndex !== -1) {
      leadingRest.push(argument);
      index += 1;
      continue;
    }

    const value = argv[index + 1];
    // Preserve an incomplete flag for the unified parser to report its error.
    if (value === undefined || value.startsWith("--")) break;

    leadingRest.push(argument, value);
    index += 2;
  }

  const pathStart = index;
  while (index < argv.length && !argv[index]!.startsWith("-")) index += 1;
  const path = argv.slice(pathStart, index);
  const rest = leadingRest.concat(argv.slice(index));

  return {
    path,
    rest,
    hasHelpFlag: rest.includes("--help"),
    hasVersionFlag: rest.includes("--version"),
    hasIntrospectFlag: rest.includes("--introspect"),
  };
}

/**
 * Second pass — parse the flag region into typed values, driven entirely by the
 * keyed FlagsDef (key = camelCase flag name). Pure: returns typed flags or
 * throws UsageError — never prints/exits. The error boundary decides rendering.
 */
export function parseFlags<F extends FlagsDef>(
  rest: string[],
  defs: F,
  localize: Translator["localize"] = defaultLocalize,
  options: { enforceRequired?: boolean } = {},
): ParsedFlags<F> {
  const flags: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [key, definition] of Object.entries(defs)) {
    if (definition.type === "switch") flags[key] = false;
  }

  let index = 0;
  while (index < rest.length) {
    const argument = rest[index]!;

    if (!argument.startsWith("-")) {
      throw usageError(localize, {
        "en-US": `Unexpected argument: ${argument}`,
        "zh-CN": `非预期参数：${argument}`,
      });
    }
    if (!argument.startsWith("--")) {
      throw usageError(localize, {
        "en-US": `Unknown flag "${argument}". Use the --long form.`,
        "zh-CN": `未知参数 "${argument}"。请使用 -- 开头的完整参数名。`,
      });
    }

    const equalsIndex = argument.indexOf("=");
    const rawKey = equalsIndex !== -1 ? argument.slice(2, equalsIndex) : argument.slice(2);
    let value: string | undefined =
      equalsIndex !== -1 ? argument.slice(equalsIndex + 1) : undefined;

    if (rawKey === "") {
      throw usageError(localize, {
        "en-US": `Unknown flag "${argument}".`,
        "zh-CN": `未知参数 "${argument}"。`,
      });
    }
    const key = kebabToCamel(rawKey);
    const definition = Object.hasOwn(defs, key) ? defs[key] : undefined;
    if (!definition) {
      throw usageError(localize, {
        "en-US": `Unknown flag "--${rawKey}". Run with --help to see available options.`,
        "zh-CN": `未知参数 "--${rawKey}"。请使用 --help 查看可用参数。`,
      });
    }

    if (definition.type === "switch") {
      if (value !== undefined) {
        throw usageError(localize, {
          "en-US": `Flag --${rawKey} is a switch and takes no value.`,
          "zh-CN": `参数 --${rawKey} 是开关，不接受值。`,
        });
      }
      flags[key] = true;
      index += 1;
      continue;
    }

    if (value === undefined) {
      const next = rest[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw usageError(localize, {
          "en-US": `Flag --${rawKey} requires a value.`,
          "zh-CN": `参数 --${rawKey} 需要一个值。`,
        });
      }
      value = next;
      index += 2;
    } else {
      index += 1;
    }

    if (definition.choices && !definition.choices.includes(value)) {
      throw usageError(localize, {
        "en-US": `Flag --${rawKey} must be one of: ${definition.choices.join(", ")}.`,
        "zh-CN": `参数 --${rawKey} 必须为以下值之一：${definition.choices.join(", ")}。`,
      });
    }

    if (definition.type === "array") {
      const values = flags[key] as string[] | undefined;
      if (values) values.push(value);
      else flags[key] = [value];
      continue;
    }

    if (seen.has(key)) {
      throw usageError(localize, {
        "en-US": `Flag --${rawKey} given more than once.`,
        "zh-CN": `参数 --${rawKey} 不能重复指定。`,
      });
    }
    seen.add(key);

    if (definition.type === "number") {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        throw usageError(localize, {
          "en-US": `Flag --${rawKey} requires a finite number.`,
          "zh-CN": `参数 --${rawKey} 需要一个有限数值。`,
        });
      }
      flags[key] = numberValue;
    } else if (definition.type === "boolean") {
      const booleanValue = value.trim().toLowerCase();
      if (booleanValue === "true") flags[key] = true;
      else if (booleanValue === "false") flags[key] = false;
      else
        throw usageError(localize, {
          "en-US": `Flag --${rawKey} requires true or false.`,
          "zh-CN": `参数 --${rawKey} 需要 true 或 false。`,
        });
    } else {
      flags[key] = value;
    }
  }

  // Required enforcement — declarative, driven by the schema.
  const missing = Object.entries(defs)
    .filter(
      ([key, definition]) =>
        options.enforceRequired !== false &&
        definition.type !== "switch" &&
        definition.required === true &&
        flags[key] === undefined,
    )
    .map(([key]) => `--${camelToKebab(key)}`);
  if (missing.length > 0) {
    throw usageError(localize, {
      "en-US": `Missing required ${missing.length > 1 ? "flags" : "flag"}: ${missing.join(", ")}`,
      "zh-CN": `缺少必填参数：${missing.join(", ")}`,
    });
  }

  return flags as unknown as ParsedFlags<F>;
}
