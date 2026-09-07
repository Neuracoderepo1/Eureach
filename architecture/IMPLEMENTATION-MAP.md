# Eureach Implementation Map

## 1. Canonical boundary

The industry boundary belongs in configuration, not in the core domain.

```text
Tenant
 └── industryKey
      └── IndustryConfiguration
           ├── terminology
           ├── fields
           ├── campaigns
           ├── roles
           ├── workflow states
           ├── outcomes
           ├── permissions
           └── dashboard labels
```

## 2. Core workflow

Every tenant uses the same operational sequence:

```text
Record
  ↓
Assignment
  ↓
Queue
  ↓
OutreachAttempt
  ↓
Outcome
  ↓
FollowUp
```

The engine does not branch on `industry === "agriculture"`.

Instead it asks configuration for allowed labels, fields, states and outcomes.

## 3. Database rule

Do not create:

- farmer_records
- cocoa_campaigns
- extension_officers
- patient_records
- loan_customers

Use generic entities plus:

- `tenant.industry_key`
- `record.custom_fields`
- configuration-defined campaign types
- configuration-defined roles
- configuration-defined workflow states

## 4. API rule

Prefer generic endpoints:

```text
GET    /api/records
POST   /api/records
GET    /api/records/:id
PATCH  /api/records/:id

GET    /api/campaigns
POST   /api/campaigns

POST   /api/assignments
POST   /api/outreach-attempts
POST   /api/outcomes
POST   /api/follow-ups
```

Do not introduce:

```text
/api/farmers
/api/cocoa-campaigns
/api/patients
/api/loan-customers
```

unless a future integration adapter explicitly requires a compatibility boundary.

## 5. UI rule

UI components should receive configuration rather than industry-specific branching.

Example:

```ts
<RecordForm config={config} />
<CampaignQueue config={config} />
<OutcomeDialog config={config} />
<Dashboard config={config} />
```

The components remain reusable.

## 6. Configuration-aware permissions

Permissions are configuration data, but authorization remains a core security concern.

The application should evaluate:

```text
tenant
+ user
+ role
+ permission
+ resource
+ action
```

The industry configuration determines which operational roles and permission labels are exposed; it must not bypass server-side authorization.

## 7. Analytics rule

Analytics events remain generic:

```text
record.created
assignment.created
outreach.attempted
outcome.logged
followup.created
followup.completed
```

Industry-specific dashboards translate those events using configuration.

Do not create separate event taxonomies such as:

```text
farmer.called
patient.called
customer.called
```

## 8. Next production integration

The next repository task after this architecture package is to wire these exports into the real Eureach backend/frontend:

1. Replace hardcoded industry labels with `getIndustryConfiguration()`.
2. Replace hardcoded record form fields with `fieldDefinitions`.
3. Replace hardcoded campaign selectors with `campaignTypes`.
4. Replace hardcoded role selectors with `operationalRoles`.
5. Replace hardcoded outcome selectors with `outcomeTypes`.
6. Replace dashboard copy with `dashboardLabels`.
7. Apply configuration-aware navigation.
8. Add tenant-level configuration selection.
9. Add API validation against the active configuration.
10. Add database migrations for the generic core entities.
11. Add integration tests across the first three configurations.
12. Expand the same test suite to all nine configurations.
