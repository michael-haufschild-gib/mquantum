# Quantum mode runtime traits continuation (2026-05-03)

Continuation after central runtime registry refactor. Added explicit registry traits for mode behavior that was still duplicated in renderer/export wiring:

- `QuantumTypeEvolutionResetKind` and `runtime.evolutionReset` for every `QUANTUM_TYPE_REGISTRY` entry.
- `QuantumTypeCompileContextField` and `runtime.compileContextFields` for mode-specific compile selector fields.
- `runtime.supportsOpenQuantum` for open-quantum capability; deliberately explicit, not derived from analytic category.
- Helpers: `getQuantumTypeEvolutionResetKind`, `supportsOpenQuantumForQuantumType`, `getQuantumTypeCompileContextFields`, `quantumTypeHasCompileContextField`.

Migrated call sites:
- `src/rendering/webgpu/useExportRuntime.ts`: `resetWaveEvolution` now resolves object/mode through registry and dispatches via reset-kind handler table instead of switching on all modes.
- `src/rendering/webgpu/WebGPUScene.ts`: open-quantum support and Dirac/free-scalar compile context now come from registry traits instead of hard-coded mode literals.

Tests added/updated:
- `src/tests/lib/geometry/registry/quantumTypes.test.ts`: truth tables for reset kind, open-quantum support, compile-context fields.
- `src/tests/rendering/webgpu/WebGPUScene.exportRuntime.test.ts`: direct resetWaveEvolution behavior tests for analytic modes, every compute mode reset flag, and Pauli object type.

Verification:
- focused Vitest: registry + export runtime + WebGPUScene temporal tests passed (49 tests).
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm run lint` passed.
- touched-file Prettier check passed.
- `git diff --check` passed.
- full `pnpm test` passed: 583 files passed, 1 skipped; 9311 tests passed, 2 skipped.
- `pnpm run build:web` passed; existing Vite warnings about manual chunk cycles/dynamic imports/chunk sizes remained, build budgets passed.

Subagents:
- WebGPUScene explorer completed and recommended explicit traits rather than deriving from category/strategy.
- Reset explorer timed out and was closed; local direct behavior tests cover the migrated reset surface.

Still deliberately not migrated: palette availability profiles, first-preset application dispatch, data export payload builder table, and WGSL shader composition branches.