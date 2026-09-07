import { describe, expect, it } from "vitest";
import { configurations, getIndustryConfiguration } from "../src/config/configurations.js";
import { configurationRegistry } from "../src/config/registry.js";
import { validateAllConfigurations } from "../src/config/validate.js";
import { executeOutreachWorkflow } from "../src/workflow/outreach-workflow.js";

const cases = [
  ["agriculture", "Farmer", "Extension Campaign", "Field Coordinator", "Successful", "Successful", false],
  ["healthcare", "Patient", "Outreach Campaign", "Community Health Worker", "Completed", "Completed", false],
  ["financial-services", "Customer", "Loan Campaign", "Relationship Officer", "Converted", "Converted", false]
] as const;

describe("IndustryConfiguration registry", () => {
  it("contains all nine required industry configurations", () => {
    expect(Object.keys(configurations).sort()).toEqual([
      "agriculture", "education", "financial-services", "government", "healthcare", "insurance", "ngo", "research", "telecom"
    ]);
  });

  it("validates every configuration as a complete runtime contract", () => {
    expect(() => validateAllConfigurations(configurations)).not.toThrow();
  });

  it("changes behavior without changing the workflow engine", () => {
    const results = cases.map(([industry, recordType, campaignType, role, outcome, resultingState, createsFollowUp]) => {
      const config = getIndustryConfiguration(industry);
      const result = executeOutreachWorkflow(config, {
        tenantId: "tenant-1", recordId: `record-${industry}`, campaignId: `campaign-${industry}`,
        assigneeId: `assignee-${industry}`, agentId: `agent-${industry}`, queueId: `queue-${industry}`,
        outcomeType: outcome, channel: "phone", customFields: { [config.fieldDefinitions[0].key]: "Demo Person" }
      });
      return { config, result, recordType, campaignType, role, resultingState, createsFollowUp };
    });

    for (const item of results) {
      expect(item.config.recordType).toBe(item.recordType);
      expect(item.config.campaignTypes).toContain(item.campaignType);
      expect(item.config.operationalRoles).toContain(item.role);
      expect(item.result.record.status).toBe(item.resultingState);
      expect(Boolean(item.result.followUp)).toBe(item.createsFollowUp);
      expect(item.result.assignment.recordId).toBe(item.result.record.id);
      expect(item.result.attempt.recordId).toBe(item.result.record.id);
      expect(item.result.outcome.recordId).toBe(item.result.record.id);
    }

    expect(results.map(x => Object.keys(x.result).sort())).toEqual([
      ["assignment", "attempt", "outcome", "record"],
      ["assignment", "attempt", "outcome", "record"],
      ["assignment", "attempt", "outcome", "record"]
    ]);
  });

  it("resolves configuration from the tenant reference, including version", () => {
    const config = configurationRegistry.resolveTenant({ tenantId: "tenant-1", industry: "healthcare", version: "1.0.0" });
    expect(config.recordType).toBe("Patient");
    expect(config.version).toBe("1.0.0");
  });

  it("rejects outcomes that are not part of the active configuration", () => {
    const config = getIndustryConfiguration("healthcare");
    expect(() => executeOutreachWorkflow(config, {
      tenantId: "tenant-1", recordId: "record-1", campaignId: "campaign-1", assigneeId: "user-1", agentId: "agent-1",
      queueId: "queue-1", outcomeType: "Renewed", channel: "phone", customFields: { name: "Demo Person" }
    })).toThrow(/not configured for Healthcare/);
  });

  it("enforces required fields from configuration", () => {
    const config = getIndustryConfiguration("financial-services");
    expect(() => executeOutreachWorkflow(config, {
      tenantId: "tenant-1", recordId: "record-1", campaignId: "campaign-1", assigneeId: "user-1", agentId: "agent-1",
      queueId: "queue-1", outcomeType: "Converted", channel: "phone", customFields: {}
    })).toThrow(/Customer name/);
  });
});
