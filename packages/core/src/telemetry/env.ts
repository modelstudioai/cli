/**
 * 判断当前运行环境。任一条件为真即视为 dev,默认 prod。
 *
 * 1. NODE_ENV=development — Node 圈通用约定,测试同学/CI 可显式声明
 * 2. Bun 编译二进制（BAILIAN_COMPILED=1）— 一律 prod
 * 3. 当前模块文件路径不在 node_modules 里 — 自动识别从源码运行(pnpm dev /
 *    npm link / 直接 pnpm -F bailian-cli exec tsx src/main.ts),避免开发者忘记设环境变量
 *    时仍把数据打到 prod
 *
 * 缓存结果,模块加载期算一次就行。
 */
let cachedEnv: "dev" | "prod" | undefined;

export function detectEnv(): "dev" | "prod" {
  if (cachedEnv) return cachedEnv;
  if (process.env.NODE_ENV === "development") {
    cachedEnv = "dev";
    return cachedEnv;
  }
  if (process.env.BAILIAN_COMPILED === "1") {
    cachedEnv = "prod";
    return cachedEnv;
  }
  cachedEnv = import.meta.url.includes("/node_modules/") ? "prod" : "dev";
  return cachedEnv;
}
