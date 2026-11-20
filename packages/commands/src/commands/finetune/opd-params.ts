import { defineCommand, getFineTuneParams, type FlagsDef } from "bailian-cli-core";

const OPD_PARAMS_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Student base model to query OPD parameters for (e.g. qwen3.5-9b)",
      "zh-CN": "要查询 OPD 参数的学生基座模型（例如 qwen3.5-9b）",
    },
    required: true,
  },
  paramType: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US":
        "Parameter group: hyper (training) | resource (GPUs / teacher). Omit to return all groups.",
      "zh-CN": "参数类别：hyper（训练）| resource（GPU / 教师资源）。不传返回全部分类。",
    },
    choices: ["hyper", "resource"] as const,
  },
  mtuSpecCode: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US": "MTU spec code for resource-group queries (e.g. MTU4)",
      "zh-CN": "查询资源类参数时的 MTU 规格编码（例如 MTU4）",
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound.",
      "zh-CN": "以 X-DashScope-WorkSpace 头发送的业务空间 ID；API Key 已绑定空间时可省略。",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Query OPD (pg_opd) training / resource parameter configuration for a student model",
    "zh-CN": "查询学生模型的 OPD（pg_opd）训练 / 资源参数配置",
  },
  auth: "apiKey",
  usageArgs:
    "--base-model <model> [--param-type <hyper|resource>] [--mtu-spec-code <code>] [--workspace-id <id>]",
  flags: OPD_PARAMS_FLAGS,
  exampleArgs: [
    "--base-model qwen3.5-9b",
    "--base-model qwen3.5-9b --param-type hyper",
    "--base-model qwen3.5-9b --param-type resource --mtu-spec-code MTU4",
    "--base-model qwen3.5-9b --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Queries GET /api/v1/fine-tunes/fine-tunes-params with training_type=pg_opd. Entries keep server field names verbatim (recommend_value, defaultValue, data_range, ...).",
      "zh-CN":
        "以 training_type=pg_opd 调用 GET /api/v1/fine-tunes/fine-tunes-params。每条参数原样保留服务端字段名（recommend_value、defaultValue、data_range 等）。",
    },
    {
      "en-US":
        "recommend_value is NOT the selected teacher's effective default: external teachers (e.g. Flash/Max) carry their own default resources resolved server-side at submit time. Use this output for ranges/enums, not as a recipe to fill into requests.",
      "zh-CN":
        "recommend_value 不是所选教师的有效默认值：外接教师（如 Flash/Max）有各自的默认资源，由服务端在提交时解析。本输出用于查看范围/枚举，不要当作配方填入请求。",
    },
    {
      "en-US":
        "Compatible-teacher discovery is not exposed by the parameter API yet; teacher/student compatibility is validated server-side when submitting via finetune opd run.",
      "zh-CN":
        "参数接口尚未提供兼容教师发现；教师/学生兼容性在通过 finetune opd run 提交时由服务端校验。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = flags.workspaceId ?? settings.workspaceId;

    if (settings.dryRun) {
      const preview = {
        action: "finetune.opd.params",
        base_model: flags.baseModel,
        training_type: "pg_opd",
        ...(flags.paramType ? { param_type: flags.paramType } : {}),
        ...(flags.mtuSpecCode ? { mtu_spec_code: flags.mtuSpecCode } : {}),
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      };
      ctx.output.result(
        preview,
        settings.output === "text" ? { text: JSON.stringify(preview, null, 2) } : undefined,
      );
      return;
    }

    const response = await getFineTuneParams(ctx.client, {
      inputModel: flags.baseModel,
      trainingType: "pg_opd",
      paramType: flags.paramType || undefined,
      mtuSpecCode: flags.mtuSpecCode || undefined,
      workspaceId,
    });
    ctx.output.result(
      response,
      settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
