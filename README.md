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

**Note:** the operator console (`app/index.html`) currently only has screens for login, dashboard metrics, and record create/list. Outreach logging, assignment, follow-ups, campaigns, queues, and roles/users are reachable via the API above but have no console UI yet — see "Known gaps" below.

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
- Docker multi-stage build, both stages installed with `npm ci` for deterministic builds.
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
- Backup (`scripts/backup.sh`) and guarded restore (`scripts/restore.sh`, requires `CONFIRM_RESTORE=YES`).
- `scripts/dr-drill.sh` exercises the full backup → destroy → restore → integrity-check chain against a real, disposable Postgres database — not just that the scripts exist.

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

This section reflects what the committed CI pipeline (`.github/workflows/ci.yml`) actually runs on every push, not a point-in-time manual claim. As of this pass, CI:

- Installs with `npm ci` (deterministic; lockfile is committed).
- Runs `npm run build` and `npm test`.
- Runs Node syntax checks on the server entry points.
- Applies a clean schema to a real PostgreSQL 16 instance and creates the real non-owner runtime role.
- Applies the launch-hardening migration.
- Runs `tests/rls-isolation.test.mjs`: adversarial tenant-isolation proof against the real, restricted runtime role — unfiltered selects, guessed IDs, cross-tenant self-joins, cross-tenant update/delete, forged tenant IDs on insert, and a no-tenant-context session, confirming isolation fails **closed**.
- Runs `tests/authorization-matrix.test.mjs`: for every permission in the shared configuration permission set, proves a role with only that permission can call its endpoint, and a role with every *other* permission (or none) is rejected with 403 on it.
- Runs `npm run test:security` (password hashing, JWT sign/verify/tamper-rejection).
- Validates the upgrade path from the legacy v1.1 schema through migrations `002` and `003` in sequence against a separate database.
- Runs `npm audit --omit=dev --audit-level=high` against production dependencies (currently a single runtime dependency, `pg`).
- Builds the container image and scans it for high/critical vulnerabilities (report-only pending a first baseline run — see `RELEASE-CHECKLIST.md`).

**Still open, and intentionally not claimed as done:**

- Browser E2E only covers what the console UI currently exposes (login, dashboard, record create) — see `tests/e2e/operator-console.spec.ts` for the exact scope note. Assignment, outreach, and follow-up have no console UI yet, so they cannot be browser-tested until that UI exists.
- `scripts/dr-drill.sh` has been written and is safe to run against a disposable database, but a drill run against production-representative infrastructure and volume has not been executed and recorded.
- Load test against expected production concurrency and workload shape.
- Real managed PostgreSQL, secrets manager, DNS/TLS, centralized logging, error monitoring and alerting are infrastructure decisions for the target deployment environment — none of them are provisioned by this repository, and no code change closes them.

This repository is a **production-ready implementation baseline / launch candidate**. Closing the "still open" items above is what moves it from launch candidate to a verified production deployment — see `RELEASE-CHECKLIST.md` for the full gate.
