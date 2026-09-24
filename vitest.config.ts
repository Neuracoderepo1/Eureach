import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/security.test.mjs and tests/authorization-matrix.test.mjs use
    // Node's built-in `node:test` runner (invoked separately via
    // `npm run test:security` / `npm run test:authz`), not Vitest.
    // tests/e2e/** are Playwright specs (invoked via `npm run test:e2e`),
    // not Vitest either. Without these exclusions, `vitest run` picks
    // the files up via its default glob, finds no Vitest suite in them,
    // and reports a false "Failed Suites" error even though each file's
    // own tests pass fine under its actual runner.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/security.test.mjs",
      "tests/rls-isolation.test.mjs",
      "tests/authorization-matrix.test.mjs",
      "tests/e2e/**"
    ]
  }
});
