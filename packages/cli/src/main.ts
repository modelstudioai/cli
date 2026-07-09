import { createCli } from "bailian-cli-runtime";
import { commands } from "./commands.ts";
import pkg from "../package.json" with { type: "json" };

const quickStartTasks = [
  "Help me generate a set of Amazon e-commerce main images for baseball caps (white background + lifestyle shots + model wear shots)",
  "Help me generate a 3-minute humorous crosstalk audio clip",
  "Help me generate a Little Red Riding Hood picture-book PDF (with illustrations)",
  "Help me analyze this video and write a Xiaohongshu-style post",
] as const;

void createCli(commands, {
  binName: "bl",
  version: pkg.version,
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
  quickStartTasks,
}).run();
