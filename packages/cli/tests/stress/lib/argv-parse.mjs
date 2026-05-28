/**
 * 通用压测脚本 argv 解析：--help、-c/-n/-m及等号形式。
 * @param {string[]} argv 通常为 process.argv
 * @returns {Record<string, string>} CONCURRENCY、COUNT、MODEL 等与环境变量对齐的键
 */
export function parseStressArgv(argv) {
  const overrides = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    /** @param {string} key @param {string | undefined} value */
    const assign = (key, value) => {
      if (value != null && String(value).trim() !== "") {
        overrides[key] = String(value).trim();
      }
    };

    if (arg === "--help" || arg === "-h") {
      overrides.__help = "1";
      continue;
    }
    if (arg === "--concurrency" || arg === "-c") {
      assign("CONCURRENCY", next);
      i++;
      continue;
    }
    if (arg === "--count" || arg === "-n") {
      assign("COUNT", next);
      i++;
      continue;
    }
    if (arg === "--model" || arg === "-m") {
      assign("MODEL", next);
      i++;
      continue;
    }
    if (arg.startsWith("--concurrency=")) {
      assign("CONCURRENCY", arg.slice("--concurrency=".length));
      continue;
    }
    if (arg.startsWith("--count=")) {
      assign("COUNT", arg.slice("--count=".length));
      continue;
    }
    if (arg.startsWith("--model=")) {
      assign("MODEL", arg.slice("--model=".length));
      continue;
    }
    if (arg === "--voice") {
      assign("VOICE", next);
      i++;
      continue;
    }
    if (arg.startsWith("--voice=")) {
      assign("VOICE", arg.slice("--voice=".length));
      continue;
    }
    if (arg === "--report-dir") {
      assign("REPORT_DIR", next);
      i++;
      continue;
    }
    if (arg.startsWith("--report-dir=")) {
      assign("REPORT_DIR", arg.slice("--report-dir=".length));
      continue;
    }
    if (arg === "--reuse-fixtures") {
      overrides.__reuseFixtures = "1";
      continue;
    }
    if (arg === "--setup-only") {
      overrides.__setupOnly = "1";
      continue;
    }
    if (arg === "--fixtures-dir") {
      assign("__fixturesDir", next);
      i++;
      continue;
    }
    if (arg.startsWith("--fixtures-dir=")) {
      assign("__fixturesDir", arg.slice("--fixtures-dir=".length));
      continue;
    }
  }
  return overrides;
}

/**
 * 读取配置：parseStressArgv 结果优先于环境变量。
 * @param {Record<string, string>} argvOverrides parseStressArgv 返回值
 */
export function optFrom(argvOverrides, name) {
  const raw = argvOverrides[name] ?? process.env[name];
  if (raw == null) return undefined;
  const t = String(raw).trim();
  return t === "" ? undefined : t;
}
