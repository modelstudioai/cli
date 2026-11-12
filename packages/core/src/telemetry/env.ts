/**
 * 判断当前运行环境。默认 prod。
 *
 * 1. Bun 编译二进制（BAILIAN_COMPILED=1）— 一律 prod。必须先于 NODE_ENV：
 *    `bun build --compile` 会把 `process.env.NODE_ENV` 内联成构建机的值，
 *    未设置时是 `"development"`。放在前面会让二进制流量全部记成 dev。
 *    release 编译同时 `--define process.env.NODE_ENV="production"`。
 * 2. NODE_ENV=development — 仅非二进制。测试同学/CI 可显式声明
 * 3. 当前模块文件路径不在 node_modules 里 — 自动识别从源码运行(pnpm dev /
 *    npm link / 直接 pnpm -F bailian-cli exec tsx src/main.ts),避免开发者忘记设环境变量
 *    时仍把数据打到 prod
 *
 * 这两处必须直接读取 `process.env.*`。包一层再读，Bun 的 `--define` 匹配不到，
 * 编译进二进制的标记会失效。缓存结果,模块加载期算一次就行。
 */
let cachedEnv: "dev" | "prod" | undefined;

export function detectEnv(): "dev" | "prod" {
  if (cachedEnv) return cachedEnv;
  if (process.env.BAILIAN_COMPILED === "1") {
    cachedEnv = "prod";
    return cachedEnv;
  }
  if (process.env.NODE_ENV === "development") {
    cachedEnv = "dev";
    return cachedEnv;
  }
  cachedEnv = import.meta.url.includes("/node_modules/") ? "prod" : "dev";
  return cachedEnv;
}
