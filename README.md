# Eureach — Production Runtime v1.1

Eureach is a configurable outreach-operations platform. The core engine is industry-agnostic; tenant configuration supplies terminology, fields, campaigns, roles, workflow states, outcomes, permissions and dashboard labels.

## What was closed

### 1. Configuration is now executable, not decorative
- Versioned and immutable `IndustryConfiguration` objects.
- Startup validation for all nine configurations.
- Config-driven required fields and field types/options.
- Config-driven initial, assignment and contact states.
- Config-driven outcome semantics, resulting state and follow-up creation.
- Config-driven dashboard metrics, including pending states.
- Generic workflow transition guard; terminal records cannot be mutated into another state.
- No vertical entity names are present in the core domain/runtime outside the configuration catalog.

### 2. Tenant isolation is enforced at the database boundary
- Every tenant-owned table carries `tenant_id`.
- Composite foreign keys prevent cross-tenant references.
- PostgreSQL Row Level Security is enabled and forced on tenant-owned tables, including `tenant`.
- Request transactions set `app.tenant_id` before application data access.
- The API connects as a non-owner database role.
- Login/refresh use narrowly scoped `SECURITY DEFINER` functions rather than bypassing RLS from application SQL.

### 3. Authentication and authorization
- Short-lived HS256 access tokens.
- Rotating refresh tokens stored only as SHA-256 hashes.
- Refresh token delivered as an HttpOnly, SameSite=Strict cookie.
- Passwords use salted scrypt hashes.
- Permission middleware is enforced on API operations.
- Role permissions are configuration-aware and can be managed by authorized administrators.
- Failed/invalid authentication never reveals whether a tenant/user exists.

### 4. Operational API
Implemented endpoints include:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/config`
- `GET /api/v1/dashboard`
- `GET/POST /api/v1/records`
- `GET/PATCH /api/v1/records/:id`
- `POST /api/v1/records/:id/outreach`
- `GET/POST /api/v1/campaigns`
- `GET/POST /api/v1/queues`
- `POST /api/v1/queues/:id/assign`
- `GET/PATCH /api/v1/follow-ups`
- `GET/POST /api/v1/roles`
- `GET/POST /api/v1/users`
- `GET /api/v1/audit`
- `GET /api/v1/analytics`
- `openapi.yaml` API contract for integration/documentation.
- `GET /health/live`
- `GET /health/ready`

### 5. Evidence and accountability
- Record creation/update is audited.
- Assignments are audited.
- Outreach outcomes are audited.
- Follow-up changes are audited.
- User/role creation is audited.
- Analytics events are persisted transactionally with outreach completion.
- Follow-up records are created transactionally with outreach outcomes.
- Outreach supports an optional idempotency key to make retried client requests safe.

### 6. Production operations
- PostgreSQL 16 baseline.
- Database migration runner.
- Docker multi-stage build.
- Non-root application container.
- Read-only application filesystem and no-new-privileges container policy.
- Health/readiness endpoints.
- Request IDs and structured error logging.
- Graceful SIGTERM/SIGINT shutdown with bounded drain timeout.
- HTTP request/header/keep-alive timeouts.
- Container healthcheck against the liveness endpoint.
- Migration checksums and PostgreSQL advisory locking to prevent concurrent migration races.
- Security headers and configurable CORS.
- Request body limits and rate limiting.
- Connection pooling and database health checks.

### 7. Configuration-aware operator console
`app/index.html` is a minimal operator console that consumes the runtime configuration API. It dynamically renders record terminology and fields rather than duplicating industry-specific forms in the UI.

## Architecture invariant

> Same engine + different tenant configuration = different industry operating environment.

Agriculture, Healthcare, Financial Services, Insurance, Education, NGO/Development, Market Research, Telecom and Government remain configurations, not separate application engines.

## Run locally

1. Copy `.env.example` to `.env` and generate a strong `JWT_SECRET` and database passwords.
2. Install dependencies with `npm ci`.
3. Build the configuration runtime with `npm run build`.
4. Start PostgreSQL and apply `database/001_core_schema.sql` plus migrations under `database/migrations/` (or use the included Compose stack).
5. Bootstrap a tenant/admin with `ADMIN_DATABASE_URL=... SEED_ADMIN_PASSWORD='...' npm run seed`.
6. Start the API with `npm start`.
7. Open `/` for the operator console.

## Docker

Set:
- `POSTGRES_ADMIN_PASSWORD`
- `POSTGRES_APP_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGINS`

Then run:

`docker compose up --build`

The database is initialized with RLS and a dedicated non-owner API role.

## Verification status

Static JavaScript syntax checks pass for the server/runtime scripts. The TypeScript source was previously verified with `tsc -p tsconfig.src.json --noEmit` before this production hardening pass; this environment does not have a working local TypeScript toolchain and `npm install` timed out, so a fresh full build/Vitest run has **not** been claimed here.

Before a real production launch, run in a network-enabled CI environment:

- `npm ci` (with a committed lockfile in the deployment repository)
- `npm run build`
- `npm test`
- migration test against a clean PostgreSQL instance
- migration upgrade test from the v1.1 schema
- tenant-isolation integration tests with two tenants
- auth/refresh rotation tests
- authorization matrix tests for every permission
- browser E2E tests for login → config → record → outreach → follow-up
- dependency/security scanning
- backup/restore and disaster-recovery test
- load test against the expected Ghana-first production workload

This repository is now a **production-ready implementation baseline / launch candidate**, not a claim that cloud infrastructure, DNS, secrets, CI/CD, monitoring provider, backups or a live customer deployment have already been provisioned.
