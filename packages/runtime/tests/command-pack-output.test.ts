import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { buildSettings, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "../src/output/reporter.ts";
import { loadAndValidateCommandPack } from "../src/command-packs/validate.ts";
const identity = { binName: "bl", version: "1.7.0", clientName: "test", npmPackage: "test" };
const matrix = (["text", "json"] as const).flatMap((output) =>
  [false, true].flatMap((quiet) => [false, true].map((verbose) => ({ output, quiet, verbose }))),
);
async function fixture(code: string, display: (typeof matrix)[number]) {
  const root = await mkdtemp(join(tmpdir(), "pack-output-"));
  const settings = { ...buildSettings({ flags: {}, env: {}, file: {} }), ...display };
  let stdout = "";
  let stderr = "";
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
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
  await writeFile(
    join(root, "commands.mjs"),
    `export default { "agent fixture": { description: "Fixture", auth: "none", async run(ctx) { ${code} } } };`,
  );
  const commands = await loadAndValidateCommandPack(
    "@fixture/pack",
    {
      name: "@fixture/pack",
      bailianCli: { type: "command-pack", apiVersion: 1, entry: "./commands.mjs" },
    },
    { commandPrefixes: ["agent"] },
    identity,
    root,
  );
  return {
    reporter,
    stdout: () => stdout,
    stderr: () => stderr,
    dispose: () => rm(root, { recursive: true, force: true }),
    run: () =>
      commands["agent fixture"]!.run({
        identity,
        settings,
        localize,
        flags: {},
        output: reporter.output,
      } as never),
  };
}
test.each(matrix)(
  "API1 falsy final JSON $output quiet=$quiet verbose=$verbose",
  async (display) => {
    const streams = await fixture('ctx.output.result(false, {text: "false text"});', display);
    try {
      await streams.run();
      expect(streams.stdout()).toBe(display.output === "json" ? "false\n" : "false text\n");
    } finally {
      await streams.dispose();
    }
  },
);
test.each(matrix)(
  "API1 writes produce one string result $output quiet=$quiet verbose=$verbose",
  async (display) => {
    const streams = await fixture('ctx.output.write("hello "); ctx.output.line("world");', display);
    try {
      await streams.run();
      expect(streams.stdout()).toBe(
        display.output === "json" ? '"hello world\\n"\n' : "hello world\n",
      );
    } finally {
      await streams.dispose();
    }
  },
);
test.each(matrix)(
  "API1 result with fragments retains data $output quiet=$quiet verbose=$verbose",
  async (display) => {
    const streams = await fixture(
      'ctx.output.line("before"); ctx.output.result({values:[false,0,null,[]]}, {text:"body"}); ctx.output.write("after");',
      display,
    );
    try {
      await streams.run();
      if (display.output === "json")
        expect(JSON.parse(streams.stdout())).toEqual({ values: [false, 0, null, []] });
      else expect(streams.stdout()).toBe("before\nbody\nafter\n");
    } finally {
      await streams.dispose();
    }
  },
);

test("API1 duplicate result is GENERAL and produces no partial document", async () => {
  const streams = await fixture(
    "ctx.output.result({first:true}); ctx.output.result({second:true});",
    { output: "json", quiet: true, verbose: false },
  );
  try {
    await expect(streams.run()).rejects.toMatchObject({ exitCode: 1 });
    expect(streams.stdout()).toBe("");
  } finally {
    await streams.dispose();
  }
});
test("API1 submitted report survives a later original failure", async () => {
  const streams = await fixture(
    'ctx.output.result({task_id:"accepted-fixture"}); throw ctx.errors.general("original failure");',
    { output: "json", quiet: true, verbose: false },
  );
  try {
    await expect(streams.run()).rejects.toThrow("original failure");
    expect(JSON.parse(streams.stdout())).toEqual({ task_id: "accepted-fixture" });
    expect(streams.stderr()).toBe("");
  } finally {
    await streams.dispose();
  }
});

test("API1 overlapping runs keep fragments and final results invocation-local", async () => {
  const first = await fixture(
    'ctx.output.write("first"); await new Promise(resolve => setTimeout(resolve,20)); ctx.output.result({id:"first"});',
    { output: "json", quiet: true, verbose: true },
  );
  const second = await fixture('ctx.output.write("second"); ctx.output.result({id:"second"});', {
    output: "json",
    quiet: false,
    verbose: false,
  });
  try {
    await Promise.all([first.run(), second.run()]);
    expect(JSON.parse(first.stdout())).toEqual({ id: "first" });
    expect(JSON.parse(second.stdout())).toEqual({ id: "second" });
  } finally {
    await Promise.all([first.dispose(), second.dispose()]);
  }
});

test("API1 snapshots JSON result at submission before later object mutations", async () => {
  const streams = await fixture(
    "const data = {value:1}; ctx.output.result(data); data.value = 2;",
    { output: "json", quiet: true, verbose: false },
  );
  try {
    await streams.run();
    expect(JSON.parse(streams.stdout())).toEqual({ value: 1 });
  } finally {
    await streams.dispose();
  }
});
test("API1 validates JSON submission before reserving the result slot", async () => {
  const streams = await fixture(
    'const data = {}; data.self = data; try { ctx.output.result(data, {text:"text"}); } catch { ctx.output.result({blocked:true}); return; } ctx.output.result({blocked:false});',
    { output: "json", quiet: true, verbose: false },
  );
  try {
    await streams.run();
    expect(JSON.parse(streams.stdout())).toEqual({ blocked: true });
  } finally {
    await streams.dispose();
  }
});

test("API1 JSON submission never invokes the text renderer", async () => {
  const streams = await fixture(
    'let reads = 0; const data = {get value() { reads += 1; if (reads > 1) throw new Error("text renderer ran"); return 1; }}; ctx.output.result(data);',
    { output: "json", quiet: true, verbose: false },
  );
  try {
    await streams.run();
    expect(JSON.parse(streams.stdout())).toEqual({ value: 1 });
  } finally {
    await streams.dispose();
  }
});
