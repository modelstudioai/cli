import {
  BailianError,
  ExitCode,
  type AuthMode,
  type CodingPlanRegion,
  type Config,
  type TokenPlanRegion,
} from "bailian-cli-core";
import { promptSelect, promptText } from "../output/prompt.ts";
import { API_KEY_PAGE } from "../urls.ts";

interface AuthModeConfig {
  id: AuthMode;
  label: string;
  description: string;
  keyPlaceholder: string;
  validateKey?: (key: string) => string | null;
  regionKind?: "coding-plan" | "token-plan";
}

export const AUTH_MODE_CONFIGS: AuthModeConfig[] = [
  {
    id: "standard-api-key",
    label: "Standard API Key",
    description: "通用 DashScope API，支持所有模型和能力",
    keyPlaceholder: "sk-...",
  },
  {
    id: "token-plan",
    label: "Token Plan",
    description: "团队订阅服务 · Credits 统一计量 · 兼容 AI 编程与智能体工具",
    keyPlaceholder: "sk-...",
    regionKind: "token-plan",
  },
  {
    id: "coding-plan",
    label: "Coding Plan",
    description: "个人开发者套餐 · 含周期配额",
    keyPlaceholder: "sk-sp-...",
    validateKey: (key) =>
      key.startsWith("sk-sp-") ? null : 'Coding Plan API keys start with "sk-sp-".',
    regionKind: "coding-plan",
  },
];

const CODING_PLAN_REGION_OPTIONS: Array<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "cn", label: "China (Beijing)", hint: "coding.dashscope.aliyuncs.com" },
  { value: "intl", label: "International (Singapore)", hint: "coding-intl.dashscope.aliyuncs.com" },
];

const TOKEN_PLAN_REGION_OPTIONS: Array<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "cn", label: "China (Beijing)", hint: "token-plan.cn-beijing.maas.aliyuncs.com" },
  {
    value: "intl",
    label: "International (Singapore)",
    hint: "token-plan.ap-southeast-1.maas.aliyuncs.com",
  },
];

export interface AuthSetupResult {
  mode: AuthMode;
  key: string;
  codingPlanRegion?: CodingPlanRegion;
  tokenPlanRegion?: TokenPlanRegion;
}

export async function interactiveAuthSetup(_config: Config): Promise<AuthSetupResult> {
  const modeChoices = AUTH_MODE_CONFIGS.map((c) => ({
    value: c.id,
    label: c.label,
    hint: c.description,
  }));

  const selectedMode = await promptSelect({
    message: "Choose authentication mode:",
    choices: modeChoices,
  });

  if (!selectedMode) {
    throw new BailianError("Setup cancelled.", ExitCode.AUTH);
  }

  const modeConfig = AUTH_MODE_CONFIGS.find((c) => c.id === selectedMode)!;

  let codingPlanRegion: CodingPlanRegion | undefined;
  let tokenPlanRegion: TokenPlanRegion | undefined;
  if (modeConfig.regionKind) {
    const regionChoices =
      modeConfig.regionKind === "token-plan"
        ? TOKEN_PLAN_REGION_OPTIONS
        : CODING_PLAN_REGION_OPTIONS;
    const selectedRegion = await promptSelect({
      message: "Choose region:",
      choices: regionChoices,
      defaultValue: "cn",
    });

    if (!selectedRegion) {
      throw new BailianError("Setup cancelled.", ExitCode.AUTH);
    }
    if (modeConfig.regionKind === "token-plan") {
      tokenPlanRegion = selectedRegion as TokenPlanRegion;
    } else {
      codingPlanRegion = selectedRegion as CodingPlanRegion;
    }
  }

  const keyInput = await promptText({
    message: `Enter your API key (${modeConfig.keyPlaceholder}):`,
  });

  if (!keyInput) {
    throw new BailianError("Setup cancelled.", ExitCode.AUTH);
  }

  const key = keyInput.trim();
  if (!key) {
    throw new BailianError(
      "API key cannot be empty.",
      ExitCode.AUTH,
      `Get API Key: ${API_KEY_PAGE}`,
    );
  }

  if (modeConfig.validateKey) {
    const err = modeConfig.validateKey(key);
    if (err) {
      throw new BailianError(err, ExitCode.USAGE, `Get API Key: ${API_KEY_PAGE}`);
    }
  }

  return { mode: selectedMode as AuthMode, key, codingPlanRegion, tokenPlanRegion };
}
