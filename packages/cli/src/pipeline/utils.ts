import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { PipelineStep } from "./types.ts";

/** Keys that represent output destination paths (not input files to be read). */
export const OUTPUT_PATH_KEYS = ["download", "out-dir", "output"];

function isRelativePath(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

export interface ResolvedInputPaths {
  input: Record<string, unknown>;
  resolvedKeys: string[];
}

export function resolveInputPaths(
  input: Record<string, unknown>,
  basePath: string,
): ResolvedInputPaths {
  const result: Record<string, unknown> = {};
  const resolvedKeys: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && isRelativePath(value)) {
      result[key] = resolve(basePath, value);
      resolvedKeys.push(key);
    } else {
      result[key] = value;
    }
  }
  return { input: result, resolvedKeys };
}

export async function checkInputPaths(
  input: Record<string, unknown>,
  keys: string[],
  stepId: string,
): Promise<string[]> {
  const issues: string[] = [];
  for (const key of keys) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const exists = await access(value).then(
      () => true,
      () => false,
    );
    if (!exists) {
      issues.push(`Step "${stepId}" input "${key}" references file that does not exist: ${value}`);
    }
  }
  return issues;
}

export function parseTimeoutSeconds(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : undefined;
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2] ?? "s";
  if (unit === "ms") return amount / 1000;
  if (unit === "m") return amount * 60;
  return amount;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function collectFromDependencies(value: unknown, dependencies: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFromDependencies(item, dependencies));
    return;
  }
  if (!isRecord(value)) return;
  if ("$from" in value && typeof value.$from === "string") dependencies.add(value.$from);
  for (const child of Object.values(value)) collectFromDependencies(child, dependencies);
}

export async function preflightCheckInputFiles(
  steps: PipelineStep[],
  basePath: string,
): Promise<string[]> {
  const issues: string[] = [];
  for (const step of steps) {
    for (const [key, value] of Object.entries(step.input)) {
      if (OUTPUT_PATH_KEYS.includes(key)) continue;
      if (typeof value !== "string") continue;
      if (!isRelativePath(value)) continue;
      const absPath = resolve(basePath, value);
      const exists = await access(absPath).then(
        () => true,
        () => false,
      );
      if (!exists) {
        issues.push(
          `Step "${step.id}" input "${key}" references file that does not exist: ${absPath}`,
        );
      }
    }
  }
  return issues;
}
