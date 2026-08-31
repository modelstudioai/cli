interface FixtureOutput {
  args: string[];
  execArgv: string[];
  marker: string | null;
}

if (process.argv[2] === "--fail") {
  process.stderr.write("fixture failure\n");
  process.exitCode = 7;
} else {
  const output: FixtureOutput = {
    args: process.argv.slice(2),
    execArgv: process.execArgv,
    marker: process.env.RUNNER_FIXTURE_MARKER ?? null,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}
