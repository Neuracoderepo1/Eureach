// Browser E2E against the REAL operator console (app/index.html) and the
// real API -- no mocked network calls. Selectors below are copied
// verbatim from app/index.html's element ids, not guessed.
//
// IMPORTANT SCOPE NOTE, found while writing this test against the actual
// console markup: app/index.html currently renders only login, the
// dashboard metric cards, the records table, and "create record". There
// is no UI for outreach logging, assignment, follow-ups, campaigns,
// queues, or roles/users -- those exist only as API endpoints (see
// server/app.mjs). So the journey the Sep 9 report described --
// "login -> configuration -> record -> assignment -> outreach ->
// follow-up" -- cannot be exercised through the browser as it stands
// today; only the first three steps have a UI to click through. This
// test covers exactly what the console supports. Closing the rest of
// the journey requires either (a) building that UI, or (b) treating
// assignment/outreach/follow-up as API-level E2E instead of browser E2E
// -- that's a product decision, not something a test file can paper
// over.
//
// Requires a running instance (e.g. `npm start` against a seeded
// database) and a seeded tenant/admin user. Set:
//   E2E_BASE_URL      (default http://localhost:8080)
//   E2E_TENANT_SLUG
//   E2E_ADMIN_EMAIL
//   E2E_ADMIN_PASSWORD
import { test, expect } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8080';
const tenantSlug = process.env.E2E_TENANT_SLUG || 'demo';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test.skip(!email || !password, 'set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run against a seeded tenant');

test('login -> dashboard loads -> create a record -> record appears in the table', async ({ page }) => {
  await page.goto(baseURL);

  // -- Login --
  await page.fill('#tenant', tenantSlug);
  await page.fill('#email', email!);
  await page.fill('#password', password!);
  await page.click('#loginBtn');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#login')).toBeHidden();

  // -- Dashboard renders real, non-placeholder metrics --
  await expect(page.locator('#recordsMetric')).not.toHaveText('—');
  await expect(page.locator('#campaignMetric')).not.toHaveText('—');

  // -- Configuration-driven create-record form renders required fields --
  const firstRequiredField = page.locator('#recordForm [data-key]').first();
  await expect(firstRequiredField).toBeVisible();

  // -- Create a record through the real form and confirm it round-trips
  //    through POST /api/v1/records and back into GET /api/v1/records --
  const marker = `E2E ${Date.now()}`;
  await firstRequiredField.fill(marker);
  await page.click('#saveRecord');

  await expect(page.locator('#formError')).toHaveText('Created.');
  await expect(page.locator('#recordsBody')).toContainText(marker);
});
