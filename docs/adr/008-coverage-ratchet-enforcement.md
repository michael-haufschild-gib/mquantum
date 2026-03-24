# ADR-008: Coverage ratchet enforcement via CI script

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Project maintainer

## Context

Code coverage thresholds in `vitest.config.ts` are enforced by vitest during `--coverage` runs. However, there is no mechanism to prevent someone from lowering the thresholds in a PR to make CI pass after reducing coverage. This allows silent coverage regression.

## Decision

Add `scripts/check-coverage-ratchet.js` that:
1. Reads actual coverage from `coverage/coverage-summary.json` (produced by the `json-summary` reporter)
2. Reads configured thresholds from `vitest.config.ts`
3. Fails if any threshold is more than 1% below the actual measurement

The 1% tolerance accounts for measurement variance between runs (different test ordering, v8 coverage instrumentation variance).

CI runs the ratchet check after `vitest run --coverage`:
```yaml
- name: Test with coverage
  run: npx vitest run --coverage
- name: Coverage ratchet
  run: node scripts/check-coverage-ratchet.js
```

## Alternatives Considered

1. **No ratchet (thresholds only)**: Someone can lower thresholds. Rejected.
2. **Auto-update thresholds in CI**: Write back to the config file during CI and commit. Requires CI write access to the repo, creates noise commits. Rejected.
3. **Coverage diff on PRs**: Compare PR coverage to base branch. More precise but requires fetching and running base branch coverage, doubling CI time. Over-engineering for this project size.

## Consequences

**Positive**:
- Thresholds can only move upward (within tolerance)
- PRs that reduce coverage must explicitly justify the threshold reduction in the PR description
- Zero maintenance: the script is stateless and reads from existing artifacts

**Negative**:
- 1% tolerance means small coverage drops within tolerance pass silently
- Regex-based config parsing is fragile if the vitest.config.ts format changes significantly
