## Active Target

- Feature: Open Quantum diagnostics data flow
- Scope path: `src/stores/openQuantumDiagnosticsStore.ts`
- Purpose: validate that Open Quantum metrics are buffered, exposed, and consumed correctly for diagnostics UI without regressions.

## Task Queue Details

- Checkpoint from previous target (`src/components/layout/TimelineControls`):
  - Fixed two Open Quantum issues:
    1. Timeline panel visibility for paused state.
    2. State-only reset semantics via reset token (no parameter wipe).
  - Verified with targeted tests/lint.

- [in_progress] Understand purpose of Open Quantum diagnostics data-flow feature
- [pending] Analyze `src/stores/openQuantumDiagnosticsStore.ts`
- [pending] Trace diagnostics flow: renderer `computeMetrics` -> diagnostics store -> `OpenQuantumDiagnosticsSection`
- [pending] Evaluate Open Quantum diagnostics behavior against intended metrics UX

## Issues Found

- None yet in current target.

## Issues Fixed

- Previous target fixes completed (timeline pause/resume/reset semantics).

## Deferred for Developer

- None yet in current target.

