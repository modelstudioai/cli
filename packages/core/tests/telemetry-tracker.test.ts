import { expect, test, vi } from "vite-plus/test";
import type { Identity, Settings } from "../src/config/schema.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";
import { buildRemoteAemOptions, type TrackingEvent } from "../src/telemetry/event.ts";

const sinkMocks = vi.hoisted(() => ({
  localSink: vi.fn<(event: TrackingEvent) => Promise<void>>(async () => {}),
  remoteSink: vi.fn<(event: TrackingEvent) => Promise<void>>(async () => {}),
}));

vi.mock("../src/telemetry/sink.ts", () => sinkMocks);

import { trackCommandExecution } from "../src/telemetry/tracker.ts";

const identity: Identity = {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli-test",
  npmPackage: "bailian-cli",
};

test("records BailianError exitCode in local events and AEM ext", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  const error = new BailianError("该操作会永久删除文档。", ExitCode.CONFIRMATION_REQUIRED);

  await expect(
    trackCommandExecution(
      {
        identity,
        settings: { telemetry: true } as Settings,
        authMethod: "apiKey",
      },
      ["knowledge", "doc", "delete"],
      {},
      async () => {
        throw error;
      },
    ),
  ).rejects.toBe(error);

  expect(sinkMocks.localSink).toHaveBeenCalledOnce();
  const event = sinkMocks.localSink.mock.calls[0]![0];
  expect(event).toMatchObject({
    command: "knowledge doc delete",
    success: false,
    exitCode: 7,
    errorMessage: "该操作会永久删除文档。",
  });
  expect(buildRemoteAemOptions(event)).toMatchObject({
    ext: expect.objectContaining({ exitCode: 7 }),
  });
});
