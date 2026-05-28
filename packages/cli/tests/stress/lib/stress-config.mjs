/**
 * 压测 count / concurrency 配置：命令行 > stress.defaults.json > 代码内置默认。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STRESS_ROOT } from "./paths.mjs";

/** @type {string | null} */
let cachedConfigPath = null;
/** @type {{ targets?: Record<string, { count?: number, concurrency?: number }> } | null} */
let cachedConfig = null;

/** 代码内置兜底（配置文件缺失某 target 时使用） */
export const CODE_DEFAULTS = {
  text: { count: 100, concurrency: 50 },
  "speech-tts": { count: 50, concurrency: 50 },
  "speech-asr": { count: 50, concurrency: 50 },
  "image-generate": { count: 100, concurrency: 20 },
  "image-edit": { count: 50, concurrency: 20 },
  "video-t2v": { count: 20, concurrency: 10 },
  "video-i2v": { count: 20, concurrency: 20 },
  "video-ref": { count: 20, concurrency: 20 },
  "video-edit": { count: 20, concurrency: 20 },
};

const DEFAULT_CONFIG_PATH = join(STRESS_ROOT, "stress.defaults.json");

/**
 * @param {string} [configPath]
 */
export function loadStressConfig(configPath) {
  const path = configPath?.trim() || process.env.STRESS_CONFIG?.trim() || DEFAULT_CONFIG_PATH;
  if (cachedConfig && cachedConfigPath === path) {
    return cachedConfig;
  }

  if (!existsSync(path)) {
    cachedConfigPath = path;
    cachedConfig = { targets: {} };
    return cachedConfig;
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    cachedConfigPath = path;
    cachedConfig =
      raw && typeof raw === "object" ? /** @type {typeof cachedConfig} */ (raw) : { targets: {} };
    return cachedConfig;
  } catch (e) {
    console.error(`[压测配置] 无法解析 ${path}: ${/** @type {Error} */ (e).message}`);
    cachedConfigPath = path;
    cachedConfig = { targets: {} };
    return cachedConfig;
  }
}

/**
 * @param {string} canonical
 * @param {string} [configPath]
 */
export function getTargetStressDefaults(canonical, configPath) {
  const config = loadStressConfig(configPath);
  const fromFile = config?.targets?.[canonical];
  const fromCode = CODE_DEFAULTS[canonical] ?? { count: 10, concurrency: 5 };
  return {
    count: fromFile?.count ?? fromCode.count,
    concurrency: fromFile?.concurrency ?? fromCode.concurrency,
  };
}

/**
 * @param {string | number | undefined} raw
 * @param {number} fallback
 */
function parsePositiveInt(raw, fallback) {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/**
 * @param {Record<string, string>} argv parseStressArgv 结果
 * @param {string | undefined} key
 */
function argvHas(argv, key) {
  const v = argv[key];
  return v != null && String(v).trim() !== "";
}

/**
 * 解析 count、concurrency。未传 -c 时默认 concurrency = min(count, 配置/代码默认并发)。
 *
 * @param {object} params
 * @param {string} params.canonical 如 text、video-t2v
 * @param {Record<string, string>} params.argv
 * @param {string} [params.configPath]
 */
export function resolveStressCountAndConcurrency({ canonical, argv, configPath }) {
  const defaults = getTargetStressDefaults(canonical, configPath);

  const count = (() => {
    if (argvHas(argv, "COUNT")) {
      return parsePositiveInt(argv.COUNT, defaults.count);
    }
    return parsePositiveInt(defaults.count, 10);
  })();

  const concurrencyExplicit = argvHas(argv, "CONCURRENCY");
  const concurrency = (() => {
    if (concurrencyExplicit) {
      return parsePositiveInt(argv.CONCURRENCY, 1);
    }
    const cap = parsePositiveInt(defaults.concurrency, 1);
    return Math.min(count, cap);
  })();

  return { count, concurrency, concurrencyExplicit };
}
