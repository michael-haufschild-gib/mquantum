# PRD: Electric Arcs (WGSL Rewrite)

## Overview

**Feature**: Electric arc / plasma filament visual effect for Schroedinger rendering  
**Status**: Proposal rewrite for current codebase  
**Priority**: Medium (visual impact), optional by default  
**Performance Tier**: Medium to high depending on quality settings

This PRD replaces the legacy GLSL sketch with an implementation-ready plan for the current WebGPU + WGSL renderer.

---

## Problem Statement

The current Schroedinger renderer already supports strong volumetric and isosurface visuals (density, phase materiality, interference, nodal, cross-section, probability current), but it lacks a dedicated filamentary "electric arc" layer.  
The archived PRD is outdated and references paths that no longer exist.

Outdated references in old proposal:
- `src/rendering/shaders/.../*.glsl.ts`
- `sampler3D tPerlinNoise` texture workflow

Current architecture to target:
- `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compose.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

---

## Goals

1. Add a visually striking arc effect that can be enabled independently of core physics visuals.
2. Support both quantum families:
   - `harmonicOscillator`
   - `hydrogenND`
3. Support both rendering modes:
   - volumetric
   - isosurface
4. Work for dimensions 3-11, with explicit semantics for 4D-11D slicing.
5. Keep effect optional and tunable with strong performance guardrails.

## Non-Goals

1. This is not a physically exact electromagnetic solver.
2. This does not replace physical probability current visualization.
3. This does not introduce non-WebGPU rendering paths.

---

## User Stories

### Story 1: Cinematic arcs in volumetric mode
As a user, I want dense glowing filaments inside the cloud so the quantum object looks energetic and alive.

Acceptance criteria:
1. Enabling arcs in volumetric mode adds visible filament patterns inside high-density regions.
2. Arc density, thickness, intensity, and motion are configurable.
3. Default settings produce visible but not overpowering arcs.

### Story 2: Arc styling on isosurface mode
As a user, I want a compatible arc look in isosurface mode so I can keep a coherent artistic style when switching modes.

Acceptance criteria:
1. Isosurface mode supports arc-like emissive/crack overlay on the hit surface.
2. Arc controls are shared across modes where possible.
3. Switching modes preserves arc settings.

### Story 3: Cross-dimension consistency
As a user studying N-D states, I want the effect to behave consistently across 3D-11D.

Acceptance criteria:
1. 3D behavior is direct object-space arc evaluation.
2. 4D-11D behavior is evaluated in the current rendered 3D projection (after N-D slicing controls).
3. UI copy clarifies this to avoid pedagogical confusion.

### Story 4: Performance control
As a user on varied hardware, I want quality/performance knobs so I can keep stable FPS.

Acceptance criteria:
1. Arc quality presets exist (`fast`, `balanced`, `high`).
2. Arc feature can be disabled at runtime without pipeline errors.
3. Performance guard can reduce arc quality automatically when FPS drops.

---

## Functional Requirements

### FR-1 Feature toggle
Add arc controls to Schroedinger config:
- `arcEnabled: boolean`

> **Correction**: The original `arcMode: 'volumetric' | 'isosurface' | 'both'` is removed.
> Arcs are an emissive term injected into the active rendering path.
> Volumetric mode accumulates arcs during raymarching; isosurface mode applies them as surface overlay.
> The toggle `arcEnabled` is sufficient — each rendering path implements arcs independently.

### FR-2 Core arc parameters
Add parameters:
- `arcIntensity`
- `arcScale`
- `arcSharpness`
- `arcSparsity`
- `arcSpeed`
- `arcThickness`
- `arcColor`
- `arcColorMix` (blend with existing emission/base color)

### FR-3 Optional physically-informed couplings
Optional advanced parameters:
- `arcDensityGate` (suppress arcs in near-empty regions)
- `arcPhaseCoupling` (phase-modulated brightness)
- `arcNodeAttraction` (boost arcs near nodal structures)

### FR-4 Volumetric implementation
In volumetric path, arcs are accumulated as additional emissive term during raymarching, gated by density/transmittance to avoid wasted work.

### FR-5 Isosurface implementation
In isosurface path, arcs are applied as emissive surface overlay at/near the isosurface hit point (no fake deep interior integration in pure surface mode).

### FR-6 Mathematical model (initial)
Use procedural ridged noise (no mandatory arc texture):

> **Correction**: No WGSL noise helpers exist in the Schroedinger shader tree.
> A new noise module must be created at `src/rendering/webgpu/shaders/schroedinger/volume/noise.wgsl.ts`.
> The skybox shader has `skyboxHash()`/`skyboxNoise()`/`skyboxFbm3()` which can inform the implementation,
> but Schroedinger needs its own standalone module to avoid cross-domain coupling.

1. `n = baseNoise(pos * arcScale + time * arcSpeed)`
2. `ridged = pow(clamp(1.0 - abs(n), 0.0, 1.0), arcSharpness)`
3. `arcMask = smoothstep(arcSparsity, 1.0, ridged)`
4. `arcValue = arcMask * densityGate * optionalPhaseTerm * optionalNodeTerm`

### FR-7 Mode compatibility
Effect must operate correctly with:
- color algorithms
- nodal rendering
- interference
- phase materiality
- cross-section overlay/slice-only
- temporal reprojection

### FR-8 Dimension behavior
1. Dimensions 3-11 supported.
2. For dimensions 4-11, arc evaluation occurs in the rendered 3D slice space (same rule as current visual modes).
3. Documentation and tooltip must explicitly state this.

### FR-9 Quantum family compatibility
1. Harmonic oscillator: fully supported.
2. Hydrogen ND: fully supported.
3. No assumptions about density-grid availability for higher dimensions.

---

## Known Limitations and Constraints

1. Hydrogen ND in dimensions >3 currently does not use density-grid acceleration for raymarching; arc overhead is therefore most sensitive in this regime.
2. In isosurface mode, "internal lightning" cannot be shown as true volume integration unless user selects volumetric or hybrid mode; surface overlay is the expected behavior.
3. In 4D-11D, arcs are slice-local visual cues, not direct visualization of full N-D filament topology.

---

## Technical Design

### Shader touchpoints

Primary files:
- `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compose.ts`

### Renderer/store touchpoints

- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/lib/geometry/extended/types.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/stores/utils/presetSerialization.ts`

### UI touchpoints

- `src/components/sections/Advanced/SchroedingerAdvanced.tsx`
- Optional: `src/components/sections/Performance/*` for arc quality guard controls

### Compile-time specialization

Add compile-time feature define:
- `FEATURE_ARCS`

Rationale:
- remove branch cost when arcs disabled
- allow future variant specialization by quality tier

### Runtime optimization hooks

1. Early exit if `arcEnabled == false` or `arcIntensity <= epsilon`.
2. Evaluate expensive arc terms only when local density/transmittance passes threshold.
3. Share noise inputs across nearby branches when possible.

---

## Performance Requirements

### PR perf targets (estimation before benchmarking)

At default settings:
- Volumetric 3D HO: target <= 12% FPS impact
- Volumetric 3D Hydrogen ND: target <= 15% FPS impact
- Isosurface modes: target <= 10% FPS impact

High/cinematic settings may exceed these targets and must be clearly labeled.

### Quality tiers

1. `fast`:
   - minimal arc octaves
   - strongest gating
   - reduced animation detail
2. `balanced`:
   - default for most devices
3. `high`:
   - richer filaments and modulation
   - optional for high-tier GPUs

### Interaction with existing perf controls

Arc implementation must work with:
- temporal reprojection
- progressive refinement
- render resolution scaling
- max FPS limiter
- eigenfunction cache toggle

---

## UX / UI Requirements

Add a new `Electric Arcs` subgroup in `Advanced > Artistic`.

### Core controls (always)
1. Enable toggle
2. Intensity
4. Scale
5. Sharpness
6. Sparsity
7. Speed
8. Color

### Advanced controls (collapsible)
1. Thickness
2. Color mix
3. Density gate
4. Phase coupling
5. Node attraction
6. Quality tier
7. Performance guard threshold

### UX behavior
1. Defaults are conservative and stable.
2. Existing scenes remain visually unchanged until enabled.
3. Tooltips clearly separate artistic arcs from physical probability current.

---

## Testing Plan

### Unit/store tests
1. Default values and clamping for new arc config fields.
2. Serialization/deserialization includes arc fields.
3. Mode and quality enums reject invalid values.

### Shader composition tests
1. `FEATURE_ARCS` included/excluded correctly.
2. No invalid binding/layout changes when arcs are off.
3. Both volumetric and isosurface codepaths compile.

### Integration tests (Playwright/WebGPU smoke)
1. Toggle arcs on/off rapidly without GPU validation errors.
2. Switch between volumetric and isosurface with arcs enabled.
3. Sweep core sliders (intensity/scale/sharpness/sparsity) without instability.
4. Validate behavior in dimension 3 and one dimension >3 (for example 6D).

### Performance checks
1. Compare median FPS with arcs off vs on (`fast`, `balanced`, `high`) for:
   - HO 3D
   - Hydrogen ND 3D
   - Hydrogen ND 6D
2. Record guidance values for in-app tooltips.

---

## Rollout Plan

### Phase 1
Volumetric arcs only, core controls, conservative defaults.

### Phase 2
Isosurface arc overlay, shared controls, quality tiers.

### Phase 3
Advanced couplings (phase/node), performance guard automation, presets.

---

## Risks and Mitigations

1. **Risk**: Visual noise overwhelms scientific readability.  
   **Mitigation**: conservative defaults, pedagogical preset, quick disable.

2. **Risk**: Large FPS drop in high dimensions.  
   **Mitigation**: strong gating, tiered quality, auto guard, explicit warning labels.

3. **Risk**: Confusion with physical probability current.  
   **Mitigation**: clear naming and tooltip distinction in UI/docs.

---

## Success Criteria

1. Arcs are visually distinct and stable in both volumetric and isosurface modes.
2. Feature works for both quantum families and dimensions 3-11 (with documented 4D+ semantics).
3. Default mode keeps interactive performance on baseline hardware.
4. Users can tune from subtle educational styling to cinematic presentation without breaking render stability.

---

## Validation Notes (2026-02-07)

### File reference audit
All 10 referenced files verified to exist in the current codebase.

### Uniform capacity
`SchroedingerUniforms` struct has ~64 bytes of reserved space from removed features
(`_reservedCurl0-4`, `_reservedShadow0-2`, `_reservedAo0-2`, `_reservedAoColor`)
that can be repurposed for arc uniform fields without growing the buffer.

### Noise infrastructure
No WGSL noise functions exist in the Schroedinger shader domain.
The skybox domain has `noise.wgsl.ts` with hash/noise/fbm — these inform design but must not be imported.
A new noise module is required.

### Feature flag pattern
Compile-time `FEATURE_*` pattern is well-established:
`FEATURE_NODAL`, `FEATURE_DISPERSION`, `FEATURE_PHASE_MATERIALITY`, `FEATURE_INTERFERENCE`, etc.
`FEATURE_ARCS` fits this pattern exactly.

### Density grid constraint
Hydrogen ND >3D does not use density-grid acceleration (confirmed and enforced as of 2026-02-07 fix).
Arc gating must use inline density evaluation in these cases, matching the constraint in Known Limitations.
