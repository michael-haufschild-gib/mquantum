# WGSL Validation (On-Demand)

**Purpose:** Validate every WGSL shader the renderer can produce — for every config combination, across every quantum mode — via `naga --bulk-validate`. Catches parser errors, unknown identifiers, bind group overflows, and WGSL-spec violations before they hit a user's browser.

## Quick start

```sh
cargo install naga-cli              # one-time — naga v29+ recommended
pnpm test:shaders:fast              # smoke run (2000 shaders, ~5s)
pnpm test:shaders                   # full run
```

## What's covered

| Surface | Enumerator | Status |
|---|---|---|
| Schrödinger analytic (HO, hydrogenND, hydrogenNDCoupled) | `enumerateSchroedingerAnalytic.ts` | ✅ Phase 1a |
| Schrödinger vertex (2D + 3D) | `enumerateSchroedingerVertex.ts` | ✅ Phase 1a |
| Schrödinger compute (FSF, TDSE, BEC, Dirac, QuantumWalk, Pauli, WdW, AdS) | `enumerateSchroedingerCompute.ts` | ✅ Phase 1b |
| ProfilingStrip (64 combos) | `enumerateProfilingStrip.ts` | ✅ Phase 1c |
| Skybox / AdS density / Wigner cache / Wigner spatial / Wigner reconstruct | `enumerateAuxiliary.ts` (`enumerateSkybox`, `enumerateAds`, `enumerateWigner`) | ✅ Phase 1d |
| Pass-level shaders (eigenfunction cache, density grid) | `enumerateAuxiliary.ts` (`enumerateDensityGridEigenCache`) | ✅ Phase 1d (partial — Class C inline-concat passes still pending Phase 2b) |
| Tint (Chrome) validation tier | `scripts/playwright/wgsl-tint-validation.spec.ts` | ✅ Phase 5 |

## Out of scope (explicit)

| Surface | Why |
|---|---|
| `overrides` parameter variants on `SchroedingerWGSLShaderConfig` | Caller-specific runtime substitutions; no finite set to enumerate. |
| Bind group layout compatibility (shader ↔ pipeline state mismatch) | naga validates shader internals only. Caught by the Phase 5 Tint tier via real `device.createShaderModule` + `getCompilationInfo()`. |
| Render target format vs shader output | Same as above — pipeline state, not shader validation. |
| Chrome-specific Tint rejections | naga ≠ Tint. See Phase 5. |

## How it works

1. Enumerator walks user-facing knobs cartesianly.
2. Each config passes through the real `applyModeOverrides` → `buildShaderConfig` → `composeSchroedingerShader` pipeline, so no shader knowledge is duplicated in the enumerator — the single source of truth is the renderer itself.
3. Dedup by `computePipelineCacheKey` (intra-enumerator) and `sha256(wgsl)` (cross-enumerator).
4. `validateWithNaga` writes each unique shader to a temp file and runs `naga --bulk-validate` in batches of 256.
5. Failures are normalized into stable signatures (paths + line numbers stripped) and grouped by `groupFailures`.
6. Formatted triage report prints top-N signatures, example labels, and example diagnostics.

Timing: 4.5s for 2000 shaders on a single naga process (2.25ms/shader amortized). Linear scale: 50k shaders ≈ 2 min. No parallelism needed at current scale.

## Env controls

| Variable | Meaning |
|---|---|
| `WGSL_VALIDATE=1` | Required to run the validation test (otherwise skipped in `pnpm test`). |
| `WGSL_SUBSET` | Comma-list ∈ {schroedinger-vertex, schroedinger-analytic, schroedinger-compute, profiling-strip, skybox, ads, wigner, passes}. Default: all surfaces. Unknown values throw. |
| `WGSL_MODE` | Restrict analytic walker: `harmonicOscillator` \| `hydrogenND` \| `hydrogenNDCoupled`. |
| `WGSL_MAX` | Cap unique shader count (for smoke runs). |
| `WGSL_MIN_UNIQUE` | Drift-guard floor. Fails if enumerator emits fewer unique shaders than this. Seed after first green run, then raise each time coverage grows. |

## Drift guard

Enumerator coverage can silently regress when a new shader flag is added but isn't wired into the walker. The test fails loudly if `uniqueShaderCount < WGSL_MIN_UNIQUE`. To raise the floor after a legitimate coverage increase, rerun with `WGSL_VALIDATE=1` and read the count from the test output, then update `WGSL_MIN_UNIQUE` in your local env or a CI config. Never lower the floor without explaining which axis was removed.

## Adding a new shader or flag

1. Add the flag to the relevant config type (`SchrodingerRendererConfig`, `SchroedingerWGSLShaderConfig`, etc).
2. Thread it through `applyModeOverrides` / `buildShaderConfig` if needed.
3. **Add it to the enumerator's walker loop** (`enumerateSchroedingerAnalytic.ts` for the analytic path). Most flags are booleans — add a `for (const v of [false, true])` loop.
4. Run `pnpm test:shaders` — new specializations should appear as new unique shaders in the count.
5. Raise `WGSL_MIN_UNIQUE` after confirming no regressions.

## Writing a new surface enumerator

Follow `enumerateSchroedingerAnalytic.ts`:

- Export a generator that yields `ShaderRecord`.
- Use `computePipelineCacheKey` (or an equivalent pure key) for intra-surface dedup.
- Hash `wgsl` with `sha256` for cross-surface dedup.
- Register in `enumerateAll.ts` under an appropriate `SurfaceName`.
- Update the coverage table above.

## Known caveats

- **naga ≠ Tint.** Chrome uses Tint; naga is what wgpu-rs/Firefox use. Shaders that pass naga may still be rejected by Chrome for reasons naga doesn't check. The Phase 5 Tint tier is the final gate before release.
- **Dead code paths may slip through.** naga only catches what it can parse + type-check. Logic errors in a shader that compiles but renders wrong require the existing e2e rendering tests.
- **Enumerator ≠ runtime coverage.** An enumerated shader is a shader the composer *can* produce. A shader the renderer *will* produce at runtime is a subset. We validate the superset deliberately — if a combination composes, it should compile, even if it's never reached.

## Known deviations

Some compute shaders emit WGSL that Dawn/Tint accepts but naga rejects as spec-noncompliant. These are tracked in `src/tests/rendering/wgsl/knownDeviations.ts` as regex patterns against the normalized naga diagnostic signature. Matching failures are counted separately as `knownDeviations` and do NOT fail the test run.

Current entries:

| Pattern | Root cause | Tracked fix |
|---|---|---|
| `The array stride 4 is not a multiple of the required alignment 16` | Scalar arrays (`array<u32, 12>`, `array<f32, 12>`) in uniform-address-space structs across TDSE/Dirac/Pauli/FSF/Observables uniforms. Tint accepts them; naga enforces the 16-byte-stride-in-uniform rule from the WGSL spec. | Switch affected bind groups from `uniform` to `read-only-storage`, or pack arrays as `vec4<u32>`. |

Workflow for adding/removing entries: see the module header on `knownDeviations.ts`.

## Related

- Pass audit: `docs/physics/wgsl-pass-audit.md`
- Renderer config: `src/rendering/webgpu/renderers/rendererConfigUtils.ts`
- Shader composer: `src/rendering/webgpu/shaders/schroedinger/compose.ts`
- Testing guide: `docs/testing.md`
