import { afterEach, expect, test, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadDetectEnv(): Promise<() => "dev" | "prod"> {
  vi.resetModules();
  const telemetryEnv = await import("../src/telemetry/env.ts");
  return telemetryEnv.detectEnv;
}

test("compiled binary reports prod even when NODE_ENV is development", async () => {
  vi.stubEnv("BAILIAN_COMPILED", "1");
  vi.stubEnv("NODE_ENV", "development");
  const detectEnv = await loadDetectEnv();
  expect(detectEnv()).toBe("prod");
});

test("compiled binary reports prod when NODE_ENV is unset", async () => {
  vi.stubEnv("BAILIAN_COMPILED", "1");
  vi.stubEnv("NODE_ENV", undefined);
  const detectEnv = await loadDetectEnv();
  expect(detectEnv()).toBe("prod");
});

test("NODE_ENV=development reports dev outside a compiled binary", async () => {
  vi.stubEnv("BAILIAN_COMPILED", undefined);
  vi.stubEnv("NODE_ENV", "development");
  const detectEnv = await loadDetectEnv();
  expect(detectEnv()).toBe("dev");
});

test("source tree reports dev when NODE_ENV is production or test", async () => {
  vi.stubEnv("BAILIAN_COMPILED", undefined);
  vi.stubEnv("NODE_ENV", "production");
  const productionDetectEnv = await loadDetectEnv();
  expect(productionDetectEnv()).toBe("dev");

  vi.stubEnv("NODE_ENV", "test");
  const testDetectEnv = await loadDetectEnv();
  expect(testDetectEnv()).toBe("dev");
});
