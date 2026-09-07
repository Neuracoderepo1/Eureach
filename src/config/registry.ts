import type { IndustryConfiguration } from "./types.js";
import { configurations } from "./configurations.js";
import { validateAllConfigurations } from "./validate.js";

export interface TenantConfigurationRef {
  tenantId: string;
  industry: string;
  version: string;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export class ConfigurationRegistry {
  constructor(private readonly entries: Record<string, IndustryConfiguration> = configurations) {
    validateAllConfigurations(entries);
    deepFreeze(this.entries);
  }

  get(industry: string, version?: string): IndustryConfiguration {
    const config = this.entries[industry];
    if (!config) throw new Error(`Unsupported industry configuration: ${industry}`);
    if (version && config.version !== version) {
      throw new Error(`Configuration ${industry}@${version} is not available; active version is ${config.version}`);
    }
    return config;
  }

  resolveTenant(ref: TenantConfigurationRef): IndustryConfiguration {
    return this.get(ref.industry, ref.version);
  }
}

export const configurationRegistry = new ConfigurationRegistry();
