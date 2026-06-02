import { defineCommand } from "bailian-cli-core";

export default defineCommand({
  name: "test ping",
  description: "Fixture plugin test command",
  usage: "bl test ping",
  async run() {
    process.stdout.write("pong\n");
  },
});
