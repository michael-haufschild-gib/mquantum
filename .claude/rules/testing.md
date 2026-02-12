---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "tests/**/*"
---

# Testing Rules

## Test Infrastructure

| Tool | Purpose |
|------|---------|
| `vitest` | Unit test runner |
| `happy-dom` | DOM implementation for component tests |
| Playwright | E2E tests with actual GPU rendering |

## Commands

```bash
npx vitest run              # Run all unit tests (no watch mode)
npx vitest run src/path     # Run specific test file/directory
npx playwright test         # Run E2E tests
```

## Constraints

| Rule | Rationale |
|------|-----------|
| Max 4 parallel workers | Prevent memory exhaustion |
| No watch mode in automation | Hangs CI and subagent processes |
| Deterministic seeds for randomization | Reproducible test results |
| No trivial assertions | Tests must detect real bugs — not existence checks or default value assertions |

## Test Quality Gate

Before claiming tests pass:
- [ ] Actually ran the tests (do not assume)
- [ ] All tests pass (no skipped failures)
- [ ] New tests would fail if the code under test were broken
- [ ] No flaky timing dependencies (use deterministic approaches)
