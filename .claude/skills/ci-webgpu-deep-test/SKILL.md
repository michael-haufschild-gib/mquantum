---
name: ci-webgpu-deep-test
description: Write a comprehensive Playwright e2e spec file for a single quantum mode. Tests every preset, control, field view, and feature toggle at multiple dimensions. Verifies rendering (pixel checks), visual response to setting changes (differential snapshots), and physics correctness (GPU diagnostic readback). Argument is the quantum mode to test.
argument-hint: <quantum-mode> (e.g., tdseDynamics, becDynamics, diracEquation, quantumWalk, pauliSpinor, harmonicOscillator, hydrogenND)
---

## Task

Write a Playwright e2e spec file for the quantum mode `$ARGUMENTS`. The spec must confirm that in all major configurations of this mode: no GPU/shader errors occur, something visible renders, setting changes produce visual differences, and physics diagnostics match expected invariants.

## Preparation

Before writing any code:

1. Read the Serena memory `e2e_deep_testing_strategy` for the full strategy, priority order, and physics responses table.
2. Read the reference implementation: `scripts/playwright/free-scalar-field.spec.ts` — this is the pattern to follow.
3. Read the mode's UI controls file to enumerate every user-facing control:

| Mode | Controls file |
|-|-|
| tdseDynamics | `src/components/sections/Geometry/SchroedingerControls/TDSEControls.tsx` |
| becDynamics | `src/components/sections/Geometry/SchroedingerControls/BECControls.tsx` |
| diracEquation | `src/components/sections/Geometry/SchroedingerControls/DiracControls.tsx` |
| quantumWalk | `src/components/sections/Geometry/SchroedingerControls/QuantumWalkControls.tsx` |
| pauliSpinor | `src/components/sections/Geometry/PauliSpinorControls/index.tsx` |
| harmonicOscillator | `src/components/sections/Geometry/SchroedingerControls/HarmonicOscillatorControls.tsx` |
| hydrogenND | `src/components/sections/Geometry/SchroedingerControls/HydrogenNDControls.tsx` |

4. Read the mode's presets file to get all preset IDs. Modes without a presets file (quantumWalk, harmonicOscillator, hydrogenND) use configuration variants instead (coin types, term counts, quantum numbers).

| Mode | Presets file |
|-|-|
| tdseDynamics | `src/lib/physics/tdse/presets.ts` |
| becDynamics | `src/lib/physics/bec/presets.ts` |
| diracEquation | `src/lib/physics/dirac/presets.ts` |
| pauliSpinor | `src/lib/physics/pauli/presets.ts` |
| quantumWalk | No presets — use coin types (Hadamard, Grover, DFT) as config variants |
| harmonicOscillator | No presets — use term counts (1, 2, 4, 8) and superposition seeds |
| hydrogenND | No presets — use quantum number combinations (n, l, m) |

5. Read the mode's type definitions to understand config fields and field views:

| Mode | Types |
|-|-|
| tdseDynamics | `src/lib/geometry/extended/tdse.ts` |
| becDynamics | `src/lib/geometry/extended/bec.ts` |
| diracEquation | `src/lib/geometry/extended/dirac.ts` |
| quantumWalk | `src/lib/geometry/extended/quantumWalk.ts` |
| freeScalarField | `src/lib/geometry/extended/freeScalar.ts` |

6. Read the mode's store setters to find the exact function names for store mutations:

| Mode | Setters file |
|-|-|
| tdseDynamics | `src/stores/slices/geometry/setters/tdseSetters.ts` |
| becDynamics | `src/stores/slices/geometry/setters/becSetters.ts` |
| diracEquation | `src/stores/slices/geometry/setters/diracSetters.ts` |

7. Read the existing diagnostics helper for this mode in `scripts/playwright/helpers/app-helpers.ts`. Search for `read{Mode}Diagnostics` and `apply{Mode}Preset`.
8. Read existing tests that cover this mode to avoid duplication:
   - `scripts/playwright/rendering.spec.ts` — basic "does it render" per mode
   - `scripts/playwright/physics-validation.spec.ts` — basic physics invariants
   - `scripts/playwright/rendering-differential.spec.ts` — basic differential checks
   - `scripts/playwright/physics-coverage.spec.ts` — HO/Hydrogen dimension coverage

10. Check `src/rendering/shaders/palette/types.ts` function `getAvailableColorAlgorithms` for the valid color algorithms for this mode.

## Spec File Structure

Create `scripts/playwright/{mode-kebab-case}.spec.ts` with four sections:

### Section A: Preset/Config Rendering Matrix

For each preset or major configuration variant, at dimensions that include 3D and one other (2D if supported, else 5D):

```typescript
test(`${presetLabel} ${dim}D: renders with no GPU errors`, async ({ page }) => {
  await gotoMode(page, 'theMode', dim)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  // Apply preset via store
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().applyRelevantPreset('presetId')
  })
  await waitForShaderCompilation(page)
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + 120)
  await assertPixels(page, 'label')
})
```

Use multi-screenshot pixel check (3 shots, 30-frame gaps) for modes with oscillating output. Use `minPixels: 1` for inherently faint configurations.

### Section B: Control Response — Differential Pixel Checks

For each user-facing control (Select, ToggleGroup, Switch, Slider), at 3D:

```typescript
test('changing X produces different image', async ({ page }) => {
  await gotoMode(page, 'theMode', 3)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await pauseAnimation(page)
  const before = await capturePixelSnapshot(page)

  // Apply the change via store
  await page.evaluate(async () => { /* store mutation */ })
  await waitForUniformUpdate(page)

  const after = await capturePixelSnapshot(page)
  expectSnapshotsDiffer(before, after, 'X change must produce different image')
})
```

Controls to test per mode (derive from step 3):
- **Select controls**: presets, initial conditions, potentials
- **ToggleGroup controls**: field views, representations
- **Switch controls**: absorber, diagnostics, imaginary time, auto-scale
- **Slider controls**: pick 1-2 sliders that directly affect the rendered field (packet width, interaction strength, mass) — not UI-only controls (diagnostics interval, slice position)

### Section C: Physics Validation via Diagnostics

Enable diagnostics, run simulation, read GPU-computed scalars, assert invariants and directional responses.

Three assertion types:
- **Invariant**: holds regardless of config. Example: `normDrift < 2%`, `totalEnergy > 0`, `particle + antiparticle ≈ 1`
- **Directional**: when parameter changes, observable moves predictably. Example: thicker barrier → lower transmission
- **Exact**: analytical result known. Example: HO ground state at center has known density

Use the diagnostics readback helpers already in `app-helpers.ts`:
- `readTdseDiagnostics(page)` → `{ hasData, totalNorm, normDrift, R, T, maxDensity }`
- `readBecDiagnostics(page)` → `{ hasData, totalNorm, normDrift, chemicalPotential, healingLength, soundSpeed }`
- `readDiracDiagnostics(page)` → `{ hasData, totalNorm, normDrift, particleFraction, antiparticleFraction, maxDensity }`
- `readPauliDiagnostics(page)` → `{ hasData, totalNorm, normDrift, spinUpFraction, spinDownFraction, spinExpectationZ }`
- `readFsfDiagnostics(page)` → `{ hasData, totalEnergy, totalNorm, energyDrift, maxPhi }`
- `readDensityDiagnostics(page)` → `{ hasData, maxDensity, totalDensityMass, activeVoxelCount, centerDensity }`

Apply presets via helpers already in `app-helpers.ts`:
- `applyTdsePreset(page, 'presetId')`
- `applyBecPreset(page, 'presetId')`
- `applyDiracPreset(page, 'presetId')`
- `applyPauliPreset(page, 'presetId')`

Pattern:
```typescript
test('physics invariant: description', async ({ page }) => {
  await gotoMode(page, 'theMode', 3)
  await waitForShaderCompilation(page)
  // Enable diagnostics if needed
  await waitForDiagnostics(page, '/src/stores/relevantDiagnosticsStore.ts')
  await waitForSimulationFrames(page, 200)
  const diag = await readRelevantDiagnostics(page)
  expect(diag.hasData).toBe(true)
  expect(diag.someInvariant).toSatisfyCondition()
})
```

### Section D: Feature Toggles and Edge Cases

- Isosurface mode on/off (3D+): verify no GPU errors, pixels visible
- Absorber/PML on/off: verify rendering continues
- Dimension switching within the mode: navigate dim A → dim B, verify recovery
- Animation: frame count advances, diagnostics change between snapshots

## Store Mutation Pattern

All setting changes use `page.evaluate` with dynamic imports:

```typescript
await page.evaluate(async () => {
  const mod = await import('/src/stores/extendedObjectStore.ts')
  mod.useExtendedObjectStore.getState().setterFunctionName(value)
})
```

For color algorithm changes:
```typescript
await page.evaluate(async () => {
  const mod = await import('/src/stores/appearanceStore.ts')
  mod.useAppearanceStore.setState({ colorAlgorithm: 'algorithmName' })
})
```

For isosurface:
```typescript
await page.evaluate(async () => {
  const mod = await import('/src/stores/extendedObjectStore.ts')
  mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
})
```

## Constraints

- Import `{ test, expect }` from `'./fixtures'` — never from `'@playwright/test'`. The fixture auto-collects GPU/shader errors and fails the test automatically if any are detected.
- Import helpers from `'./helpers/app-helpers'`.
- `test.setTimeout(600_000)` at top of file.
- **Pauli spinor** uses `objectType: 'pauliSpinor'` — navigate with `gotoPauli(page, dim)` instead of `gotoMode()`. All other modes use `gotoMode(page, 'modeName', dim)`.
- Do NOT duplicate tests already in `rendering.spec.ts`, `physics-validation.spec.ts`, or `rendering-differential.spec.ts`. Check what exists first (step 8). Add only per-CONTROL response tests and mode-specific coverage gaps.
- For compute modes (TDSE, BEC, Dirac, FSF, QW): wait 120+ frames after config changes for density grids to populate.
- For analytical modes (HO, Hydrogen): `waitForShaderCompilation` is sufficient. These modes have no mode-specific diagnostics store — use `readDensityDiagnostics` for grid-level checks.
- Use `pauseAnimation(page)` before differential snapshot pairs to eliminate animation-induced differences.
- `test.describe.configure({ mode: 'serial' })` is NOT needed — each test navigates fresh.
- Target 15-25 tests per spec file. Under 15 means coverage gaps. Over 30 means split the file.

## Pixel Check Helpers

```typescript
// Multi-screenshot for oscillating modes (FSF, some TDSE):
async function modePixelCheck(page: Page, minPixels = 5) {
  let bestCount = 0
  for (let i = 0; i < 3; i++) {
    const { nonBgPixels } = await captureAndSamplePixels(page)
    bestCount = Math.max(bestCount, nonBgPixels)
    if (bestCount >= minPixels) return { pass: true, bestCount }
    if (i < 2) {
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 30)
    }
  }
  return { pass: bestCount >= minPixels, bestCount }
}
```

For inherently faint configs (vacuum states, high-D slices): use `minPixels: 1`.
For most configs: use `minPixels: 5` (default).

## After Writing

1. Run the new spec: `pnpm exec playwright test scripts/playwright/{file}.spec.ts --workers=1`
2. Expect 10-30% of tests to fail on first run. Debug each failure by category:
   - **Timing**: output is faint or async pipeline needs more frames → increase frame wait or lower `minPixels`
   - **Physically blank**: a config combination produces correct-but-empty output (like kSpaceOccupation + vacuum) → gate the combination in the UI or skip the pixel assertion
   - **Real bug**: GPU error, shader compilation failure, blank output where something should render → keep the test, report the finding
3. If a test reveals a real rendering bug, keep the test failing and report it — do not weaken assertions to make it pass.
4. Run lint: `pnpm exec eslint scripts/playwright/{file}.spec.ts --max-warnings 0 --no-warn-ignored`

## Output

The spec file at `scripts/playwright/{mode-kebab-case}.spec.ts` and a summary of:
- How many tests were written
- How many pass/fail
- Any real rendering bugs discovered

Import `{ test, expect }` from `'./fixtures'` — never from `'@playwright/test'`.
