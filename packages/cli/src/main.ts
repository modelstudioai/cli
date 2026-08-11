import { createCli } from "bailian-cli-runtime";
import { commands } from "./commands.ts";
import { commandPackPolicy } from "./command-pack-policy.ts";
import pkg from "../package.json" with { type: "json" };

const quickStartTasks = [
  "帮我创建一个能够生成短片分镜和视频的 Managed Agent。\n   Help me create a Managed Agent that can generate short-film storyboards and videos.",
  "生成一张穿着太空服的猫站在火星上的图片，再把它制作成一段视频。\n   Generate an image of a cat in a spacesuit standing on Mars, then turn it into a video.",
  "查看最近的模型用量、免费额度和限流情况。\n   Check my recent model usage, free quota, and rate limits.",
  "推荐一个适合图片理解和智能客服的模型。\n   Recommend a model suitable for image understanding and intelligent customer service.",
  "介绍一下 Bailian CLI 能帮我完成哪些任务，并根据我的需求推荐使用方式。\n   Explain what Bailian CLI can help me accomplish, and recommend how to use it based on my needs.",
] as const;

void createCli(commands, {
  binName: "bl",
  version: pkg.version,
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
  quickStartTasks,
  commandPacks: commandPackPolicy,
}).run();
