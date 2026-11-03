import { expect, expectTypeOf, test } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import {
  BailianError,
  commandRef,
  formatCommand,
  renderCommandText,
  resolveApiKey,
  resolveConsole,
  resolveOpenApi,
  buildCommandInvocation,
  type Identity,
} from "../src/index.ts";

test("display and executable references share structured invocation, ignoring obsolete overrides", () => {
  expectTypeOf<Identity>().not.toHaveProperty("commandPrefix");
  const identity = {
    binName: "bl",
    commandPrefix: "presentation only",
    commandInvocation: { bin: "aliyun", path: ["bl"] },
  };
  const path = ["knowledge", "delete"];
  const args = ["--index-id", "idx space;$(literal)"];
  const command = buildCommandInvocation(identity, path, args);
  expect(formatCommand(identity, path.join(" "))).toBe("aliyun bl knowledge delete");
  expect(command).toEqual({ bin: "aliyun", path: ["bl", "knowledge", "delete"], args });
  expect(buildCommandInvocation({ binName: "bl" }, path, args)).toEqual({ bin: "bl", path, args });
  expect(buildCommandInvocation({ binName: "kscli" }, ["kb", "delete"], args).bin).toBe("kscli");
  command.path.push("changed");
  command.args.push("changed");
  expect(identity.commandInvocation.path).toEqual(["bl"]);
  expect(path).toEqual(["knowledge", "delete"]);
  expect(args).toEqual(["--index-id", "idx space;$(literal)"]);
});

// This one child process verifies the shell:false execution/argv boundary, not CLI behavior.
test("structured commands preserve argument boundaries when spawned without a shell", () => {
  const args = ["--index-id", "space ' quote; $(literal)", "--workspace-id", "工作空间"];
  const command = buildCommandInvocation(
    {
      binName: "product",
      commandInvocation: {
        bin: process.execPath,
        path: ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))"],
      },
    },
    ["knowledge", "delete"],
    args,
  );
  const result = spawnSync(command.bin, [...command.path, ...command.args], {
    shell: false,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(["knowledge", "delete", ...args]);
});

test.each([resolveApiKey, resolveConsole, resolveOpenApi])(
  "credential errors serialize without CLI templates or product commands (%s)",
  (resolve) => {
    let failure: BailianError | undefined;
    try {
      resolve({ flags: {}, env: {}, file: {} } as Parameters<typeof resolve>[0]);
    } catch (error) {
      failure = error as BailianError;
    }
    expect(failure).toBeInstanceOf(BailianError);
    for (const value of [
      failure!.message,
      failure!.hint ?? "",
      JSON.stringify(failure),
      JSON.stringify({ failure }),
    ]) {
      expect(value).not.toContain("{{commandPrefix}}");
      expect(value).not.toContain("auth login");
    }
    expect(JSON.parse(JSON.stringify({ failure })).failure).toEqual(failure!.toJSON());
  },
);

test("command formatting uses the invocation without changing product identity", () => {
  const identity = { binName: "bl", commandInvocation: { bin: "aliyun", path: ["bl"] } };
  expect(formatCommand(identity, "auth login --console")).toBe("aliyun bl auth login --console");
  expect(formatCommand({ binName: "bl" }, "auth status")).toBe("bl auth status");
  expect(formatCommand({ binName: "kscli" }, "search")).toBe("kscli search");
  expect(formatCommand(identity)).toBe("aliyun bl");
  expect(identity.binName).toBe("bl");
  expect(formatCommand(identity, "file --name '{{commandPrefix}}'")).toBe(
    "aliyun bl file --name '{{commandPrefix}}'",
  );
});

test("only explicit command references are expanded, preserving surrounding text", () => {
  const template = `Run \`${commandRef("auth login --console")}\`. bl is ordinary text.`;
  expect(renderCommandText(template, "aliyun bl")).toBe(
    "Run `aliyun bl auth login --console`. bl is ordinary text.",
  );
  expect(
    renderCommandText(`First ${commandRef("auth login")}; then ${commandRef("auth status")}`, "bl"),
  ).toBe("First bl auth login; then bl auth status");
});

test("plain errors preserve literal text without a rendering protocol", () => {
  const literal = "Server {{commandPrefix}} data";
  const failure = new BailianError(literal, undefined, literal);
  expect(failure.message).toBe(literal);
  expect(failure.hint).toBe(literal);
  expect(failure.toJSON().error).toMatchObject({ message: literal, hint: literal });
});

test("JSON serialization property names never become command prefixes", () => {
  const failure = new BailianError(
    "Missing token",
    undefined,
    `Run ${formatCommand("aliyun bl", "auth login")}`,
  );
  const nested = JSON.parse(JSON.stringify({ failure }));
  expect(nested.failure).toEqual(failure.toJSON());
  expect(nested.failure.error.hint).not.toContain("failure auth login");
});
