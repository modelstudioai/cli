import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import baseline from "./fixtures/training-deployment.json" with { type: "json" };
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "../../src/index.ts";

const identity = { binName: "bl", clientName: "test", npmPackage: "test", version: "0.0.0" };
const retained = { future: { values: [0, false, null, []] } };
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  response: unknown;
  dryRun?: boolean;
  responses?: unknown[];
  advanceClock?: boolean;
  interrupt?: boolean;
}
const dataset = {
  file_id: "file-fixture",
  name: "fixture.jsonl",
  size: 1024,
  purpose: "fine-tune",
  md5: "fixture-md5",
  gmt_create: "2026-01-01",
  description: "fixture",
  ...retained,
};
const job = {
  job_id: "ft-fixture",
  model: "qwen-fixture",
  status: "SUCCEEDED",
  training_type: "sft",
  usage: 0,
  output_model: "trained-fixture",
  ...retained,
};
const deployment = {
  deployed_model: "deploy-fixture",
  status: "RUNNING",
  model_name: "trained-fixture",
  model_code: "deploy-fixture",
  ...retained,
};
const response = { request_id: "request-fixture", output: job, ...retained };
const scenarios: Scenario[] = [
  {
    name: "dataset list",
    command: commands.datasetList,
    flags: { page: 2, pageSize: 5, purpose: "fine-tune" },
    response: { data: { files: [dataset], total: 7 }, request_id: "request-fixture" },
  },
  {
    name: "dataset get",
    command: commands.datasetGet,
    flags: { fileId: "file-fixture" },
    response: { data: dataset, request_id: "request-fixture" },
  },
  {
    name: "dataset delete",
    command: commands.datasetDelete,
    flags: { fileId: "file-fixture" },
    response: { deleted: true, request_id: "request-fixture", ...retained },
  },
  {
    name: "finetune list",
    command: commands.finetuneList,
    flags: { page: 2, pageSize: 5 },
    response: { output: { jobs: [job], total: 7 }, request_id: "request-fixture" },
  },
  { name: "finetune get", command: commands.finetuneGet, flags: { jobId: "ft-fixture" }, response },
  {
    name: "finetune cancel",
    command: commands.finetuneCancel,
    flags: { jobId: "ft-fixture" },
    response,
  },
  {
    name: "finetune delete",
    command: commands.finetuneDelete,
    flags: { jobId: "ft-fixture" },
    response,
  },
  {
    name: "finetune export",
    command: commands.finetuneExport,
    flags: { jobId: "ft-fixture", checkpoint: "ckpt-fixture", modelName: "trained-fixture" },
    response: {
      output: { model_name: "trained-fixture", ...retained },
      request_id: "request-fixture",
    },
  },
  {
    name: "finetune checkpoints",
    command: commands.finetuneCheckpoints,
    flags: { jobId: "ft-fixture" },
    response: {
      output: {
        checkpoints: [
          {
            checkpoint: "ckpt-fixture",
            step: 0,
            status: "READY",
            expire_time: "2026-01-02T12:00:00Z",
          },
        ],
        total: 1,
      },
      request_id: "request-fixture",
    },
  },
  {
    name: "finetune watch",
    command: commands.finetuneWatch,
    flags: { jobId: "ft-fixture", follow: false },
    response,
  },
  {
    name: "compress get",
    command: commands.finetuneCompressGet,
    flags: { jobId: "quant-fixture" },
    response,
  },
  {
    name: "compress list",
    command: commands.finetuneCompressList,
    flags: { page: 2, pageSize: 5 },
    response: { output: { jobs: [job], total: 7 }, request_id: "request-fixture" },
  },
  {
    name: "compress logs",
    command: commands.finetuneCompressLogs,
    flags: { jobId: "quant-fixture", offset: 0, lines: 5 },
    response: {
      output: { logs: ["line one", "line two"], total: 2 },
      request_id: "request-fixture",
    },
  },
  {
    name: "compress cancel",
    command: commands.finetuneCompressCancel,
    flags: { jobId: "quant-fixture" },
    response,
  },
  {
    name: "compress delete",
    command: commands.finetuneCompressDelete,
    flags: { jobId: "quant-fixture" },
    response,
  },
  {
    name: "compress watch",
    command: commands.finetuneCompressWatch,
    flags: { jobId: "quant-fixture", follow: false },
    response: {
      output: { status: "SUCCEEDED", quantized_output: "quantized-fixture", ...retained },
      request_id: "request-fixture",
    },
  },
  {
    name: "compress watch follow",
    command: commands.finetuneCompressWatch,
    flags: { jobId: "quant-fixture", follow: true },
    response: {
      output: { status: "SUCCEEDED", quantized_output: "quantized-fixture", ...retained },
      request_id: "request-fixture",
    },
  },
  {
    name: "finetune watch follow",
    command: commands.finetuneWatch,
    flags: { jobId: "ft-fixture", follow: true },
    response,
  },
  {
    name: "deploy list",
    command: commands.deployList,
    flags: { page: 2, pageSize: 5 },
    response: { output: { deployments: [deployment], total: 7 }, request_id: "request-fixture" },
  },
  {
    name: "deploy get",
    command: commands.deployGet,
    flags: { deployedModel: "deploy-fixture" },
    response: { output: deployment, request_id: "request-fixture" },
  },
  {
    name: "deploy models",
    command: commands.deployModels,
    flags: {},
    response: {
      output: {
        models: [
          {
            model_name: "qwen-fixture",
            model_source: "base",
            supported_plans: ["ptu"],
            ...retained,
          },
        ],
        total: 1,
      },
      request_id: "request-fixture",
    },
  },
  {
    name: "capacity get",
    command: commands.deployCapacityGet,
    flags: { deployedModel: "deploy-fixture", instanceId: "capacity-fixture" },
    response: {
      output: { instance_id: "capacity-fixture", deleted: false, ...retained },
      request_id: "request-fixture",
    },
  },
  {
    name: "capacity list",
    command: commands.deployCapacityList,
    flags: { deployedModel: "deploy-fixture" },
    response: {
      output: { instances: [{ instance_id: "capacity-fixture", ...retained }], total: 1 },
      request_id: "request-fixture",
    },
  },
  {
    name: "operation get",
    command: commands.deployOperationGet,
    flags: { deployedModel: "deploy-fixture", operationId: "operation-fixture" },
    response: {
      output: { operation_id: "operation-fixture", operation_status: "SUCCEEDED", ...retained },
      request_id: "request-fixture",
    },
  },
  {
    name: "operation wait",
    command: commands.deployOperationWait,
    flags: { deployedModel: "deploy-fixture", operationId: "operation-fixture" },
    response: {
      output: { operation_id: "operation-fixture", operation_status: "SUCCEEDED", ...retained },
      request_id: "request-fixture",
    },
  },
  {
    name: "capacity unsubscribe",
    command: commands.deployCapacityUnsubscribe,
    flags: { instanceId: "capacity-fixture" },
    response: {},
  },
  {
    name: "deploy update",
    command: commands.deployUpdate,
    flags: { deployedModel: "deploy-fixture", displayName: "updated" },
    response: { output: deployment, request_id: "request-fixture" },
  },
  {
    name: "dataset upload preview",
    command: commands.datasetUpload,
    flags: { file: "/tmp/output-training-fixture.jsonl", noValidate: true },
    response: {},
    dryRun: true,
  },
  {
    name: "dataset validate preview",
    command: commands.datasetValidate,
    flags: { file: "/tmp/output-training-fixture.jsonl" },
    response: {},
    dryRun: true,
  },
  {
    name: "training price preview",
    command: commands.finetunePrice,
    flags: { baseModel: "qwen-fixture", datasets: "file-fixture", trainingType: "sft" },
    response: {},
    dryRun: true,
  },
  {
    name: "training capability preview",
    command: commands.finetuneCapability,
    flags: { baseModel: "qwen-fixture" },
    response: {},
    dryRun: true,
  },
  {
    name: "training logs preview",
    command: commands.finetuneLogs,
    flags: { jobId: "ft-fixture" },
    response: {},
    dryRun: true,
  },
  {
    name: "compression create preview",
    command: commands.finetuneCompressCreate,
    flags: {
      model: "qwen-fixture",
      modelName: "qwen-fixture",
      name: "fixture",
      templateId: "template-fixture",
    },
    response: {},
    dryRun: true,
  },
  {
    name: "compression templates preview",
    command: commands.finetuneCompressTemplates,
    flags: { baseModel: "qwen-fixture" },
    response: {},
    dryRun: true,
  },
  {
    name: "capacity create preview",
    command: commands.deployCapacityCreate,
    flags: { deployedModel: "deploy-fixture", inputTpm: 0, outputTpm: 100 },
    response: {},
    dryRun: true,
  },
  {
    name: "capacity scale preview",
    command: commands.deployCapacityScale,
    flags: {
      deployedModel: "deploy-fixture",
      instanceId: "capacity-fixture",
      inputTpm: 0,
      outputTpm: 100,
    },
    response: {},
    dryRun: true,
  },
  {
    name: "capacity renew preview",
    command: commands.deployCapacityRenew,
    flags: { deployedModel: "deploy-fixture", instanceId: "capacity-fixture", duration: 1 },
    response: {},
    dryRun: true,
  },
  {
    name: "capacity delete preview",
    command: commands.deployCapacityDelete,
    flags: { deployedModel: "deploy-fixture", instanceId: "capacity-fixture" },
    response: {},
    dryRun: true,
  },
  {
    name: "text training create preview",
    command: commands.finetuneTextCreate,
    flags: {
      baseModel: "qwen2.5-7b-instruct",
      datasets: "file-fixture",
      trainingType: "sft-lora",
      batchSize: 4,
    },
    response: {},
    dryRun: true,
  },
  {
    name: "audio training create preview",
    command: commands.finetuneAudioCreate,
    flags: {
      baseModel: "cosyvoice-v3.5",
      datasets: "file-fixture",
      trainingType: "sft",
      batchSize: 4,
    },
    response: {},
    dryRun: true,
  },
  {
    name: "image training create preview",
    command: commands.finetuneImageCreate,
    flags: {
      baseModel: "wan2.7",
      datasets: "file-fixture",
      trainingType: "sft-lora",
      batchSize: 4,
    },
    response: {},
    dryRun: true,
  },
  {
    name: "video training create preview",
    command: commands.finetuneVideoCreate,
    flags: {
      baseModel: "wan2.6-i2v",
      datasets: "file-fixture",
      trainingType: "sft-lora",
      batchSize: 4,
    },
    response: {},
    dryRun: true,
  },
];
const displays = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function invoke(scenario: Scenario, display: (typeof displays)[number], fail = false) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    strayOut += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    strayErr += String(chunk);
    return true;
  });
  const requests: unknown[] = [];
  const transport = vi.spyOn(httpTransport, "fetch").mockImplementation(async (url, init) => {
    requests.push({
      url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
      method: init?.method ?? "GET",
      body: init?.body ?? null,
    });
    if (scenario.advanceClock) vi.setSystemTime(Date.now() + 2000);
    if (scenario.interrupt) process.listeners("SIGINT").at(-1)?.("SIGINT");
    return new Response(
      JSON.stringify(
        fail
          ? {
              code: "FixtureFailure",
              message: "original server failure",
              request_id: "failed-request",
            }
          : (scenario.responses?.[Math.min(requests.length - 1, scenario.responses.length - 1)] ??
              scenario.response),
      ),
      { status: fail ? 400 : 200 },
    );
  });
  const settings = buildSettings({
    flags: { ...display, output: display.format, dryRun: scenario.dryRun },
    env: {},
    file: { language: "en-US" },
  });
  const localize = (message: LocalizedText) =>
    typeof message === "string" ? message : message["en-US"];
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const resultSpy = vi.spyOn(reporter.output, "result");
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://fixture.invalid",
    apiCred: { token: "fixture-api-token", source: "flag", baseUrl: "https://fixture.invalid" },
    debug: (record) => reporter.output.debug(record),
  });
  let exitCode = 0;
  try {
    await scenario.command.run({
      identity,
      settings,
      flags: scenario.flags,
      client,
      localize,
      output: reporter.output,
    } as never);
  } catch (error) {
    exitCode = reporter.error(error);
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    transport.mockRestore();
  }
  return {
    stdout,
    stderr,
    strayOut,
    strayErr,
    requests,
    exitCode,
    results: resultSpy.mock.calls.length,
  };
}
const fixture = baseline as Record<string, { stdout: string; data: unknown; requests: unknown[] }>;
for (const scenario of scenarios) {
  test.each(displays)(
    `${scenario.name}: final result and business calls survive %j`,
    async (display) => {
      const result = await invoke(scenario, display);
      expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
      expect(result.strayOut).toBe("");
      expect(result.strayErr).toBe("");
      expect(result.results).toBe(1);
      expect(result.requests).toEqual(fixture[scenario.name]!.requests);
      if (display.format === "json") {
        expect(JSON.parse(result.stdout)).toEqual(fixture[scenario.name]!.data);
        for (const line of result.stderr.trim().split("\n").filter(Boolean))
          expect(() => JSON.parse(line)).not.toThrow();
      } else expect(result.stdout).toBe(fixture[scenario.name]!.stdout);
    },
  );
}

async function withDatasetFixture(contents: string, run: (file: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "output-training-dataset-"));
  const file = join(directory, "fixture.jsonl");
  try {
    await writeFile(file, contents);
    await run(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test.each(displays)(
  "dataset missing data returns JSON null or the old text: %j",
  async (display) => {
    const result = await invoke(
      {
        name: "missing",
        command: commands.datasetGet,
        flags: { fileId: "missing-file" },
        response: { data: null, request_id: "missing-request" },
      },
      display,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    expect(result.results).toBe(1);
    if (display.format === "json") expect(JSON.parse(result.stdout)).toBeNull();
    else expect(result.stdout).toBe("No data returned for missing-file\n");
  },
);
test.each(displays)(
  "real dataset validation keeps the full failure report and exit code: %j",
  async (display) => {
    await withDatasetFixture('{"messages":[]}\n', async (file) => {
      const result = await invoke(
        {
          name: "invalid",
          command: commands.datasetValidate,
          flags: { file, fullValidate: true },
          response: {},
        },
        display,
      );
      expect(result.exitCode).toBe(1);
      expect(result.strayOut).toBe("");
      expect(result.strayErr).toBe("");
      expect(result.results).toBe(1);
      expect(result.requests).toEqual([]);
      const data = JSON.parse(result.stdout);
      expect(data.valid).toBe(false);
      expect(data.filePath).toBe(file);
      expect(data.errors.length).toBeGreaterThan(0);
      if (display.format === "json")
        expect(JSON.parse(result.stderr).error.message).toContain("Dataset validation failed:");
      else expect(result.stderr).toContain("Error: Dataset validation failed:");
    });
  },
);
test.each(displays)(
  "real upload retains validation warnings under quiet and multipart bytes: %j",
  async (display) => {
    const contents = '{"messages":[{"role":"assistant","content":"fixture response"}]}\n';
    await withDatasetFixture(contents, async (file) => {
      const result = await invoke(
        {
          name: "upload",
          command: commands.datasetUpload,
          flags: { file, fullValidate: true },
          response: {
            id: "file-upload",
            filename: "fixture.jsonl",
            bytes: contents.length,
            purpose: "fine-tune",
            request_id: "upload-request",
          },
        },
        display,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.strayOut).toBe("");
      expect(result.strayErr).toBe("");
      expect(result.results).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        file_id: "file-upload",
        name: "fixture.jsonl",
        request_id: "upload-request",
      });
      const [request] = result.requests as { method: string; body: FormData }[];
      expect(result.requests).toHaveLength(1);
      expect(request!.method).toBe("POST");
      expect(request!.body).toBeInstanceOf(FormData);
      expect(request!.body.get("purpose")).toBe("fine-tune");
      expect(await (request!.body.get("file") as Blob).text()).toBe(contents);
      if (display.format === "json") {
        const warnings = result.stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter((record) => record.warning);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].warning.code).toBe("DATASET_VALIDATION_WARNINGS");
        expect(warnings[0].warning.details.file).toBe(file);
        expect(warnings[0].warning.details.warnings).toEqual(
          expect.arrayContaining([expect.objectContaining({ code: "NO_USER_ROLE" })]),
        );
      } else expect(result.stderr).toContain("warning(s)");
    });
  },
);
for (const scenario of scenarios.filter((entry) =>
  [
    "dataset get",
    "finetune get",
    "compress get",
    "deploy get",
    "capacity get",
    "operation get",
  ].includes(entry.name),
)) {
  test(`${scenario.name} preserves the original server error and emits no success`, async () => {
    const result = await invoke(scenario, { format: "json", quiet: true, verbose: false }, true);
    expect(result.stdout).toBe("");
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    expect(result.results).toBe(0);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      message: "original server failure",
      api_code: "FixtureFailure",
      request_id: "failed-request",
    });
  });
}

for (const command of [commands.finetuneWatch, commands.finetuneCompressWatch]) {
  test.each(displays)(
    `${command === commands.finetuneWatch ? "training" : "compression"} follow progress obeys output settings: %j`,
    async (display) => {
      const result = await invoke(
        {
          name: "progress",
          command,
          flags: { jobId: "job-fixture", follow: true, interval: 1 },
          response: {},
          responses: [
            { output: { status: "RUNNING" } },
            { output: { status: "SUCCEEDED", future: { values: [false, 0, null] } } },
          ],
        },
        display,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.requests).toHaveLength(2);
      expect(result.results).toBe(1);
      expect(result.strayOut + result.strayErr).toBe("");
      expect(JSON.parse(result.stdout).output).toMatchObject({
        status: "SUCCEEDED",
        future: { values: [false, 0, null] },
      });
      if (display.format === "json")
        for (const line of result.stderr.trim().split("\n").filter(Boolean))
          expect(() => JSON.parse(line)).not.toThrow();
      if (command === commands.finetuneWatch && display.format === "text" && !display.quiet)
        expect(result.stderr).toContain("RUNNING");
      else expect(result.stderr).not.toContain("RUNNING");
    },
  );
  test("watch timeout writes no success and removes its interrupt listener", async () => {
    const listeners = process.listenerCount("SIGINT");
    const result = await invoke(
      {
        name: "timeout",
        command,
        flags: { jobId: "job-fixture", follow: true, interval: 1, pollTimeout: 1 },
        response: { output: { status: "RUNNING" } },
        advanceClock: true,
      },
      { format: "json", quiet: true, verbose: false },
    );
    expect(result.exitCode).toBe(5);
    expect(result.results).toBe(0);
    expect(result.stdout + result.strayOut + result.strayErr).toBe("");
    expect(result.requests).toHaveLength(1);
    expect(JSON.parse(result.stderr).error.message).toMatch(/timed out/);
    expect(process.listenerCount("SIGINT")).toBe(listeners);
  });
  test("watch interruption removes its listener without a premature success result", async () => {
    const listeners = process.listenerCount("SIGINT");
    const result = await invoke(
      {
        name: "interrupt",
        command,
        flags: { jobId: "job-fixture", follow: true, interval: 1 },
        response: { output: { status: "RUNNING" } },
        interrupt: true,
      },
      { format: "json", quiet: true, verbose: false },
    );
    expect(result.results).toBe(0);
    expect(result.stdout + result.strayOut + result.strayErr).toBe("");
    expect(process.listenerCount("SIGINT")).toBe(listeners);
  });
}

for (const command of [commands.finetuneWatch, commands.finetuneCompressWatch])
  for (const follow of [false, true]) {
    test.each(displays)(
      `${command === commands.finetuneWatch ? "training" : "compression"} FAILED report precedes original error, follow=${follow}: %j`,
      async (display) => {
        const result = await invoke(
          {
            name: "failed-report",
            command,
            flags: { jobId: "failed-job", follow },
            response: {
              output: {
                job_id: "failed-job",
                status: "FAILED",
                error: { message: "original failure reason" },
                future: { values: [false, 0, null] },
              },
            },
          },
          display,
        );
        expect(result.exitCode).toBe(1);
        expect(result.results).toBe(1);
        expect(result.strayOut + result.strayErr).toBe("");
        expect(result.requests).toHaveLength(1);
        const data = JSON.parse(result.stdout);
        expect(follow ? data.output.status : data.status).toBe("FAILED");
        if (display.format === "json") {
          const errors = result.stderr
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .filter((record) => record.error);
          expect(errors).toHaveLength(1);
          expect(errors[0].error.message).toMatch(/FAILED|original failure reason/);
        } else expect(result.stderr).toContain("Error:");
      },
    );
  }
