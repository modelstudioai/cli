import { defineTelemetryCommand, telemetryGatewayPreview } from "../shared/telemetry.ts";
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

export default defineTelemetryCommand({
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
    const format = settings.output;

    if (settings.dryRun) {
      ctx.output.result({
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
        ...telemetryGatewayPreview(settings),
      });
      return;
    }

    ensureTelemetryRegionSupported(settings);

    // Already fully active (service ready AND delivery switch on): nothing to submit.
    let [status, monitorSwitch] = await Promise.all([
      getTelemetryServiceStatus(ctx.client, SERVICE_TYPE, settings.workspaceId),
      getTelemetryGroupSwitch(ctx.client, MONITOR_GROUP_TYPE, settings.workspaceId),
    ]);
    if (status.openStatus && status.instanceStatus === "Ready" && monitorSwitch === true) {
      ctx.output.result(
        { activated: true, alreadyActive: true, ...status },
        {
          text: ctx.localize({
            "en-US": "Monitoring delivery is already active.",
            "zh-CN": "监控数据投递已开启。",
          }),
        },
      );
      return;
    }

    // Step 1: CMS service-linked role.
    await ensureTelemetrySlrAuthorized(ctx.client, "Cms", settings.workspaceId, {
      onProgress: (message) =>
        ctx.output.progress({ "en-US": message, "zh-CN": "正在授权服务关联角色……" }),
    });

    // Step 2: open the CMS service (only submits when still closed; poll openStatus).
    if (!status.openStatus) {
      ctx.output.info({ "en-US": "Opening the CMS service...", "zh-CN": "正在开通 CMS 服务……" });
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
      ctx.output.info({
        "en-US": "Creating the dedicated Prometheus instance...",
        "zh-CN": "正在创建专属 Prometheus 实例……",
      });
      await pollTelemetryData(ctx.client, INIT_STORE_API, {
        ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
        serviceType: SERVICE_TYPE,
      });
    }

    if (flags.noWait) {
      const result = { activated: false, submitted: true };
      ctx.output.result(result, {
        text: ctx.localize({
          "en-US": `Activation submitted. Run \`${ctx.identity.binName} monitor delivery status\` to check progress.`,
          "zh-CN": `开通请求已提交。运行 \`${ctx.identity.binName} monitor delivery status\` 查看进度。`,
        }),
      });
      return;
    }

    ctx.output.info({
      "en-US": "Waiting for the Prometheus instance to become ready...",
      "zh-CN": "正在等待 Prometheus 实例就绪……",
    });
    const after = await waitFor(
      ctx.client,
      settings.workspaceId,
      (candidate) => candidate.openStatus && candidate.instanceStatus === "Ready",
    );

    // Step 4: flip the monitor delivery switch for every model in the workspace.
    if (after.openStatus && after.instanceStatus === "Ready" && monitorSwitch !== true) {
      ctx.output.info({
        "en-US": "Turning on the monitor delivery switch...",
        "zh-CN": "正在开启监控数据投递开关……",
      });
      await ctx.client.console(ENABLE_GROUP_API, {
        reqDTO: buildGroupSwitchReqDTO(settings, MONITOR_GROUP_TYPE),
      });
    }

    const ready = after.openStatus && after.instanceStatus === "Ready";
    let text: string | undefined;
    if (format === "text") {
      text = ready
        ? ctx.localize({
            "en-US": `Monitoring delivery is active.${after.instanceInfo ? `\nInstance: ${after.instanceInfo.instanceId}\nURL: ${after.instanceInfo.instanceUrl}` : ""}`,
            "zh-CN": `监控数据投递已开启。${after.instanceInfo ? `\n实例：${after.instanceInfo.instanceId}\nURL：${after.instanceInfo.instanceUrl}` : ""}`,
          })
        : ctx.localize({
            "en-US": `Activation is still in progress. Run \`${ctx.identity.binName} monitor delivery status\` to check later.`,
            "zh-CN": `服务仍在开通中。稍后运行 \`${ctx.identity.binName} monitor delivery status\` 查看状态。`,
          });
    }
    ctx.output.result({ activated: ready, ...after }, { text });
  },
});
