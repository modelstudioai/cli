import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import {
  buildGroupSwitchReqDTO,
  ENABLE_GROUP_API,
  ensureTelemetryRegionSupported,
  ensureTelemetrySlrAuthorized,
  getTelemetryGroupSwitch,
  getTelemetryServiceStatus,
  pollTelemetryData,
  TELEMETRY_SERVICE_STATUS_API,
  type TelemetryServiceStatus,
} from "../shared/telemetry.ts";

const SLR_STATUS_API = "zeldaEasy.bailian-telemetry.activate.getTelemetrySlrStatus";
const CREATE_SLR_API = "zeldaEasy.bailian-telemetry.activate.createTelemetrySlr";
const INIT_CMS_API = "zeldaEasy.bailian-telemetry.activate.initCmsService";
const INIT_STORE_API = "zeldaEasy.bailian-telemetry.activate.initTelemetryStoreInstance";
const SERVICE_TYPE = "ModelMonitor";
/** Delivery switch telemetryType; distinct from the activate serviceType above. */
const MONITOR_GROUP_TYPE = "Monitor";

const WAIT_INTERVAL_MS = 3000;
const WAIT_TIMEOUT_MS = 120_000;

async function waitFor(
  client: Parameters<typeof getTelemetryServiceStatus>[0],
  workspaceId: string | undefined,
  isReady: (status: TelemetryServiceStatus) => boolean,
): Promise<TelemetryServiceStatus> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let status = await getTelemetryServiceStatus(client, SERVICE_TYPE, workspaceId);
  while (Date.now() < deadline) {
    if (isReady(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    status = await getTelemetryServiceStatus(client, SERVICE_TYPE, workspaceId);
  }
  return status;
}

export default defineCommand({
  description: {
    "en-US":
      "Activate monitoring delivery: CMS SLR authorization, CMS service, and the dedicated Prometheus instance",
    "zh-CN": "开通监控数据投递：CMS SLR 授权、开通 CMS 服务、创建用户独享 Prometheus 实例",
  },
  auth: "console",
  usageArgs: "[--no-wait] [flags]",
  flags: {
    noWait: {
      type: "switch",
      description: {
        "en-US": "Submit the activation requests and return without waiting for Ready",
        "zh-CN": "提交开通请求后直接返回，不等待实例就绪",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Steps: 1) authorize the CMS service-linked role, 2) open the CMS service (async, polled via openStatus), 3) create the dedicated Prometheus instance (async, polled until Ready), 4) turn on the monitor delivery switch for all models. Server-side throttles duplicate submissions within 30s.",
      "zh-CN":
        "开通链路：1）授权 CMS 服务关联角色；2）开通 CMS 服务（异步，以 openStatus 为准）；3）创建用户独享 Prometheus 实例（异步，等待 Ready）；4）为全部模型打开监控投递开关。服务端对 30 秒内的重复提交做节流。",
    },
  ],
  exampleArgs: ["", "--no-wait", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const color = ansi(process.stderr);

    if (settings.dryRun) {
      emitResult(
        {
          apis: [
            SLR_STATUS_API,
            CREATE_SLR_API,
            TELEMETRY_SERVICE_STATUS_API,
            INIT_CMS_API,
            INIT_STORE_API,
            ENABLE_GROUP_API,
          ],
          data: {
            reqDTO: {
              ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
              slrType: "Cms",
              serviceType: SERVICE_TYPE,
              telemetryType: MONITOR_GROUP_TYPE,
            },
          },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);

    // Already fully active (service ready AND delivery switch on): nothing to submit.
    let [status, monitorSwitch] = await Promise.all([
      getTelemetryServiceStatus(ctx.client, SERVICE_TYPE, settings.workspaceId),
      getTelemetryGroupSwitch(ctx.client, MONITOR_GROUP_TYPE, settings.workspaceId),
    ]);
    if (status.openStatus && status.instanceStatus === "Ready" && monitorSwitch === true) {
      if (format === "json") {
        emitResult({ activated: true, alreadyActive: true, ...status }, format);
      } else {
        process.stdout.write("Monitoring delivery is already active.\n");
      }
      return;
    }

    // Step 1: CMS service-linked role.
    await ensureTelemetrySlrAuthorized(ctx.client, "Cms", settings.workspaceId, {
      onProgress: (message) => process.stderr.write(color.dim(message + "\n")),
    });

    // Step 2: open the CMS service (only submits when still closed; poll openStatus).
    if (!status.openStatus) {
      process.stderr.write(color.dim("Opening the CMS service...\n"));
      await ctx.client.console(INIT_CMS_API, {
        reqDTO: {
          ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
          slrType: "Cms",
        },
      });
      if (!flags.noWait) {
        status = await waitFor(
          ctx.client,
          settings.workspaceId,
          (candidate) => candidate.openStatus,
        );
      }
    }

    // Step 3: dedicated Prometheus instance (async creation, poll until Ready).
    if (status.instanceStatus === "NotExist") {
      process.stderr.write(color.dim("Creating the dedicated Prometheus instance...\n"));
      await pollTelemetryData(ctx.client, INIT_STORE_API, {
        ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
        serviceType: SERVICE_TYPE,
      });
    }

    if (flags.noWait) {
      const result = { activated: false, submitted: true };
      if (format === "json") {
        emitResult(result, format);
      } else {
        process.stdout.write(
          `Activation submitted. Run \`${ctx.identity.binName} monitor delivery status\` to check progress.\n`,
        );
      }
      return;
    }

    process.stderr.write(color.dim("Waiting for the Prometheus instance to become ready...\n"));
    const after = await waitFor(
      ctx.client,
      settings.workspaceId,
      (candidate) => candidate.openStatus && candidate.instanceStatus === "Ready",
    );

    // Step 4: flip the monitor delivery switch for every model in the workspace.
    if (after.openStatus && after.instanceStatus === "Ready" && monitorSwitch !== true) {
      process.stderr.write(color.dim("Turning on the monitor delivery switch...\n"));
      await ctx.client.console(ENABLE_GROUP_API, {
        reqDTO: buildGroupSwitchReqDTO(settings, MONITOR_GROUP_TYPE),
      });
    }

    const ready = after.openStatus && after.instanceStatus === "Ready";
    if (format === "json") {
      emitResult({ activated: ready, ...after }, format);
      return;
    }
    if (ready) {
      process.stdout.write("Monitoring delivery is active.\n");
      if (after.instanceInfo) {
        process.stdout.write(`Instance: ${after.instanceInfo.instanceId}\n`);
        process.stdout.write(`URL: ${after.instanceInfo.instanceUrl}\n`);
      }
    } else {
      process.stdout.write(
        `Activation is still in progress. Run \`${ctx.identity.binName} monitor delivery status\` to check later.\n`,
      );
    }
  },
});
