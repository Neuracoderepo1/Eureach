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

## Database
- [x] PostgreSQL RLS enabled and forced.
- [x] Tenant-scoped composite foreign keys.
- [x] Runtime role is not table owner.
- [x] Security-definer authentication functions have restricted execution.
- [ ] Run clean-install migration against PostgreSQL 16 in CI.
- [ ] Run upgrade migration from the legacy v1.1 schema in CI.
- [ ] Verify cross-tenant reads/writes/references with two real tenants.
- [ ] Verify backup restore into a fresh PostgreSQL instance.

## Application verification
- [x] Node runtime syntax checks pass.
- [ ] `npm ci` in a network-enabled CI runner.
- [ ] `npm run build`.
- [ ] `npm test`.
- [ ] `npm run test:security`.
- [ ] Browser E2E: login → configuration → record → assignment → outreach → follow-up.
- [ ] Authorization matrix for every configured permission.
- [ ] Load test at expected production concurrency.
- [ ] Dependency and container vulnerability scan.

## Infrastructure
- [ ] Production secrets injected through a secret manager.
- [ ] Managed PostgreSQL with automated backups and point-in-time recovery.
- [ ] TLS termination and DNS configured.
- [ ] Centralized logs and alerting.
- [ ] Metrics endpoint restricted to monitoring infrastructure or disabled.
- [ ] Error monitoring configured.
- [ ] Disaster-recovery runbook exercised.
- [ ] Staging smoke test approved before production promotion.

## Go / No-Go

**Go** only after every unchecked item above that applies to the chosen production environment has a recorded verification result. The repository is a launch candidate; deployment-specific controls must still be provisioned and verified in the target environment.
