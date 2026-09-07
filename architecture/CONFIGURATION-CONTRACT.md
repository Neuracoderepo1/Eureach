# IndustryConfiguration Contract

Required fields:

```ts
interface IndustryConfiguration {
  industry: string;
  displayName: string;
  recordType: string;
  recordTypePlural: string;
  fieldDefinitions: FieldDefinition[];
  campaignTypes: string[];
  operationalRoles: string[];
  agentRole: string;
  workflowStates: string[];
  outcomeTypes: string[];
  terminology: Terminology;
  permissions: string[];
  dashboardLabels: DashboardLabels;
}
```

## Design constraints

1. No configuration may alter the identity of the core workflow entities.
2. No configuration may require a vertical-specific database table.
3. Configuration controls vocabulary and allowed operational values.
4. Server-side authorization remains authoritative.
5. Analytics event names remain generic.
6. Frontend components consume configuration through props/context.
7. API validators consume the active tenant configuration.
8. New industries should normally require a new configuration file, not new core workflow code.
