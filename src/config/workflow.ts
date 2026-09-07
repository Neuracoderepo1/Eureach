import type { IndustryConfiguration } from './types.js';

export function terminalStates(config: IndustryConfiguration): Set<string> {
  return new Set(config.workflow.outcomes.filter(o => o.terminal).map(o => o.resultingState));
}

export function allowedNextStates(config: IndustryConfiguration, current: string): Set<string> {
  const states = new Set([current, config.workflow.assignmentState, config.workflow.contactState]);
  for (const outcome of config.workflow.outcomes) states.add(outcome.resultingState);
  if (terminalStates(config).has(current)) return new Set([current]);
  return states;
}

export function assertStateTransition(config: IndustryConfiguration, from: string, to: string): void {
  if (!config.workflowStates.includes(to)) throw new Error(`State "${to}" is not configured for ${config.displayName}`);
  if (!allowedNextStates(config, from).has(to)) throw new Error(`Transition ${from} -> ${to} is not allowed for ${config.displayName}`);
}
