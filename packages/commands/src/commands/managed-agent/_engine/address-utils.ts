import type { ResourceAddress } from "@openagentpack/sdk";

/** Full state address: provider.type.name */
export function formatResourceAddress(address: ResourceAddress): string {
  return `${address.provider}.${address.type}.${address.name}`;
}

/** CLI display short label: type.name (provider) */
export function formatResourceLabel(address: ResourceAddress): string {
  return `${address.type}.${address.name} (${address.provider})`;
}
