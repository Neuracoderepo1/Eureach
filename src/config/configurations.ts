import type { IndustryConfiguration } from "./types.js";

const commonPermissions = [
  "records.read",
  "records.update",
  "outreach.log",
  "followups.manage",
  "campaigns.read",
  "campaigns.manage",
  "queues.manage",
  "users.manage",
  "audit.read",
  "analytics.read"
];

const commonTerminology = {
  campaign: "Campaign",
  campaigns: "Campaigns",
  assignment: "Assignment",
  assignments: "Assignments",
  outcome: "Outcome",
  outcomes: "Outcomes",
  followUp: "Follow-up",
  agent: "Agent",
  agents: "Agents"
};

const configurationsMutable: Record<string, IndustryConfiguration> = {
  agriculture: {
    industry: "agriculture",
    version: "1.0.0",
    displayName: "Agriculture",
    recordType: "Farmer",
    recordTypePlural: "Farmers",
    fieldDefinitions: [
      { key: "name", label: "Farmer name", type: "text", required: true },
      { key: "region", label: "Region", type: "text" },
      { key: "program", label: "Program", type: "text" },
      { key: "farmSize", label: "Farm size", type: "number" }
    ],
    campaignTypes: ["Extension Campaign", "Input Distribution", "Farmer Registration"],
    operationalRoles: ["Field Coordinator", "Supervisor"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Follow-up", "Successful", "Closed"],
    outcomeTypes: ["Successful", "Follow-up", "Unreachable", "Not Interested", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "successful", label: "Successful", resultingState: "Successful", createsFollowUp: false, terminal: true }, { key: "follow-up", label: "Follow-up", resultingState: "Follow-up", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Follow-up", createsFollowUp: true }, { key: "not-interested", label: "Not Interested", resultingState: "Closed", createsFollowUp: false, terminal: true }, { key: "escalated", label: "Escalated", resultingState: "Closed", createsFollowUp: true }] },
    terminology: {
      ...commonTerminology,
      record: "Farmer",
      records: "Farmers"
    },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Farmers reached",
      pending: "Follow-ups due",
      campaigns: "Extension campaigns",
      agents: "Field agents",
      reachRate: "Farmer reach rate",
      outcomes: "Outreach outcomes"
    }
  },

  healthcare: {
    industry: "healthcare",
    version: "1.0.0",
    displayName: "Healthcare",
    recordType: "Patient",
    recordTypePlural: "Patients",
    fieldDefinitions: [
      { key: "name", label: "Patient name", type: "text", required: true },
      { key: "district", label: "District", type: "text" },
      { key: "program", label: "Care program", type: "text" },
      { key: "contactWindow", label: "Preferred contact window", type: "text" }
    ],
    campaignTypes: ["Outreach Campaign", "Appointment Follow-up", "Community Health Campaign"],
    operationalRoles: ["Community Health Worker", "Program Coordinator"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Follow-up", "Completed", "Escalated"],
    outcomeTypes: ["Completed", "Follow-up", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "completed", label: "Completed", resultingState: "Completed", createsFollowUp: false, terminal: true }, { key: "follow-up", label: "Follow-up", resultingState: "Follow-up", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Follow-up", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Escalated", createsFollowUp: true }, { key: "escalated", label: "Escalated", resultingState: "Escalated", createsFollowUp: true }] },
    terminology: {
      ...commonTerminology,
      record: "Patient",
      records: "Patients"
    },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Patients reached",
      pending: "Follow-ups due",
      campaigns: "Outreach campaigns",
      agents: "Health workers",
      reachRate: "Patient reach rate",
      outcomes: "Outreach outcomes"
    }
  },

  "financial-services": {
    industry: "financial-services",
    version: "1.0.0",
    displayName: "Financial Services",
    recordType: "Customer",
    recordTypePlural: "Customers",
    fieldDefinitions: [
      { key: "name", label: "Customer name", type: "text", required: true },
      { key: "segment", label: "Customer segment", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "branch", label: "Branch / territory", type: "text" }
    ],
    campaignTypes: ["Loan Campaign", "Customer Activation", "Collections Follow-up"],
    operationalRoles: ["Relationship Officer", "Branch Coordinator"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Pending", "Converted", "Escalated"],
    outcomeTypes: ["Converted", "Pending", "Unreachable", "Not Interested", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "converted", label: "Converted", resultingState: "Converted", createsFollowUp: false, terminal: true }, { key: "pending", label: "Pending", resultingState: "Pending", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Pending", createsFollowUp: true }, { key: "not-interested", label: "Not Interested", resultingState: "Escalated", createsFollowUp: true }, { key: "escalated", label: "Escalated", resultingState: "Escalated", createsFollowUp: true }] },
    terminology: {
      ...commonTerminology,
      record: "Customer",
      records: "Customers"
    },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Customers reached",
      pending: "Follow-ups due",
      campaigns: "Loan campaigns",
      agents: "Relationship officers",
      reachRate: "Customer reach rate",
      outcomes: "Customer outcomes"
    }
  },

  insurance: {
    industry: "insurance",
    version: "1.0.0",
    displayName: "Insurance",
    recordType: "Policyholder",
    recordTypePlural: "Policyholders",
    fieldDefinitions: [
      { key: "name", label: "Policyholder name", type: "text", required: true },
      { key: "region", label: "Region", type: "text" },
      { key: "policy", label: "Policy", type: "text" }
    ],
    campaignTypes: ["Renewal Campaign", "Claims Follow-up"],
    operationalRoles: ["Field Officer"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Follow-up", "Renewed", "Closed"],
    outcomeTypes: ["Renewed", "Follow-up", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "renewed", label: "Renewed", resultingState: "Renewed", createsFollowUp: false, terminal: true }, { key: "follow-up", label: "Follow-up", resultingState: "Follow-up", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Follow-up", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Closed", createsFollowUp: false, terminal: true }, { key: "escalated", label: "Escalated", resultingState: "Closed", createsFollowUp: true }] },
    terminology: { ...commonTerminology, record: "Policyholder", records: "Policyholders" },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Policyholders reached",
      pending: "Renewals due",
      campaigns: "Renewal campaigns",
      agents: "Field officers",
      reachRate: "Policyholder reach rate",
      outcomes: "Renewal outcomes"
    }
  },

  education: {
    industry: "education",
    version: "1.0.0",
    displayName: "Education",
    recordType: "Student / Parent",
    recordTypePlural: "Students / Parents",
    fieldDefinitions: [
      { key: "name", label: "Student / parent", type: "text", required: true },
      { key: "district", label: "District", type: "text" },
      { key: "school", label: "School", type: "text" }
    ],
    campaignTypes: ["Enrollment Campaign", "Admissions Follow-up"],
    operationalRoles: ["Admissions Officer"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Follow-up", "Enrolled", "Closed"],
    outcomeTypes: ["Enrolled", "Follow-up", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "enrolled", label: "Enrolled", resultingState: "Enrolled", createsFollowUp: false, terminal: true }, { key: "follow-up", label: "Follow-up", resultingState: "Follow-up", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Follow-up", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Closed", createsFollowUp: false, terminal: true }, { key: "escalated", label: "Escalated", resultingState: "Closed", createsFollowUp: true }] },
    terminology: { ...commonTerminology, record: "Student / Parent", records: "Students / Parents" },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Students / parents reached",
      pending: "Admissions follow-ups",
      campaigns: "Enrollment campaigns",
      agents: "Admissions officers",
      reachRate: "Enrollment reach rate",
      outcomes: "Enrollment outcomes"
    }
  },

  ngo: {
    industry: "ngo",
    version: "1.0.0",
    displayName: "NGO / Development",
    recordType: "Beneficiary",
    recordTypePlural: "Beneficiaries",
    fieldDefinitions: [
      { key: "name", label: "Beneficiary name", type: "text", required: true },
      { key: "region", label: "Region", type: "text" },
      { key: "program", label: "Program", type: "text" }
    ],
    campaignTypes: ["Program Campaign", "Beneficiary Registration"],
    operationalRoles: ["Field Officer"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Follow-up", "Completed", "Escalated"],
    outcomeTypes: ["Completed", "Follow-up", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "completed", label: "Completed", resultingState: "Completed", createsFollowUp: false, terminal: true }, { key: "follow-up", label: "Follow-up", resultingState: "Follow-up", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Follow-up", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Escalated", createsFollowUp: true }, { key: "escalated", label: "Escalated", resultingState: "Escalated", createsFollowUp: true }] },
    terminology: { ...commonTerminology, record: "Beneficiary", records: "Beneficiaries" },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Beneficiaries reached",
      pending: "Follow-ups due",
      campaigns: "Program campaigns",
      agents: "Field officers",
      reachRate: "Beneficiary reach rate",
      outcomes: "Program outcomes"
    }
  },

  research: {
    industry: "research",
    version: "1.0.0",
    displayName: "Market Research",
    recordType: "Respondent",
    recordTypePlural: "Respondents",
    fieldDefinitions: [
      { key: "name", label: "Respondent name", type: "text", required: true },
      { key: "region", label: "Region", type: "text" },
      { key: "segment", label: "Research segment", type: "text" }
    ],
    campaignTypes: ["Survey Campaign", "Interview Campaign"],
    operationalRoles: ["Research Coordinator"],
    agentRole: "Interviewer",
    workflowStates: ["New", "Assigned", "Contacted", "Scheduled", "Completed", "Closed"],
    outcomeTypes: ["Completed", "Scheduled", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "completed", label: "Completed", resultingState: "Completed", createsFollowUp: false, terminal: true }, { key: "scheduled", label: "Scheduled", resultingState: "Scheduled", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Scheduled", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Closed", createsFollowUp: false, terminal: true }, { key: "escalated", label: "Escalated", resultingState: "Closed", createsFollowUp: true }] },
    terminology: { ...commonTerminology, record: "Respondent", records: "Respondents", agent: "Interviewer", agents: "Interviewers" },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Respondents reached",
      pending: "Interviews pending",
      campaigns: "Survey campaigns",
      agents: "Interviewers",
      reachRate: "Respondent reach rate",
      outcomes: "Survey outcomes"
    }
  },

  telecom: {
    industry: "telecom",
    version: "1.0.0",
    displayName: "Telecom",
    recordType: "Subscriber",
    recordTypePlural: "Subscribers",
    fieldDefinitions: [
      { key: "name", label: "Subscriber name", type: "text", required: true },
      { key: "region", label: "Region", type: "text" },
      { key: "plan", label: "Plan", type: "text" }
    ],
    campaignTypes: ["Retention Campaign", "Upgrade Campaign"],
    operationalRoles: ["Field Representative"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Pending", "Retained", "Closed"],
    outcomeTypes: ["Retained", "Pending", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "retained", label: "Retained", resultingState: "Retained", createsFollowUp: false, terminal: true }, { key: "pending", label: "Pending", resultingState: "Pending", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Pending", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Closed", createsFollowUp: false, terminal: true }, { key: "escalated", label: "Escalated", resultingState: "Closed", createsFollowUp: true }] },
    terminology: { ...commonTerminology, record: "Subscriber", records: "Subscribers" },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Subscribers reached",
      pending: "Retention follow-ups",
      campaigns: "Retention campaigns",
      agents: "Field representatives",
      reachRate: "Subscriber reach rate",
      outcomes: "Retention outcomes"
    }
  },

  government: {
    industry: "government",
    version: "1.0.0",
    displayName: "Government",
    recordType: "Citizen",
    recordTypePlural: "Citizens",
    fieldDefinitions: [
      { key: "name", label: "Citizen name", type: "text", required: true },
      { key: "district", label: "District", type: "text" },
      { key: "service", label: "Public service", type: "text" }
    ],
    campaignTypes: ["Public-Service Campaign", "Citizen Registration"],
    operationalRoles: ["Field Officer"],
    agentRole: "Agent",
    workflowStates: ["New", "Assigned", "Contacted", "Follow-up", "Resolved", "Escalated"],
    outcomeTypes: ["Resolved", "Follow-up", "Unreachable", "Declined", "Escalated"],
    workflow: { initialState: "New", assignmentState: "Assigned", contactState: "Contacted", outcomes: [{ key: "resolved", label: "Resolved", resultingState: "Resolved", createsFollowUp: false, terminal: true }, { key: "follow-up", label: "Follow-up", resultingState: "Follow-up", createsFollowUp: true }, { key: "unreachable", label: "Unreachable", resultingState: "Follow-up", createsFollowUp: true }, { key: "declined", label: "Declined", resultingState: "Escalated", createsFollowUp: true }, { key: "escalated", label: "Escalated", resultingState: "Escalated", createsFollowUp: true }] },
    terminology: { ...commonTerminology, record: "Citizen", records: "Citizens" },
    permissions: commonPermissions,
    dashboardLabels: {
      records: "Citizens reached",
      pending: "Cases requiring follow-up",
      campaigns: "Public-service campaigns",
      agents: "Field officers",
      reachRate: "Citizen reach rate",
      outcomes: "Service outcomes"
    }
  }
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const configurations = deepFreeze(configurationsMutable);

export function getIndustryConfiguration(industry: string, version?: string): IndustryConfiguration {
  const config = configurations[industry];
  if (!config) throw new Error(`Unsupported industry configuration: ${industry}`);
  if (version && config.version !== version) throw new Error(`Configuration ${industry}@${version} is not available; active version is ${config.version}`);
  return config;
}
