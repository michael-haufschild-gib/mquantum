# Refactoring Backlog (deferred from PR `dev` 2026-04-28)

This file enumerates the items that were *researched* in the dev session of
2026-04-28 but explicitly *not implemented* — each is a multi-hour effort that
should land as its own PR with golden coverage in place first.

## Item 6 — Raise branch coverage in physics/store/render

**Current state**: ratchet at `branches: 63` in `vitest.config.ts`. No
mechanism issue — the ratchet works; the work is writing more tests.

**Approach for next session**:
1. `pnpm exec vitest run --coverage` to produce `coverage/coverage-summary.json`.
2. Sort by uncovered branch ratio; pick the worst 10 source files in
   `src/lib/physics/`, `src/stores/`, `src/rendering/webgpu/passes/` (excluded
   files are documented in `vitest.config.ts`).
3. For each, add unit tests targeting the uncovered conditional branches.
   Prefer property-based tests (`fast-check`) over enumerated cases for
   physics modules.
4. Bump the ratchet only after each test lands so CI cannot drift backward.

**Why deferred**: 50+ uncovered branches across the worst offenders; doing
this in the same session as larger refactors risks shipping shallow
tests that pad coverage without catching bugs (a regression we explicitly
ban — see `src/.claude/rules/testing.md` "no trivial assertions" + memory
`feedback_test_quality.md`).

## Item 7 — Re-enable complexity limits

**Status (2026-05-01)**: Done for stores / components / hooks. Ratchet
plan documented; physics + rendering deliberately exempted.

**What landed**:
- `max-lines-per-function: 200` (default), 800 for stores / components /
  hooks (today's ceiling), off for physics / rendering / tests / playwright.
- `max-statements: 80` default, 120 for stores / components / hooks.
- `max-nested-callbacks: 4` default, 6 for stores / components / hooks.
- `complexity` (cyclomatic) intentionally `'off'` in favour of
  `sonarjs/cognitive-complexity: 15`, which weights nesting + control-flow
  rather than counting branches.

**Ratchet plan**: lower the per-path thresholds in `eslint.config.js` as
long-function offenders get split. Each step down should be paired with a
PR that splits the specific function(s) it makes pass.

**Rust** (deferred): the `animation.rs` split (Item 8) lands first; once
the file is under 1000 lines per module, add `clippy::cognitive_complexity`
to `lib.rs` `#![warn(...)]`.

## Item 8 — Split oversized files

**Targets** (files > 500 lines that hold non-trivial logic, not just
constants/data):

| File | Lines | Recommended split |
|------|-------|-------------------|
| `src/wasm/mdimension_core/src/animation.rs` | 5533 | One module per rotation algorithm: `bivector.rs`, `givens.rs`, `interpolation.rs`, `composition.rs`. The current file mixes all four concerns. |
| `src/lib/physics/wheelerDeWitt/solver.ts` | 1100 | Extract: types → `solverTypes.ts`; band classification → `bandClassification.ts`; per-column WKB state → `columnWkbState.ts`. The main `solveWheelerDeWitt` body stays as the orchestrator. |
| `src/lib/wasm/animation-wasm.ts` | 934 | One per WASM-call category — already partially organized; extract by header comment. |
| `src/lib/url/state-serializer.ts` | 922 | Per-mode params: `serializers/wdw.ts`, `serializers/ads.ts`, `serializers/srmt.ts`, etc. The cross-mode dispatch stays in the main file. |
| `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts` | 886 | Already split via the *Buffers/*Setup pattern; this file is the orchestrator and may not need further split. |
| `src/lib/physics/cosmology/lqcBounce.ts` | 876 | Verify against existing tests; split into `lqcModel.ts` (physics) + `lqcBounce.ts` (driver). |
| `src/rendering/webgpu/passes/PauliComputePass.ts` | 854 | Same Buffers/Setup pattern as TDSE; move bind-group creation to `PauliComputePassBindGroups.ts`. |
| `src/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms.ts` | 847 | Per-mode uniform packers → `uniforms/{mode}.ts`. |
| `src/rendering/webgpu/passes/DiracComputePass.ts` | 821 | Same Buffers/Setup pattern as TDSE. |
| `src/lib/physics/srmt/sweepDriver.ts` | 801 | Extract per-kind handlers into `sweepDrivers/{kind}.ts`. |

**Why deferred**: each split risks introducing subtle physics regressions
unless backed by golden output tests. `solver.ts` HAS solid coverage
(`src/tests/lib/physics/wheelerDeWitt/solver.test.ts` and 9 sibling tests)
so it is the highest-confidence candidate to start with. `animation.rs` has
~1030 physics-test coverage but needs a reference-output corpus before
anyone touches the rotation algorithms.

**Process for each split**:
1. Save reference output: `pnpm exec vitest run <relevant-tests>` baseline.
2. Start with types/enums extraction (zero-risk).
3. Then move pure helpers (low-risk; covered by their own tests).
4. Leave orchestrator-helper extraction for last (medium-risk; verify reference output).
5. Re-run the full suite and compare numerically — `0` diffs allowed unless
   explicitly justified in the PR description.

## What was completed in the same session

For the audit trail of what *was* done:

- Lint fix `schrodingerFrameUpdate.test.ts:27`
- 7 of 8 circular dependencies broken via type-extraction; CI gate hardened
  to fail on any non-allowlisted cycle
- 16 skip-on-missing-diagnostic patterns converted to fail-fast assertions
  across 4 Playwright specs (`physics-curved-space`, `tdse-curved-space`,
  `monitoring-transition`, `csl-symmetry-debug`)
- 5 of 25 `waitForTimeout` synchronization waits converted to predicate
  helpers (`waitForDiagnostics`, `waitForSimulationFrames`)
- `computePassUtils.ts` un-excluded from coverage by extracting GPU
  texture creators to a sibling `computePassTextures.ts`
- `localStorage` silent-fail catches in `performanceStore.ts` (6) and
  `useColorPickerState.ts` (1) replaced with throttled `logger.warn`
  diagnostics
- Pull-request-triggered `pnpm audit --prod` workflow added
  (`security-audit.yml` `pull_request` trigger on `package.json` /
  `pnpm-lock.yaml` changes)
- Physics validation framework: `docs/physics/validation/` directory with
  README (ownership + gap backlog), worked example
  (`reference-data/hydrogen-nist-energies.json` + matching reference-data
  oracle test in `src/tests/lib/physics/hydrogenNistReferenceData.test.ts`)
