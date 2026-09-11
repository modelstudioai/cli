import { defineCommand, detectOutputFormat, UsageError } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";

/** Pinned CLI presets, not a live catalog or a guarantee of regional availability. */
export const SANDBOX_IMAGES = [
  {
    id: "code-interpreter",
    imageName: "代码解释器",
    imageUrl: "fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/code-interpreter-v1:v0.0.44",
    icon: "https://img.alicdn.com/imgextra/i2/O1CN01iX8RH9ckFvC093x2_!!6000000000905-2-tps-72-72.png",
    description: {
      "en-US": "Python / Node.js runtimes with common data-processing libraries",
      "zh-CN": "Python / Node.js 运行时+常用数据处理库",
    },
  },
  {
    id: "browser",
    imageName: "浏览器",
    imageUrl: "fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/browser:v0.0.44",
    icon: "https://img.alicdn.com/imgextra/i4/O1CN01ShCbPEunrRI093x2_!!6000000000155-2-tps-72-72.png",
    description: {
      "en-US": "Chromium and a visual desktop for clicking, filling forms, and screenshots",
      "zh-CN": "Chromium +可视化桌面，支持点击/ 填表/截图",
    },
  },
  {
    id: "all-in-one",
    imageName: "全能型",
    imageUrl: "fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/all-in-one:v0.0.44",
    icon: "https://img.alicdn.com/imgextra/i1/O1CN01smhklUahsyE093x2_!!6000000006657-2-tps-72-72.png",
    description: {
      "en-US": "Code execution and browser capabilities together",
      "zh-CN": "代码执行＋浏览器双能力",
    },
  },
] as const;

export const SANDBOX_IMAGE_CHOICES = SANDBOX_IMAGES.flatMap((image) => [image.id, image.imageName]);

export const SANDBOX_IMAGE_NOTES = SANDBOX_IMAGES.map((image) => ({
  "en-US": `${image.id} (${image.imageName}): ${image.description["en-US"]}. ${image.imageUrl}`,
  "zh-CN": `${image.id}（${image.imageName}）：${image.description["zh-CN"]}。${image.imageUrl}`,
}));

export function resolveSandboxImage(selector: string) {
  const image = SANDBOX_IMAGES.find(
    (candidate) => candidate.id === selector || candidate.imageName === selector,
  );
  if (!image) {
    throw new UsageError(
      `Unknown built-in image / 未知内置镜像: ${selector}. ${SANDBOX_IMAGE_CHOICES.join(", ")}`,
    );
  }
  return image;
}

export const sandboxOfficialImages = defineCommand({
  description: {
    "en-US": "List the built-in Sandbox base images (offline)",
    "zh-CN": "列出 CLI 内置的 Sandbox 基础镜像（离线）",
  },
  auth: "none",
  exampleArgs: ["", "--output json", "--quiet"],
  notes: [
    {
      "en-US":
        "Use a preset ID or Chinese name with template create/update --image. These are pinned cn-beijing images; other environments may differ. Use --from-image for a custom image.",
      "zh-CN":
        "在 template create/update 中通过 --image 传入预设 ID 或中文名。这些是固定版本的 cn-beijing 镜像，其他环境可能不同；自定义镜像使用 --from-image。",
    },
    ...SANDBOX_IMAGE_NOTES,
  ],
  async run(ctx) {
    if (ctx.settings.quiet) {
      for (const image of SANDBOX_IMAGES) emitBare(image.id);
      return;
    }
    if (detectOutputFormat(ctx.settings.output) === "json") {
      emitResult(SANDBOX_IMAGES, "json");
      return;
    }
    for (const image of SANDBOX_IMAGES) {
      emitBare(`${image.id} (${image.imageName})`);
      emitBare(`  ${image.imageUrl}`);
      emitBare(`  ${image.description["en-US"]} / ${image.description["zh-CN"]}`);
    }
  },
});
