const ping = {
  description: {
    "en-US": "Ping the Command Pack fixture",
    "zh-CN": "调用 Command Pack 测试命令",
  },
  auth: "none",
  flags: {
    message: {
      type: "string",
      valueHint: "<text>",
      required: true,
      description: "Message returned by the fixture",
    },
  },
  usageArgs: "--message <text>",
  exampleArgs: ['--message "hello"'],
  async run(ctx) {
    process.stdout.write(`command-pack:${ctx.flags.message}\n`);
  },
};

const dangerous = {
  description: "Exercise runtime confirmation for a high-risk Command Pack command",
  auth: "none",
  risk: {
    level: "high",
    message: {
      "en-US": "This fixture represents a high-risk operation.",
      "zh-CN": "该测试命令代表高风险操作。",
    },
  },
  async run(ctx) {
    const dryRun = ctx.settings.dryRun;
    ctx.output.result({
      executed: !dryRun,
      dry_run: dryRun,
      command_flags: Object.keys(ctx.flags),
    });
  },
};

const credential = {
  description: "Read an API key through the Command Pack host adapter",
  auth: "apiKey",
  async run(ctx) {
    const apiKey = ctx.credentials.apiKey();
    process.stdout.write(
      `credential-source:${apiKey.source} credential-base-url:${apiKey.baseUrl}\n`,
    );
  },
};

const credentialDenied = {
  description: "Verify credential access also requires command auth",
  auth: "none",
  async run(ctx) {
    ctx.credentials.apiKey();
  },
};

const output = {
  description: "Exercise the Command Pack output helper",
  auth: "none",
  async run(ctx) {
    ctx.output.result({ source: "command-pack", ok: true }, { text: "command-pack-output" });
  },
};

const fail = {
  description: "Exercise the Command Pack semantic error helper",
  auth: "none",
  async run(ctx) {
    throw ctx.errors.usage("Command Pack fixture usage error.", "Use agent fail only in tests.");
  },
};

export default {
  "agent credential": credential,
  "agent credential-denied": credentialDenied,
  "agent dangerous": dangerous,
  "agent fail": fail,
  "agent output": output,
  "agent ping": ping,
};
