import type { IndustryConfiguration } from "./types.js";

export function validateIndustryConfiguration(config: IndustryConfiguration): void {
  if (!config.industry || !config.version || !config.displayName) throw new Error("Configuration identity is incomplete");
  if (!/^\d+\.\d+\.\d+$/.test(config.version)) throw new Error(`${config.industry}: version must be semver`);
  if (!config.campaignTypes.length) throw new Error(`${config.industry}: at least one campaign type is required`);
  if (!config.operationalRoles.length || !config.agentRole) throw new Error(`${config.industry}: operational roles are incomplete`);
  if (!config.permissions.length) throw new Error(`${config.industry}: permission catalog is empty`);
  if (!config.recordType || !config.recordTypePlural) throw new Error(`${config.industry}: record terminology is incomplete`);
  if (!config.workflowStates.includes(config.workflow.initialState)) throw new Error(`${config.industry}: invalid initial workflow state`);
  if (!config.workflowStates.includes(config.workflow.assignmentState)) throw new Error(`${config.industry}: invalid assignment workflow state`);
  if (!config.workflowStates.includes(config.workflow.contactState)) throw new Error(`${config.industry}: invalid contact workflow state`);

  const configuredOutcomes = new Set(config.outcomeTypes);
  if (configuredOutcomes.size !== config.outcomeTypes.length) throw new Error(`${config.industry}: duplicate outcome types`);
  if (new Set(config.workflowStates).size !== config.workflowStates.length) throw new Error(`${config.industry}: duplicate workflow states`);
  if (new Set(config.permissions).size !== config.permissions.length) throw new Error(`${config.industry}: duplicate permissions`);
  const definitions = new Map(config.workflow.outcomes.map(o => [o.label, o]));
  if (definitions.size !== config.workflow.outcomes.length) throw new Error(`${config.industry}: duplicate workflow outcome definitions`);
  for (const outcome of configuredOutcomes) {
    if (!definitions.has(outcome)) throw new Error(`${config.industry}: outcome "${outcome}" has no workflow definition`);
  }
  for (const outcome of config.workflow.outcomes) {
    if (!configuredOutcomes.has(outcome.label)) throw new Error(`${config.industry}: workflow defines unknown outcome "${outcome.label}"`);
    if (!config.workflowStates.includes(outcome.resultingState)) {
      throw new Error(`${config.industry}: outcome "${outcome.label}" points to unknown state "${outcome.resultingState}"`);
    }
  }

  const campaignKeys = new Set<string>();
  for (const campaign of config.campaignDefinitions || []) {
    if (campaignKeys.has(campaign.key)) throw new Error(`${config.industry}: duplicate campaign key "${campaign.key}"`);
    campaignKeys.add(campaign.key);
    if (!config.campaignTypes.includes(campaign.label)) throw new Error(`${config.industry}: campaign definition "${campaign.label}" is not in campaignTypes`);
    if (campaign.allowedOutcomes && campaign.allowedOutcomes.some(o => !configuredOutcomes.has(o))) throw new Error(`${config.industry}: campaign ${campaign.label} contains unknown outcome`);
  }

  const fieldKeys = new Set<string>();
  for (const field of config.fieldDefinitions) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key)) throw new Error(`${config.industry}: invalid field key "${field.key}"`);
    if (fieldKeys.has(field.key)) throw new Error(`${config.industry}: duplicate field key "${field.key}"`);
    fieldKeys.add(field.key);
    if (field.type === "select" && !field.options?.length) throw new Error(`${config.industry}: select field "${field.key}" needs options`);
  }
}

export function validateAllConfigurations(configurations: Record<string, IndustryConfiguration>): void {
  for (const [key, config] of Object.entries(configurations)) {
    if (key !== config.industry) throw new Error(`Configuration registry key mismatch: ${key} != ${config.industry}`);
    validateIndustryConfiguration(config);
  }
}
