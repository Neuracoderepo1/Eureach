import type { IndustryConfiguration } from "../config/types.js";
import type { Assignment, FollowUp, OutreachAttempt, Outcome, RecordEntity } from "../domain/core.js";

export interface WorkflowResult {
  record: RecordEntity;
  assignment: Assignment;
  attempt: OutreachAttempt;
  outcome: Outcome;
  followUp?: FollowUp;
}

/** Industry-agnostic outreach workflow. Behavior comes from configuration. */
export function executeOutreachWorkflow(
  config: IndustryConfiguration,
  input: {
    tenantId: string;
    recordId: string;
    campaignId: string;
    assigneeId: string;
    agentId: string;
    queueId: string;
    outcomeType: string;
    channel: OutreachAttempt["channel"];
    customFields: Record<string, unknown>;
  }
): WorkflowResult {
  const outcomeDefinition = config.workflow.outcomes.find(o => o.label === input.outcomeType);
  if (!outcomeDefinition) {
    throw new Error(`Outcome "${input.outcomeType}" is not configured for ${config.displayName}`);
  }

  const requiredFields = config.fieldDefinitions.filter(f => f.required);
  for (const field of requiredFields) {
    if (input.customFields[field.key] === undefined || input.customFields[field.key] === null || input.customFields[field.key] === "") {
      throw new Error(`Required field "${field.label}" is missing for ${config.displayName}`);
    }
  }

  const now = new Date().toISOString();
  const record: RecordEntity = {
    id: input.recordId,
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    assignedTo: input.assigneeId,
    status: outcomeDefinition.resultingState,
    customFields: input.customFields,
    createdAt: now,
    updatedAt: now
  };

  const assignment: Assignment = {
    id: `assignment-${input.recordId}`,
    tenantId: input.tenantId,
    recordId: input.recordId,
    assigneeId: input.assigneeId,
    queueId: input.queueId,
    priority: 1,
    assignedAt: now
  };

  const attempt: OutreachAttempt = {
    id: `attempt-${input.recordId}`,
    tenantId: input.tenantId,
    recordId: input.recordId,
    agentId: input.agentId,
    channel: input.channel,
    attemptedAt: now
  };

  const outcome: Outcome = {
    id: `outcome-${input.recordId}`,
    tenantId: input.tenantId,
    recordId: input.recordId,
    attemptId: attempt.id,
    type: input.outcomeType,
    occurredAt: now
  };

  const followUp: FollowUp | undefined = outcomeDefinition.createsFollowUp
    ? {
        id: `followup-${input.recordId}`,
        tenantId: input.tenantId,
        recordId: input.recordId,
        ownerId: input.assigneeId,
        dueAt: now,
        status: "open"
      }
    : undefined;

  return { record, assignment, attempt, outcome, ...(followUp ? { followUp } : {}) };
}
