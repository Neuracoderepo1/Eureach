# Eureach v1.1 Launch Gate

## Code / contract
- [x] Industry configuration is executable and immutable.
- [x] Generic workflow and tenant-aware persistence.
- [x] API contract documented in `openapi.yaml`.
- [x] Request limits, HTTP timeouts, security headers and CORS controls.
- [x] Graceful shutdown.
- [x] Idempotent outreach retries.
- [x] Optimistic concurrency protection for record updates.
- [x] Wildcard IAM privilege escalation blocked through the role API.
- [x] Migration checksums and advisory locking.
- [x] Backup and guarded restore scripts.
- [x] Dockerfile uses `npm ci` (deterministic) in both build and runtime stages.

## Database
- [x] PostgreSQL RLS enabled and forced.
- [x] Tenant-scoped composite foreign keys.
- [x] Runtime role is not table owner.
- [x] Security-definer authentication functions have restricted execution.
- [x] Clean-install migration runs against PostgreSQL 16 in CI.
- [x] Upgrade migration from the legacy v1.1 schema runs in CI, through migrations `002` and `003` in sequence.
- [x] Cross-tenant reads/writes/references verified with two real tenants under the real restricted role (`tests/rls-isolation.test.mjs`, run in CI).
- [ ] Verify backup restore into a fresh PostgreSQL instance under production-representative volume. `scripts/dr-drill.sh` proves the mechanism against a disposable database; a drill against production-shaped infrastructure and data volume, with the result recorded, is still outstanding.

## Application verification
- [x] Node runtime syntax checks pass.
- [x] `npm ci` in a network-enabled CI runner.
- [x] `npm run build`.
- [x] `npm test`.
- [x] `npm run test:security`.
- [x] Authorization matrix for every configured permission (`tests/authorization-matrix.test.mjs`, run in CI: every permission proven to both allow and deny correctly).
- [ ] Browser E2E: login → configuration → record → assignment → outreach → follow-up. `tests/e2e/operator-console.spec.ts` covers login → dashboard → create record, which is everything the console UI currently exposes. Assignment, outreach and follow-up have no console screens yet — building that UI (or explicitly scoping the journey to API-level E2E for those steps) is a prerequisite for closing this item, not just a test-writing task.
- [ ] Load test at expected production concurrency.
- [x] Dependency vulnerability scan (`npm audit --omit=dev --audit-level=high`, run in CI).
- [ ] Container vulnerability scan gate confirmed green on a real run (step is wired into CI as report-only pending a first baseline).

## Infrastructure
- [ ] Production secrets injected through a secret manager.
- [ ] Managed PostgreSQL with automated backups and point-in-time recovery.
- [ ] TLS termination and DNS configured.
- [ ] Centralized logs and alerting.
- [ ] Metrics endpoint restricted to monitoring infrastructure or disabled.
- [ ] Error monitoring configured.
- [ ] Disaster-recovery runbook exercised against production-representative infrastructure (mechanism proven via `scripts/dr-drill.sh`; production-shaped execution still outstanding).
- [ ] Staging smoke test approved before production promotion.

## Go / No-Go

**Go** only after every unchecked item above that applies to the chosen production environment has a recorded verification result. The repository is a launch candidate; deployment-specific controls must still be provisioned and verified in the target environment. As of this pass, every item that can be closed by code and CI alone has been — what remains is UI work (assignment/outreach/follow-up screens), execution of drills and load tests against real infrastructure, and infrastructure provisioning itself, none of which a repository change can complete on its own.
