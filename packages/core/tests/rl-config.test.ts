import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";
import {
  buildTaskYaml,
  parseAssignment,
  parseDottedAssignment,
  parseJsonValue,
  parseTypedValue,
  resolveTrainingSpec,
  type RlJobSpec,
  type RlRunParams,
  type RlTaskPaths,
} from "../src/index.ts";

const TASK_PATHS: RlTaskPaths = {
  deployCopyDir: "/task/deploy-copy",
  dataDir: "/task/data",
};

/** Effective SDK config (bailian stripped, paths rewritten), order-insensitive. */
function effectiveConfig(params: RlRunParams, yamlText?: string): unknown {
  const resolved = resolveTrainingSpec(params, yamlText);
  return parse(buildTaskYaml(resolved.spec, TASK_PATHS));
}

describe("RL param parsers", () => {
  test("parseTypedValue resolves number / boolean / JSON, falls back to string", () => {
    expect(parseTypedValue("64")).toBe(64);
    expect(parseTypedValue("0.000002")).toBe(0.000002);
    expect(parseTypedValue("true")).toBe(true);
    expect(parseTypedValue("false")).toBe(false);
    expect(parseTypedValue("epoch")).toBe("epoch");
    expect(parseTypedValue("functions.rollout.CalcX")).toBe("functions.rollout.CalcX");
    expect(parseTypedValue('{"a":1}')).toEqual({ a: 1 });
  });

  test("parseJsonValue parses JSON, falls back to string", () => {
    expect(parseJsonValue("calc-rl")).toBe("calc-rl");
    expect(parseJsonValue("64")).toBe(64);
    expect(parseJsonValue('{"type":"reinforcement"}')).toEqual({ type: "reinforcement" });
  });

  test("parseAssignment rejects malformed entries", () => {
    expect(parseAssignment("name=classpath", "--reward", "--reward <name=classpath>")).toEqual({
      key: "name",
      value: "classpath",
    });
    expect(() => parseAssignment("noequals", "--hp", "--hp <key=value>")).toThrow(/Invalid --hp/);
    expect(() => parseAssignment("=value", "--hp", "--hp <key=value>")).toThrow(/Invalid --hp/);
    expect(() => parseAssignment("key=", "--hp", "--hp <key=value>")).toThrow(/Invalid --hp/);
  });

  test("parseDottedAssignment splits name.field=value", () => {
    expect(
      parseDottedAssignment(
        "rollout-1.cpu=2",
        "--function-runtime",
        "--function-runtime <name.field=value>",
      ),
    ).toEqual({ name: "rollout-1", field: "cpu", value: "2" });
    expect(() =>
      parseDottedAssignment(
        "rollout-1=2",
        "--function-runtime",
        "--function-runtime <name.field=value>",
      ),
    ).toThrow(/Invalid --function-runtime/);
  });
});

describe("resolveTrainingSpec merge rules", () => {
  test("pure params and equivalent YAML produce the same effective config", () => {
    const params: RlRunParams = {
      name: "calc-rl",
      model: "qwen3.5-9b",
      trainFiles: ["./data/train.jsonl"],
      codeDir: ".",
      requirements: "requirements.txt",
      rollout: "functions.rollout.CalcX",
      rewards: ["reward-1=functions.reward.Demo"],
      hp: ["algorithm=gspo", "batch_size=64"],
      chargeType: "mtu_postpaid",
      mtuSpec: "MTU4",
      mtuCount: 24,
    };
    const yamlText = `
name: calc-rl
model:
  name: qwen3.5-9b
functions:
  - type: rollout
    name: rollout-1
    fcmodel:
      zipdir: .
      classpath: functions.rollout.CalcX
      requirements_path: requirements.txt
  - type: reward
    name: reward-1
    fcmodel:
      zipdir: .
      classpath: functions.reward.Demo
      requirements_path: requirements.txt
datasets:
  - type: training
    data_source_type: file_id
    file_name: ./data/train.jsonl
training:
  type: reinforcement
  hyper_parameters:
    algorithm: gspo
    batch_size: 64
  resources:
    charge_type: mtu_postpaid
    mtu_spec_code: MTU4
    mtu_capacity: 24
`;
    expect(effectiveConfig(params)).toEqual(effectiveConfig({ model: "qwen3.5-9b" }, yamlText));
  });

  test("--hp deep merges into YAML hyper_parameters without whole-block replace", () => {
    const yamlText = `
model:
  name: qwen3.5-9b
training:
  hyper_parameters:
    algorithm: gspo
    batch_size: 64
`;
    const resolved = resolveTrainingSpec({ hp: ["n_epochs=3", "batch_size=128"] }, yamlText);
    expect(resolved.spec.training?.hyper_parameters).toEqual({
      algorithm: "gspo",
      batch_size: 128,
      n_epochs: 3,
    });
  });

  test("--function-runtime deep merges into the named function runtime", () => {
    const resolved = resolveTrainingSpec({
      model: "m",
      rollout: "pkg.Rollout",
      functionRuntime: ["rollout-1.cpu=2", "rollout-1.memory_size=4096"],
    });
    const rollout = resolved.spec.functions?.find((fn) => fn.type === "rollout");
    expect(rollout?.runtime).toEqual({ cpu: 2, memory_size: 4096 });
  });

  test("training and validation dataset lists are replaced independently", () => {
    const yamlText = `
model:
  name: m
datasets:
  - type: training
    data_source_type: file_id
    file_name: ./old-train.jsonl
  - type: validation
    data_source_type: file_id
    file_name: ./old-val.jsonl
`;
    const resolved = resolveTrainingSpec({ trainFiles: ["./new-train.jsonl"] }, yamlText);
    expect(resolved.spec.datasets).toEqual([
      { type: "validation", data_source_type: "file_id", file_name: "./old-val.jsonl" },
      { type: "training", data_source_type: "file_id", file_name: "./new-train.jsonl" },
    ]);
  });

  test("functions merge by name and --clear-functions empties the list first", () => {
    const yamlText = `
model:
  name: m
functions:
  - type: reward
    name: reward-1
    fcmodel:
      classpath: old.Reward
`;
    const merged = resolveTrainingSpec({ rewards: ["reward-1=new.Reward"] }, yamlText);
    expect(merged.spec.functions).toHaveLength(1);
    expect(merged.spec.functions?.[0].fcmodel?.classpath).toBe("new.Reward");

    const cleared = resolveTrainingSpec({ clearFunctions: true, rollout: "pkg.Rollout" }, yamlText);
    expect(cleared.spec.functions).toHaveLength(1);
    expect(cleared.spec.functions?.[0].type).toBe("rollout");
  });

  test("reward modifiers target the named function", () => {
    const resolved = resolveTrainingSpec({
      model: "m",
      rewards: ["reward-1=pkg.Reward"],
      rewardWeights: ["reward-1=0.8"],
      rewardMetrics: ["reward-1.test1=0.5", "reward-1.test2=0.5"],
      functionTimeouts: ["reward-1=120"],
      functionEnv: ["reward-1.API_BASE=https://example.com"],
    });
    const reward = resolved.spec.functions?.find((fn) => fn.name === "reward-1");
    expect(reward?.weight).toBe(0.8);
    expect(reward?.timeout).toBe(120);
    expect(reward?.reward_metric_weight).toEqual({ test1: 0.5, test2: 0.5 });
    expect(reward?.runtime?.env).toEqual({ API_BASE: "https://example.com" });
  });

  test("modifiers on an undefined function name fail with USAGE", () => {
    expect(() => resolveTrainingSpec({ model: "m", rewardWeights: ["ghost=1"] })).toThrow(
      /Unknown function name "ghost"/,
    );
  });

  test("--set overrides top-level keys last (shallow)", () => {
    const resolved = resolveTrainingSpec({
      model: "m",
      name: "from-params",
      set: ["name=from-set", 'training={"type":"reinforcement","hyper_parameters":{"n_epochs":9}}'],
    });
    expect(resolved.spec.name).toBe("from-set");
    expect(resolved.spec.training?.hyper_parameters).toEqual({ n_epochs: 9 });
  });
});

describe("resolveTrainingSpec type constraints", () => {
  test("OPD forces pg_opd and requires teacher_model", () => {
    const resolved = resolveTrainingSpec({ model: "m", teacherModel: "teacher", opd: true });
    expect(resolved.isOpd).toBe(true);
    expect(resolved.spec.training?.type).toBe("pg_opd");
    expect(resolved.spec.teacher_model).toBe("teacher");
    expect(() => resolveTrainingSpec({ model: "m", opd: true })).toThrow(/teacher model/);
  });

  test("plain RL defaults to reinforcement and forbids teacher_model", () => {
    const resolved = resolveTrainingSpec({ model: "m" });
    expect(resolved.spec.training?.type).toBe("reinforcement");
    expect(() => resolveTrainingSpec({ model: "m", teacherModel: "teacher" })).toThrow(
      /only valid for OPD/,
    );
  });

  test("base model is required", () => {
    expect(() => resolveTrainingSpec({})).toThrow(/base model is required/);
  });
});

describe("buildTaskYaml path rewriting", () => {
  test("strips bailian, rewrites zipdir and file_name, keeps classpath/requirements", () => {
    const resolved = resolveTrainingSpec({
      model: "m",
      codeDir: ".",
      requirements: "requirements.txt",
      rollout: "functions.rollout.CalcX",
      trainFiles: ["./data/train.jsonl"],
      include: ["functions/**"],
    });
    expect(resolved.spec.bailian?.package?.include).toEqual(["functions/**"]);

    const document = parse(buildTaskYaml(resolved.spec, TASK_PATHS)) as RlJobSpec;
    expect(document.bailian).toBeUndefined();

    const functions = document.functions ?? [];
    expect(functions[0].fcmodel?.zipdir).toBe("/task/deploy-copy");
    expect(functions[0].fcmodel?.classpath).toBe("functions.rollout.CalcX");
    expect(functions[0].fcmodel?.requirements_path).toBe("requirements.txt");

    const datasets = document.datasets ?? [];
    expect(datasets[0].file_name).toBe("/task/data/train.jsonl");
  });

  test("file_id datasets are left untouched", () => {
    const resolved = resolveTrainingSpec({ model: "m", trainFileIds: ["file-abc"] });
    const document = parse(buildTaskYaml(resolved.spec, TASK_PATHS)) as RlJobSpec;
    const datasets = document.datasets ?? [];
    expect(datasets[0]).toEqual({
      type: "training",
      data_source_type: "file_id",
      file_id: "file-abc",
    });
  });
});
