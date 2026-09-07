export type FieldType =
  | "text" | "number" | "date" | "select" | "boolean" | "phone" | "email";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  searchable?: boolean;
  filterable?: boolean;
  sensitive?: boolean;
}

export interface Terminology {
  record: string;
  records: string;
  campaign: string;
  campaigns: string;
  agent: string;
  agents: string;
  followUp: string;
  assignment: string;
  assignments: string;
  outcome: string;
  outcomes: string;
}

export interface DashboardLabels {
  records: string;
  pending: string;
  campaigns: string;
  agents: string;
  reachRate: string;
  outcomes: string;
}

export interface OutcomeDefinition {
  key: string;
  label: string;
  resultingState: string;
  createsFollowUp: boolean;
  terminal?: boolean;
}

export interface CampaignDefinition {
  key: string;
  label: string;
  allowedOutcomes?: string[];
}

export interface WorkflowConfiguration {
  initialState: string;
  assignmentState: string;
  contactState: string;
  outcomes: OutcomeDefinition[];
}

export interface IndustryConfiguration {
  industry: string;
  version: string;
  displayName: string;
  recordType: string;
  recordTypePlural: string;
  fieldDefinitions: FieldDefinition[];
  campaignTypes: string[];
  campaignDefinitions?: CampaignDefinition[];
  operationalRoles: string[];
  agentRole: string;
  workflowStates: string[];
  outcomeTypes: string[];
  workflow: WorkflowConfiguration;
  terminology: Terminology;
  permissions: string[];
  dashboardLabels: DashboardLabels;
}
