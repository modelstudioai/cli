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

test.each([
  { label: "numeric page", page: 2, expectedParams: { page: 2, pageSize: 20 } },
  { label: "opaque cursor", page: "opaque+/=&cursor", expectedParams: { pageSize: 20 } },
  { label: "numeric-looking cursor", page: "2", expectedParams: { pageSize: 20 } },
  { label: "NaN page", page: Number.NaN, expectedParams: { pageSize: 20 } },
  { label: "positive infinity page", page: Infinity, expectedParams: { pageSize: 20 } },
  { label: "negative infinity page", page: -Infinity, expectedParams: { pageSize: 20 } },
])(
  "filters $label consistently in local and remote telemetry",
  async ({ page, expectedParams }) => {
    sinkMocks.localSink.mockClear();
    sinkMocks.remoteSink.mockClear();

    await trackCommandExecution(
      { identity, settings: { telemetry: true } as Settings, authMethod: "apiKey" },
      ["managed-agent", "webhook", "events"],
      { page, pageSize: 20 },
      async () => {},
    );

    expect(sinkMocks.localSink).toHaveBeenCalledOnce();
    expect(sinkMocks.remoteSink).toHaveBeenCalledOnce();
    const localEvent = sinkMocks.localSink.mock.calls[0]![0];
    const remoteEvent = sinkMocks.remoteSink.mock.calls[0]![0];
    expect(localEvent.params).toEqual(expectedParams);
    expect(remoteEvent.params).toEqual(expectedParams);
    expect(buildRemoteAemOptions(remoteEvent).c1).toEqual(expectedParams);
  },
);
