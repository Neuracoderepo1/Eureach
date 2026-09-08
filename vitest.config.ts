import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/security.test.mjs uses Node's built-in `node:test` runner
    // (invoked separately via `npm run test:security`), not Vitest.
    // Without this exclusion, `vitest run` picks the file up via its
    // default glob, finds no Vitest suite in it, and reports a false
    // "Failed Suites" error even though the file's own tests pass fine
    // under `node --test`.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/security.test.mjs", "tests/rls-isolation.test.mjs"]
  }
});
