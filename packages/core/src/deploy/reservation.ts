import type { PrePaidInfo, ReservationCapacity } from "./types.ts";

/** Shared flags for reservation creation, scaling and renewal; capacity is in kTPM. */
export interface ReservationFlags {
  inputTpm?: number;
  outputTpm?: number;
  /** Thinking-output capacity; only some models support it, validated server-side. */
  thinkingOutputTpm?: number;
  /** Day (default) | Hour; Hour is the 8-hour off-peak window. */
  pricingCycle?: string;
  duration?: number;
  autoRenewal?: boolean;
  autoRenewalDuration?: number;
  autoRenewalCycle?: string;
}

/** Validate paired capacity locally; model-specific steps and limits belong to the service. */
export function validateReservationCapacity(
  flags: ReservationFlags,
  required: boolean,
): string | undefined {
  if (!required && flags.inputTpm === undefined && flags.outputTpm === undefined) return undefined;
  if (flags.inputTpm === undefined || flags.outputTpm === undefined) {
    return "--input-tpm and --output-tpm must be provided together.\n必须同时提供 --input-tpm 和 --output-tpm。";
  }
  if (!Number.isSafeInteger(flags.inputTpm) || flags.inputTpm < 0) {
    return "--input-tpm must be a non-negative safe integer in kTPM.\n--input-tpm 必须是非负安全整数，单位为 kTPM。";
  }
  if (!Number.isSafeInteger(flags.outputTpm) || flags.outputTpm < 0) {
    return "--output-tpm must be a non-negative safe integer in kTPM.\n--output-tpm 必须是非负安全整数，单位为 kTPM。";
  }
  return undefined;
}

/** Build validated capacity without converting units or dropping zero. */
export function buildReservationCapacity(flags: ReservationFlags): ReservationCapacity {
  const capacity: ReservationCapacity = {};
  if (flags.inputTpm !== undefined) capacity.input_tpm = flags.inputTpm;
  if (flags.outputTpm !== undefined) capacity.output_tpm = flags.outputTpm;
  if (flags.thinkingOutputTpm !== undefined) capacity.thinking_output_tpm = flags.thinkingOutputTpm;
  return capacity;
}

export function hasPrepaidFlags(flags: ReservationFlags): boolean {
  return (
    flags.pricingCycle !== undefined ||
    flags.duration !== undefined ||
    flags.autoRenewal !== undefined ||
    flags.autoRenewalDuration !== undefined ||
    flags.autoRenewalCycle !== undefined
  );
}

/**
 * The 8-hour off-peak window: prepaid ptu_default only, exactly 8 hours per
 * purchase, never auto-renewed. Selling windows (22:00–24:00) stay server-side.
 */
function validateHourCycle(flags: ReservationFlags): string | undefined {
  if (flags.pricingCycle !== "Hour") return undefined;
  if (flags.duration !== 8) {
    return "--pricing-cycle Hour requires --duration 8.\n--pricing-cycle Hour 要求 --duration 为 8。";
  }
  if (flags.autoRenewal !== false) {
    return "--pricing-cycle Hour requires --auto-renewal false.\n--pricing-cycle Hour 要求 --auto-renewal 为 false。";
  }
  if (flags.autoRenewalDuration !== undefined) {
    return "--pricing-cycle Hour does not accept --auto-renewal-duration.\n--pricing-cycle Hour 不接受 --auto-renewal-duration。";
  }
  if (flags.autoRenewalCycle !== undefined) {
    return "--pricing-cycle Hour does not accept --auto-renewal-cycle.\n--pricing-cycle Hour 不接受 --auto-renewal-cycle。";
  }
  return undefined;
}

/** Validate a complete prepaid block whenever any prepaid field is supplied. */
export function validatePrepaidFlags(
  flags: ReservationFlags,
  required: boolean,
): string | undefined {
  if (!required && !hasPrepaidFlags(flags)) return undefined;
  if (
    flags.pricingCycle !== undefined &&
    flags.pricingCycle !== "Day" &&
    flags.pricingCycle !== "Hour"
  ) {
    return "--pricing-cycle must be Day or Hour (case-sensitive).\n--pricing-cycle 只能为 Day 或 Hour（区分大小写）。";
  }
  const hourError = validateHourCycle(flags);
  if (hourError) return hourError;
  if (
    flags.duration === undefined ||
    !Number.isSafeInteger(flags.duration) ||
    flags.duration <= 0
  ) {
    return "--duration must be a positive safe integer in days.\n--duration 必须是正安全整数，单位为天。";
  }
  if (typeof flags.autoRenewal !== "boolean") {
    return "--auto-renewal must explicitly be true or false.\n必须显式指定 --auto-renewal 为 true 或 false。";
  }
  if (
    (flags.autoRenewal || flags.autoRenewalDuration !== undefined) &&
    (flags.autoRenewalDuration === undefined ||
      !Number.isSafeInteger(flags.autoRenewalDuration) ||
      flags.autoRenewalDuration <= 0)
  ) {
    return "--auto-renewal-duration must be a positive safe integer in days; required when --auto-renewal=true.\n--auto-renewal-duration 必须是正安全整数（天）；开启自动续费时必填。";
  }
  if (
    flags.autoRenewalCycle !== undefined &&
    (typeof flags.autoRenewalCycle !== "string" || flags.autoRenewalCycle.trim() === "")
  ) {
    return "--auto-renewal-cycle must be a non-empty string.\n--auto-renewal-cycle 必须是非空字符串。";
  }
  return undefined;
}

/** Build validated prepaid information, preserving explicit false and omitting absent fields. */
export function buildPrepaidInfo(flags: ReservationFlags): PrePaidInfo | undefined {
  if (!hasPrepaidFlags(flags)) return undefined;
  const prepaid: PrePaidInfo = {};
  if (flags.pricingCycle !== undefined)
    prepaid.pricing_cycle = flags.pricingCycle as "Day" | "Hour";
  if (flags.duration !== undefined) prepaid.duration = flags.duration;
  if (flags.autoRenewal !== undefined) prepaid.auto_renewal = flags.autoRenewal;
  if (flags.autoRenewalDuration !== undefined)
    prepaid.auto_renewal_duration = flags.autoRenewalDuration;
  if (flags.autoRenewalCycle !== undefined) prepaid.auto_renewal_cycle = flags.autoRenewalCycle;
  return prepaid;
}
