import { expect, test } from "vite-plus/test";
import { renderConfigUiHtml } from "../src/commands/config/ui-html.ts";
import { getScenario, renderScenarioPrompt } from "../src/commands/config/scenarios.ts";
import { BailianError, formatCommand } from "bailian-cli-core";
import { withPartialSuccessHint } from "../src/commands/knowledge/shared.ts";

test.each(["en-US", "zh-CN"] as const)(
  "config UI command examples follow the invocation (%s)",
  (language) => {
    const standalone = renderConfigUiHtml(language);
    const hosted = renderConfigUiHtml(language, "aliyun bl");
    expect(hosted).toContain("aliyun bl config ui");
    expect(hosted).toContain("aliyun bl skill init");
    expect(hosted).not.toContain("{{commandPrefix}}");
    expect(hosted.replaceAll("aliyun bl", "bl")).toBe(standalone);
  },
);

test("wrapped local errors preserve complete strings and literal user data", () => {
  const userValue = "{{commandPrefix}}";
  const original = new BailianError(
    `Run ${formatCommand("aliyun bl", "managed-agent init")} for '${userValue}'.`,
    undefined,
    `Run ${formatCommand("aliyun bl", "auth login --console")}.`,
  );
  const wrapped = withPartialSuccessHint(original, "indexId: example") as BailianError;
  expect(wrapped.message).toBe("Run aliyun bl managed-agent init for '{{commandPrefix}}'.");
  expect(wrapped.hint).toBe("Run aliyun bl auth login --console.\nindexId: example");
});

test.each(["en-US", "zh-CN"] as const)(
  "curated prompts render commands before user input (%s)",
  (language) => {
    const scenario = getScenario("image-generate", language, "aliyun bl")!;
    expect(scenario.prompt).toContain("aliyun bl image generate");
    expect(scenario.prompt.replaceAll("aliyun bl", "bl")).toBe(
      getScenario("image-generate", language)!.prompt,
    );
    expect(
      renderScenarioPrompt(
        { ...scenario, prompt: "{{user}}" },
        { user: "bl user data {{commandPrefix}}" },
      ),
    ).toBe("bl user data {{commandPrefix}}");
  },
);
