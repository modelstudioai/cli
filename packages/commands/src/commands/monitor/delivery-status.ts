import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { ansi, emitResult, displayWidth, padEnd } from "bailian-cli-runtime";
import { formatDateTime } from "../shared/format.ts";
import {
  ensureTelemetryRegionSupported,
  getTelemetryGroupSwitch,
  getTelemetryServiceStatus,
  getTelemetrySlrAuthorized,
  type TelemetryServiceStatus,
} from "../shared/telemetry.ts";

const SERVICE_TYPE = "ModelMonitor";
/** Delivery switch telemetryType; distinct from the activate serviceType above. */
const MONITOR_GROUP_TYPE = "Monitor";

function printStatus(
  cmsSlrAuthorized: boolean,
  status: TelemetryServiceStatus,
  deliverySwitch: boolean | null,
  binName: string,
): void {
  const color = ansi(process.stdout);

  const rows: [string, string][] = [
    ["CMS SLR Authorization", cmsSlrAuthorized ? "Authorized" : "Not authorized"],
    ["Service Open", status.openStatus ? "Yes" : "No"],
    ["Instance Status", status.instanceStatus ?? "-"],
    [
      "Delivery Switch",
      deliverySwitch === null ? "Never configured" : deliverySwitch ? "On" : "Off",
    ],
  ];

  const info = status.instanceInfo;
  if (info) {
    rows.push(["Instance ID", info.instanceId]);
    if (info.instanceName) rows.push(["Instance Name", info.instanceName]);
    if (info.regionName) rows.push(["Region", info.regionName]);
    rows.push(["Instance URL", info.instanceUrl]);
    if (info.gmtCreate) rows.push(["Created At", formatDateTime(info.gmtCreate)]);
  }

  const maxLabel = Math.max(...rows.map(([label]) => displayWidth(label)));
  for (const [label, value] of rows) {
    process.stdout.write(`${color.bold(padEnd(label, maxLabel + 2))}${value}\n`);
  }

  if (!status.openStatus || deliverySwitch !== true) {
    process.stdout.write(
      color.dim(`\nRun \`${binName} monitor delivery enable\` to activate monitoring delivery.\n`),
    );
  }
}

export default defineCommand({
  description: {
    "en-US": "Show monitoring delivery (Prometheus instance) status",
    "zh-CN": "查看监控数据投递（Prometheus 实例）状态",
  },
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings, identity } = ctx;
    const format = detectOutputFormat(settings.output);

    ensureTelemetryRegionSupported(settings);
    // All three lookups are independent reads; fan them out in parallel.
    const [cmsSlrAuthorized, status, deliverySwitch] = await Promise.all([
      getTelemetrySlrAuthorized(ctx.client, "Cms", settings.workspaceId),
      getTelemetryServiceStatus(ctx.client, SERVICE_TYPE, settings.workspaceId),
      getTelemetryGroupSwitch(ctx.client, MONITOR_GROUP_TYPE, settings.workspaceId),
    ]);

    if (format === "json") {
      emitResult({ cmsSlrAuthorized, deliverySwitch, ...status }, format);
      return;
    }

    printStatus(cmsSlrAuthorized, status, deliverySwitch, identity.binName);
  },
});
