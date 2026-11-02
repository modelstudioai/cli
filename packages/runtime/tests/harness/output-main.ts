import { createCli } from "../../src/create-cli.ts";
import { outputCommands, outputIdentity } from "./output-commands.ts";

await createCli(outputCommands, outputIdentity).run();
