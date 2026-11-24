/**
 * 生成画像规划：把 workload.axes 的笛卡尔积均衡地循环到 n 条普通样本，再追加
 * unknowable（信息不足）样本，最后整体洗牌。画像中与问题 ID 同名的字段表示期望
 * 答案，用于事后统计生成意图与 teacher 标注的一致率。
 */
import { BailianError } from "../../errors/base.ts";
import { ExitCode } from "../../errors/codes.ts";
import { mulberry32, shuffleWithRandom } from "./rng.ts";
import type { WorkloadConfig } from "./workload.ts";

export interface GenerationPlan {
  difficulty: string;
  index: number;
  [axis: string]: unknown;
}

/** axes 笛卡尔积；任一轴为空即报错（与脚本 build_plans 一致）。 */
function axesGrid(axes: Record<string, unknown[]>): Array<Record<string, unknown>> {
  let grid: Array<Record<string, unknown>> = [{}];
  for (const [axisName, values] of Object.entries(axes)) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new BailianError(
        `each axis must contain at least one value (axis "${axisName}" is empty). / 每个 axis 至少要有一个取值（axis "${axisName}" 为空）。`,
        ExitCode.USAGE,
      );
    }
    const next: Array<Record<string, unknown>> = [];
    for (const combination of grid) {
      for (const value of values) next.push({ ...combination, [axisName]: value });
    }
    grid = next;
  }
  return grid;
}

/**
 * 构造 n 条普通画像 + unknowable 条信息不足画像。grid 与 plans 共用一个确定性
 * 随机源（对齐脚本单 rng 实例两次 shuffle 的语义）；同 seed 在 CLI 内可复现。
 */
export function buildPlans(
  workload: WorkloadConfig,
  count: number,
  unknowable: number,
  seed: number,
): GenerationPlan[] {
  const random = mulberry32(seed);
  const grid = shuffleWithRandom(axesGrid(workload.axes ?? {}), random);
  const plans: GenerationPlan[] = [];
  for (let index = 0; index < count; index++) {
    plans.push({ difficulty: "clean", ...grid[index % grid.length], index });
  }
  for (let offset = 0; offset < unknowable; offset++) {
    plans.push({ difficulty: "unknowable", index: count + offset });
  }
  return shuffleWithRandom(plans, random);
}
