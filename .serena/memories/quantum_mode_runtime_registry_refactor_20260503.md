# Quantum mode runtime registry refactor (2026-05-03)

Added central runtime metadata to `QUANTUM_TYPE_REGISTRY` for quantum mode taxonomy:
- `runtime.dataPath`: `analyticWavefunction | densityGrid | spinorGrid`
- `runtime.strategy`: renderer strategy family (`analytic`, `tdseBec`, `freeScalarField`, etc.)
- `runtime.shaderUniformId`: WGSL `uniforms.quantumMode` ID. Separate from save IDs.
- `runtime.stateSaveId`: append-only `.mqstate` binary serialization ID. Legacy IDs 0..7 preserved; new IDs: `hydrogenNDCoupled=8`, `wheelerDeWitt=9`, `antiDeSitter=10`.
- `runtime.uniformComputeGrid`: true only for FSF/TDSE/BEC/Dirac/QW. WdW and AdS are compute strategies but not uniform-compute grid modes.
- default color, analytic family, sample-space rotation, and precomputed-normal traits.

Migrated call sites:
- Renderer `QUANTUM_MODE_MAP` derives from registry shader IDs.
- Strategy factory derives from registry strategy kind while preserving Pauli override.
- Renderer shader config uses registry traits for hydrogen family, FSF, QW, AdS, precomputed normals, sample rotation.
- Frame update uses registry uniform-compute trait.
- Scene pass config uses registry compute classification and default color fallback.
- `.mqstate` serialization/deserialization derives mode IDs from registry and now round-trips hydrogenNDCoupled/WdW/AdS.
- Simulation state load derives mode subconfig key from registry.
- Store transition tests derive Schroedinger modes and compute modes from registry.

Verified: `pnpm run lint`, `pnpm test` (583 files, 9294 passed, 2 skipped), `pnpm run build:web`, `pnpm exec tsc --noEmit --pretty false`, touched-file Prettier check, `git diff --check`.

Deliberately not migrated in this pass: palette availability profiles, export reset side effects, first-preset application dispatch, WebGPUScene compile-context extraction, and WGSL shader composition branches. These encode side effects or physics/shader semantics and should be separate follow-up tranches.