import { configurationRegistry } from '../dist/config/registry.js';

export function resolveConfig(tenant) {
  return configurationRegistry.resolveTenant({ tenantId: tenant.id, industry: tenant.industry_key, version: tenant.configuration_version });
}
