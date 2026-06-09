import type { IntentProfile } from "../types.ts";
import { Budgets, Capabilities, Complexities, ContextNeeds, QualityPreferences } from "../types.ts";

export const DEFAULT_INTENT: IntentProfile = {
  complexity: Complexities.Single,
  taskSummary: "",
  scenarioHints: [],
  inputModality: [],
  outputModality: [],
  requiredCapabilities: [Capabilities.TG],
  requiredFeatures: [],
  budget: Budgets.Medium,
  contextNeed: ContextNeeds.Standard,
  qualityPreference: QualityPreferences.Balanced,
  confidence: 0,
};
