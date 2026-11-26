import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { Identity, Settings } from "../src/config/schema.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";
import type { CallerAttribution } from "../src/telemetry/caller.ts";
import {
  buildFirstInstallAemOptions,
  buildRemoteAemOptions,
  createTrackingEvent,
  isFirstInstallEvent,
  type FirstInstallEvent,
  type TrackingEvent,
} from "../src/telemetry/event.ts";
import {
  FIRST_INSTALL_REPORT_ARGUMENT,
  FIRST_INSTALL_REPORT_FILE,
  isFirstInstallReportLaunch,
} from "../src/telemetry/first-install.ts";

type ReportedEvent = TrackingEvent | FirstInstallEvent;

const sinkMocks = vi.hoisted(() => ({
  localSink: vi.fn<(event: ReportedEvent) => Promise<void>>(async () => {}),
  remoteSink: vi.fn<(event: ReportedEvent) => Promise<boolean>>(async () => false),
  flushTelemetry: vi.fn(async () => {}),
}));

vi.mock("../src/telemetry/sink.ts", () => sinkMocks);

import { reportFirstInstallNow, trackCommandExecution } from "../src/telemetry/tracker.ts";

function asCommand(event: ReportedEvent): TrackingEvent {
  if (isFirstInstallEvent(event)) {
    throw new Error("expected a command event");
  }
  return event;
}

const identity: Identity = {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli-test",
  npmPackage: "bailian-cli",
};

const unknownCaller: CallerAttribution = { callerType: "unknown" };
const agentCaller: CallerAttribution = {
  callerType: "agent",
  callerName: "cursor",
  skillName: "bailian-cli",
  skillVersion: "2.5.0",
};
const scriptCaller: CallerAttribution = {
  callerType: "script",
  callerName: "cursor",
};

const savedConfigDir = process.env.BAILIAN_CONFIG_DIR;
let isolatedConfigDir = "";

beforeEach(() => {
  isolatedConfigDir = mkdtempSync(join(tmpdir(), "bl-telemetry-home-"));
  process.env.BAILIAN_CONFIG_DIR = isolatedConfigDir;
});

afterEach(() => {
  if (savedConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
  else process.env.BAILIAN_CONFIG_DIR = savedConfigDir;
  rmSync(isolatedConfigDir, { recursive: true, force: true });
  sinkMocks.remoteSink.mockReset();
  sinkMocks.remoteSink.mockImplementation(async () => false);
});

test("the install report launch requires both the env var and its argument", () => {
  const saved = process.env.BAILIAN_FIRST_INSTALL_REPORT;
  try {
    delete process.env.BAILIAN_FIRST_INSTALL_REPORT;
    expect(isFirstInstallReportLaunch([FIRST_INSTALL_REPORT_ARGUMENT])).toBe(false);
    expect(isFirstInstallReportLaunch([])).toBe(false);
    process.env.BAILIAN_FIRST_INSTALL_REPORT = "1";
    expect(isFirstInstallReportLaunch([])).toBe(false);
    expect(isFirstInstallReportLaunch(["skill", "init"])).toBe(false);
    expect(isFirstInstallReportLaunch([FIRST_INSTALL_REPORT_ARGUMENT, "--version"])).toBe(false);
    expect(isFirstInstallReportLaunch([FIRST_INSTALL_REPORT_ARGUMENT])).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.BAILIAN_FIRST_INSTALL_REPORT;
    else process.env.BAILIAN_FIRST_INSTALL_REPORT = saved;
  }
});

test("derives event version and prefix from identity", () => {
  const event = createTrackingEvent({
    command: "config show",
    durationMs: 1,
    success: true,
    identity: { ...identity, version: "identity-version" },
    caller: unknownCaller,
  });
  expect(event).toMatchObject({
    command: "config show",
    cliVersion: "identity-version",
    commandPrefix: "bl",
    site: "domestic",
  });
  expect(buildRemoteAemOptions(event)).toMatchObject({
    ext: { cliVersion: "identity-version", commandPrefix: "bl", site: "domestic" },
  });
});

test("resolveSite runs in finally and attaches site fields", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  let calledAfterCommand = false;
  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true } as Settings,
      authMethod: "apiKey",
      caller: unknownCaller,
      resolveSite: () => {
        calledAfterCommand = true;
        return { site: "international", siteReason: "positive-international" };
      },
    },
    ["text", "chat"],
    {},
    async () => {
      expect(calledAfterCommand).toBe(false);
    },
  );
  expect(calledAfterCommand).toBe(true);
  const event = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  expect(event).toMatchObject({
    site: "international",
    siteReason: "positive-international",
  });
  expect(buildRemoteAemOptions(event).ext).toMatchObject({
    site: "international",
    siteReason: "positive-international",
  });
});

test("resolveSite failure still emits domestic event", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true } as Settings,
      caller: unknownCaller,
      resolveSite: () => {
        throw new Error("resolve boom");
      },
    },
    ["config", "show"],
    {},
    async () => {},
  );
  expect(asCommand(sinkMocks.localSink.mock.calls[0]![0])).toMatchObject({
    site: "domestic",
    siteReason: "default-fallback",
  });
});

const entryIdentities = [
  {
    label: "bl",
    identity: { ...identity, clientName: "bailian-cli" },
    expected: { commandPrefix: "bl" },
  },
  {
    label: "kscli",
    identity: {
      ...identity,
      binName: "kscli",
      clientName: "knowledge-studio-cli",
      npmPackage: "knowledge-studio-cli",
    },
    expected: { commandPrefix: "kscli" },
  },
  {
    label: "aliyun bl",
    identity: {
      ...identity,
      commandInvocation: { bin: "aliyun", path: ["bl"] },
      clientName: "bailian-cli",
    },
    expected: { commandPrefix: "aliyun bl" },
  },
];

test.each(
  entryIdentities.flatMap((entry) => [true, false].map((success) => ({ ...entry, success }))),
)("preserves $label entry in local and remote events (success=$success)", async (entry) => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  const error = new BailianError("Example failure", ExitCode.GENERAL);
  const execution = trackCommandExecution(
    {
      identity: entry.identity,
      settings: { telemetry: true } as Settings,
      authMethod: "none",
      caller: agentCaller,
    },
    ["config", "show"],
    { commandPrefix: "untrusted flag", clientName: "untrusted flag" },
    async () => {
      if (!entry.success) throw error;
    },
  );
  if (entry.success) await execution;
  else await expect(execution).rejects.toBe(error);

  expect(sinkMocks.localSink).toHaveBeenCalledOnce();
  expect(sinkMocks.remoteSink).toHaveBeenCalledOnce();
  const localEvent = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  const remoteEvent = asCommand(sinkMocks.remoteSink.mock.calls[0]![0]);
  expect(localEvent).toMatchObject({
    ...entry.expected,
    command: "config show",
    cliVersion: "0.0.0-test",
    success: entry.success,
    callerType: "agent",
    callerName: "cursor",
  });
  expect(localEvent.params).toBeUndefined();
  expect(remoteEvent).toEqual(localEvent);
  expect(buildRemoteAemOptions(remoteEvent)).toMatchObject({
    ext: entry.expected,
    c2: entry.success ? "success" : "failure",
  });
  for (const field of ["binName", "clientName"]) {
    expect(localEvent).not.toHaveProperty(field);
    expect(buildRemoteAemOptions(remoteEvent).ext).not.toHaveProperty(field);
  }
});

test("ignores obsolete display overrides when deriving the entry", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  const legacyIdentity = { ...identity, commandPrefix: "untrusted legacy override" };
  await trackCommandExecution(
    {
      identity: legacyIdentity,
      settings: { telemetry: true } as Settings,
      caller: unknownCaller,
    },
    ["config", "show"],
    {},
    async () => {},
  );
  const event = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  expect(event).toMatchObject({ commandPrefix: "bl" });
  expect(buildRemoteAemOptions(event)).toMatchObject({
    ext: { commandPrefix: "bl" },
  });
});

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
        caller: unknownCaller,
      },
      ["knowledge", "doc", "delete"],
      {},
      async () => {
        throw error;
      },
    ),
  ).rejects.toBe(error);

  expect(sinkMocks.localSink).toHaveBeenCalledOnce();
  const event = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  expect(event).toMatchObject({
    command: "knowledge doc delete",
    success: false,
    exitCode: 7,
    errorMessage: "该操作会永久删除文档。",
    callerType: "unknown",
  });
  expect(event.callerName).toBeUndefined();
  expect(event.skillName).toBeUndefined();
  expect(event.skillVersion).toBeUndefined();
  expect(buildRemoteAemOptions(event)).toMatchObject({
    ext: expect.objectContaining({ exitCode: 7, callerType: "unknown" }),
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
      {
        identity,
        settings: { telemetry: true } as Settings,
        authMethod: "apiKey",
        caller: unknownCaller,
      },
      ["managed-agent", "webhook", "events"],
      { page, pageSize: 20 },
      async () => {},
    );

    expect(sinkMocks.localSink).toHaveBeenCalledOnce();
    expect(sinkMocks.remoteSink).toHaveBeenCalledOnce();
    const localEvent = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
    const remoteEvent = asCommand(sinkMocks.remoteSink.mock.calls[0]![0]);
    expect(localEvent.params).toEqual(expectedParams);
    expect(remoteEvent.params).toEqual(expectedParams);
    expect(buildRemoteAemOptions(remoteEvent).c1).toEqual(expectedParams);
  },
);

test("keeps agent attribution on success and in AEM ext", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();

  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true } as Settings,
      authMethod: "apiKey",
      caller: agentCaller,
    },
    ["config", "show"],
    {},
    async () => {},
  );

  const event = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  expect(event).toMatchObject({
    success: true,
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
    skillVersion: "2.5.0",
  });
  expect(event.params).toBeUndefined();
  expect(buildRemoteAemOptions(event)).toMatchObject({
    ext: expect.objectContaining({
      callerType: "agent",
      callerName: "cursor",
      skillName: "bailian-cli",
      skillVersion: "2.5.0",
    }),
  });
});

test("keeps script attribution with callerName and without skill leak", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();

  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true } as Settings,
      authMethod: "apiKey",
      caller: scriptCaller,
    },
    ["config", "show"],
    {},
    async () => {},
  );

  const event = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  expect(event).toMatchObject({
    success: true,
    callerType: "script",
    callerName: "cursor",
  });
  expect(event.skillName).toBeUndefined();
  expect(event.skillVersion).toBeUndefined();
  expect(event.params).toBeUndefined();
  const remoteExt = buildRemoteAemOptions(event).ext as Record<string, unknown>;
  expect(remoteExt).toMatchObject({
    callerType: "script",
    callerName: "cursor",
  });
  expect(remoteExt).not.toHaveProperty("skillName");
  expect(remoteExt).not.toHaveProperty("skillVersion");
});

test("a command keeps the install channel and does not send first_install", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  sinkMocks.remoteSink.mockResolvedValue(true);
  const installedAt = "2020-01-02T03:04:05.000Z";
  const recordPath = join(isolatedConfigDir, "install.json");
  const recordText = `${JSON.stringify({
    version: 1,
    first_installed_at: installedAt,
    observed_at: installedAt,
    first_version: "2.8.6",
    install_channel: "npm",
  })}\n`;
  writeFileSync(recordPath, recordText);

  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true } as Settings,
      authMethod: "none",
      caller: unknownCaller,
    },
    ["skill", "init"],
    {},
    async () => {},
  );

  const commandEvent = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
  expect(isFirstInstallEvent(commandEvent)).toBe(false);
  if (isFirstInstallEvent(commandEvent)) return;
  expect(commandEvent.command).toBe("skill init");
  expect(commandEvent.installChannel).toBe("npm");
  expect(commandEvent.timestamp).not.toBe(installedAt);
  expect(commandEvent).not.toHaveProperty("firstInstalledAt");
  expect(buildRemoteAemOptions(commandEvent).ext).not.toHaveProperty("firstInstalledAt");
  expect(readFileSync(recordPath, "utf8")).toBe(recordText);
  expect(sinkMocks.localSink).toHaveBeenCalledOnce();
  expect(existsSync(join(isolatedConfigDir, FIRST_INSTALL_REPORT_FILE))).toBe(false);
});

test("reports first_install once when install has just succeeded", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  sinkMocks.remoteSink.mockResolvedValue(true);
  const installedAt = "2020-01-02T03:04:05.000Z";
  writeFileSync(
    join(isolatedConfigDir, "install.json"),
    `${JSON.stringify({
      version: 1,
      first_installed_at: installedAt,
      observed_at: installedAt,
      first_version: "2.8.6",
      install_channel: "binary",
    })}\n`,
  );

  await reportFirstInstallNow(identity);
  await reportFirstInstallNow(identity);

  const installReports = sinkMocks.localSink.mock.calls
    .map(([event]) => event)
    .filter(isFirstInstallEvent);
  expect(installReports).toHaveLength(1);
  const installEvent = installReports[0]!;
  expect(installEvent.firstInstalledAt).toBe(installedAt);
  expect(installEvent.installChannel).toBe("binary");
  expect(installEvent.cliVersion).toBe(identity.version);
  expect(installEvent.timestamp).not.toBe(installedAt);
  expect(buildFirstInstallAemOptions(installEvent)).toEqual({
    et: "EXP",
    ext: {
      timestamp: installEvent.timestamp,
      firstInstalledAt: installedAt,
      installChannel: "binary",
      cliVersion: identity.version,
    },
  });
  expect(
    JSON.parse(readFileSync(join(isolatedConfigDir, FIRST_INSTALL_REPORT_FILE), "utf8")),
  ).toEqual({
    attempts: 1,
    firstInstalledAt: installedAt,
  });
});

test("omits install fields when the file is missing or the product is not bailian-cli", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const configDir = mkdtempSync(join(tmpdir(), "bl-install-telemetry-empty-"));
  mkdirSync(configDir, { recursive: true });
  process.env.BAILIAN_CONFIG_DIR = configDir;

  try {
    await trackCommandExecution(
      {
        identity,
        settings: { telemetry: true } as Settings,
        authMethod: "none",
        caller: unknownCaller,
      },
      ["config", "show"],
      {},
      async () => {},
    );
    const missing = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
    expect(isFirstInstallEvent(missing)).toBe(false);
    if (!isFirstInstallEvent(missing)) {
      expect(missing.installChannel).toBeUndefined();
      expect(missing).not.toHaveProperty("firstInstalledAt");
    }
    expect(sinkMocks.localSink).toHaveBeenCalledOnce();

    writeFileSync(
      join(configDir, "install.json"),
      `${JSON.stringify({
        version: 1,
        observed_at: "2020-01-02T03:04:05Z",
        install_channel: "binary",
      })}\n`,
    );
    sinkMocks.localSink.mockClear();
    await trackCommandExecution(
      {
        identity,
        settings: { telemetry: true } as Settings,
        authMethod: "none",
        caller: unknownCaller,
      },
      ["config", "show"],
      {},
      async () => {},
    );
    const existing = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
    expect(isFirstInstallEvent(existing)).toBe(false);
    if (!isFirstInstallEvent(existing)) {
      expect(existing.installChannel).toBe("binary");
      expect(existing).not.toHaveProperty("firstInstalledAt");
    }
    expect(sinkMocks.localSink).toHaveBeenCalledOnce();

    sinkMocks.localSink.mockClear();
    await trackCommandExecution(
      {
        identity: {
          ...identity,
          npmPackage: "knowledge-studio-cli",
          clientName: "knowledge-studio-cli",
        },
        settings: { telemetry: true } as Settings,
        authMethod: "none",
        caller: unknownCaller,
      },
      ["config", "show"],
      {},
      async () => {},
    );
    const kscliEvent = asCommand(sinkMocks.localSink.mock.calls[0]![0]);
    expect(isFirstInstallEvent(kscliEvent)).toBe(false);
    if (!isFirstInstallEvent(kscliEvent)) {
      expect(kscliEvent.installChannel).toBeUndefined();
      expect(kscliEvent).not.toHaveProperty("firstInstalledAt");
    }
    expect(sinkMocks.localSink).toHaveBeenCalledOnce();
  } finally {
    if (saved === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = saved;
    rmSync(configDir, { recursive: true, force: true });
  }
});

test("a failed install report does not consume the one attempt", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  const installedAt = "2020-01-02T03:04:05Z";
  writeFileSync(
    join(isolatedConfigDir, "install.json"),
    `${JSON.stringify({
      version: 1,
      first_installed_at: installedAt,
      observed_at: installedAt,
      first_version: "2.8.6",
      install_channel: "npm",
    })}\n`,
  );

  await reportFirstInstallNow(identity);
  expect(existsSync(join(isolatedConfigDir, FIRST_INSTALL_REPORT_FILE))).toBe(false);

  sinkMocks.remoteSink.mockResolvedValue(true);
  await reportFirstInstallNow(identity);

  const installReports = sinkMocks.localSink.mock.calls
    .map(([event]) => event)
    .filter(isFirstInstallEvent);
  expect(installReports).toHaveLength(2);
  expect(
    JSON.parse(readFileSync(join(isolatedConfigDir, FIRST_INSTALL_REPORT_FILE), "utf8")),
  ).toEqual({
    attempts: 1,
    firstInstalledAt: installedAt,
  });
});

test("a first-install report respects telemetry: false", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  sinkMocks.remoteSink.mockResolvedValue(true);
  const installedAt = "2020-01-02T03:04:05.000Z";
  writeFileSync(
    join(isolatedConfigDir, "config.json"),
    `${JSON.stringify({ telemetry: false })}\n`,
  );
  writeFileSync(
    join(isolatedConfigDir, "install.json"),
    `${JSON.stringify({
      version: 1,
      first_installed_at: installedAt,
      observed_at: installedAt,
      first_version: "2.8.6",
      install_channel: "binary",
    })}\n`,
  );

  await reportFirstInstallNow(identity);

  expect(sinkMocks.localSink).not.toHaveBeenCalled();
  expect(sinkMocks.remoteSink).not.toHaveBeenCalled();
  expect(existsSync(join(isolatedConfigDir, FIRST_INSTALL_REPORT_FILE))).toBe(false);
});

test("does not call sinks when telemetry is disabled", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  const next = vi.fn(async () => {});

  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: false } as Settings,
      authMethod: "apiKey",
      caller: agentCaller,
    },
    ["config", "show"],
    {},
    next,
  );

  expect(next).toHaveBeenCalledOnce();
  expect(sinkMocks.localSink).not.toHaveBeenCalled();
  expect(sinkMocks.remoteSink).not.toHaveBeenCalled();
  expect(existsSync(join(isolatedConfigDir, FIRST_INSTALL_REPORT_FILE))).toBe(false);
});

test("reports bizFrom as a structured field and dedicated AEM c6 column", () => {
  const event = createTrackingEvent({
    command: "flow-agent create",
    durationMs: 1,
    success: true,
    identity,
    caller: unknownCaller,
    bizFrom: "coze",
  });
  expect(event.bizFrom).toBe("coze");
  const opts = buildRemoteAemOptions(event);
  expect(opts.c6).toBe("coze");
  expect(opts.ext).toMatchObject({ bizFrom: "coze" });
});

test("omits bizFrom and c6 when no source is declared", () => {
  const event = createTrackingEvent({
    command: "flow-agent create",
    durationMs: 1,
    success: true,
    identity,
    caller: unknownCaller,
  });
  expect(event.bizFrom).toBeUndefined();
  const opts = buildRemoteAemOptions(event);
  expect(opts).not.toHaveProperty("c6");
  expect(opts.ext).not.toHaveProperty("bizFrom");
});

test.each([
  { label: "valid", bizFrom: "My Skill", expected: "my-skill" },
  { label: "underscore", bizFrom: "qwen_code", expected: "qwen-code" },
  { label: "invalid", bizFrom: "bad/name!", expected: "unknown" },
  { label: "blank", bizFrom: "   ", expected: "unknown" },
  { label: "empty", bizFrom: "", expected: "unknown" },
])("normalizes settings.bizFrom ($label) into the event and c6", async ({ bizFrom, expected }) => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true, bizFrom } as Settings,
      authMethod: "console",
      caller: unknownCaller,
    },
    ["flow-agent", "create"],
    {},
    async () => {},
  );
  const event = asCommand(sinkMocks.remoteSink.mock.calls[0]![0]);
  expect(event.bizFrom).toBe(expected);
  expect(buildRemoteAemOptions(event).c6).toBe(expected);
});

test("absent settings.bizFrom omits the field and c6", async () => {
  sinkMocks.localSink.mockClear();
  sinkMocks.remoteSink.mockClear();
  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: true } as Settings,
      authMethod: "console",
      caller: unknownCaller,
    },
    ["flow-agent", "create"],
    {},
    async () => {},
  );
  const event = asCommand(sinkMocks.remoteSink.mock.calls[0]![0]);
  expect(event.bizFrom).toBeUndefined();
  expect(buildRemoteAemOptions(event)).not.toHaveProperty("c6");
});
