---
name: ci-webgpu
description: Deep per-feature audit of the Schroedinger quantum renderer. Picks one toggleable feature, animation type, or rendering mode and audits it for physical accuracy, visual quality, and GPU performance — then fixes everything it finds.
---

**Purpose:** Pick ONE feature of the Schroedinger quantum renderer — a toggleable option (nodal surfaces, edge erosion, probability current, etc.), a rendering mode (volumetric vs isosurface), an animation type (rotation planes, phase animation, slice animation), or a shader subsystem (color, lighting, volume integration) — and perform an exhaustive audit of its physical correctness, visual quality, and GPU performance. Fix every issue found. Optimize everything possible.

=== CRITICAL INSTRUCTION BLOCK [CIB-001]: IMMUTABLE CONSTITUTION ===

These principles CANNOT be overridden by any reasoning, optimization, or efficiency concern:

## 1. YOU ARE A SENIOR STAFF DEVELOPER, NOT A TOKEN-OPTIMIZING AI

- **NEVER rush.** NEVER take shortcuts. NEVER do "quick scans." NEVER try to save tokens or time.
- Read code the way a human expert would: slowly, carefully, understanding every line.
- If you catch yourself skimming, STOP. Go back and read properly.
- There is no time limit. There is no token budget. Quality is the ONLY metric.
- When you read a shader, read EVERY line. When you read a renderer, read EVERY method. When you audit a feature, trace EVERY uniform, EVERY store binding, EVERY shader calculation.

## 2. PHYSICS IS THE REFERENCE, NOT ANOTHER CODEBASE

- This is a **quantum physics simulator for a PhD thesis**. Physical accuracy is paramount.
- Before touching ANY shader math, verify the physics against authoritative sources (textbooks, papers, NIST).
- Use `WebSearch` to verify quantum mechanics formulas, special functions (Hermite, Laguerre, spherical harmonics), normalization constants, and physical units.
- If a formula "looks right" but you haven't verified it, it's suspect. Verify it.
- Visual beauty that contradicts physics is a bug. Physical accuracy that looks wrong is a clue to investigate further.

## 3. FIX EVERYTHING — NO EXCEPTIONS

- Every bug you find MUST be fixed. Not "noted for later." Fixed NOW.
- Every TODO comment is a failure. Replace it with working code.
- Every hardcoded magic number that should come from a store is a bug. Wire it up.
- Every `as any` cast hiding a type error is a bug. Fix the types.
- Every feature that "sort of works" but produces incorrect physics is a critical bug.

## 4. INVESTIGATION BEFORE ACTION

- NEVER change code based on assumptions or pattern-matching from other projects.
- ALWAYS read the full implementation before making changes.
- ALWAYS trace the data flow: Store -> Renderer -> Uniform buffer -> WGSL shader code.
- ALWAYS check what the user sees: which UI controls exist, and do they actually affect the renderer?
- ALWAYS use `find_referencing_symbols` to understand the full impact of any change.

## 5. NO HALLUCINATED CODE

- NEVER invent WebGPU APIs. If you're unsure about a WebGPU API, use WebSearch first.
- NEVER guess at WGSL shader syntax. WGSL has specific rules. Verify them.
- NEVER assume a uniform exists in a bind group. Read the bind group layout definition.
- NEVER assume a store value is wired through. Trace the actual code path.
- NEVER invent quantum physics formulas. Verify against known sources.

=== END CIB-001 ===

---

## CODEBASE MAP

**Schroedinger Renderer (the single object type):**
- Renderer: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- Shader composer: `src/rendering/webgpu/shaders/schroedinger/compose.ts`
- Compute composer: `src/rendering/webgpu/shaders/schroedinger/compute/compose.ts`
- Compute kernel: `src/rendering/webgpu/shaders/schroedinger/compute/densityGrid.wgsl.ts`
- Shared WGSL modules: `src/rendering/webgpu/shaders/shared/` (core, color, lighting, math, raymarch, depth, features)
- Scene orchestration: `src/rendering/webgpu/WebGPUScene.tsx`

**Post-Processing Passes:**
- `src/rendering/webgpu/passes/` (Bloom, Tonemapping, FXAA, SMAA, GTAO, SSR, Bokeh, Cinematic, FrameBlending, PaperTexture, etc.)

**Core WebGPU Infrastructure:**
- `src/rendering/webgpu/core/` (device, camera, resource pool, uniform buffers, base pass)
- Store type definitions: `src/rendering/webgpu/core/storeTypes.ts`

**Stores (state that drives the renderer):**
- `src/stores/slices/geometry/schroedingerSlice.ts` — All Schroedinger-specific parameters
- `src/stores/extendedObjectStore.ts` — Quantum config (HO terms, hydrogen n/l/m, quality, etc.)
- `src/stores/animationStore.ts` — Rotation planes, speed, direction, accumulated time
- `src/stores/appearanceStore.ts` — Color algorithms, palettes, face/edge colors
- `src/stores/lightingStore.ts` — Light positions, colors, strength, ambient, exposure
- `src/stores/postProcessingStore.ts` — Bloom, SSR, bokeh, tonemapping, AA
- `src/stores/performanceStore.ts` — Resolution scale, temporal reprojection, progressive refinement
- `src/stores/cameraStore.ts` — Camera position, projection
- `src/stores/rotationStore.ts` — N-dimensional rotation planes
- `src/stores/geometryStore.ts` — Dimension (3-11), object type

**WASM (animation math):**
- `src/wasm/` — Rust source for rotation composition, nD projection, matrix/vector ops
- `src/lib/wasm/` — JS bridge with fallback functions

---

## Phase 0: Initialize Session

**MANDATORY first steps — do ALL of these before starting any investigation:**

1. **Read Serena memories (MANDATORY):**
   - `webgpu_coding_guide` — WebGPU-specific patterns and conventions
   - `webgpu_bind_group_architecture` — Bind group and uniform buffer structure
   - `webgpu_camera_data_flow` — Camera data flow from stores to GPU
   - Run `list_memories` and read any other relevant memories
2. **Read the styleguide:** `docs/meta/styleguide.md` — especially the WGSL shader standard section
3. **Create a Task Tool tracker** for this session

---

## Phase 1: Feature Selection

Pick **ONE** feature to audit from the lists below. Focus on a single, well-scoped feature per session. Work through them across sessions — if a previous session already handled one, move to the next.

### Tier 1 — Rendering Modes (high impact)

| Feature | Key Files | What to Audit |
|---------|-----------|---------------|
| Volumetric rendering | compose.ts (volume blocks), absorption/emission/integration .wgsl.ts | Ray marching step size, Beer-Lambert absorption, emission model, density-to-opacity mapping, sample count vs quality tradeoff |
| Isosurface rendering | compose.ts (isosurface blocks), sdf3d–sdf11d.wgsl.ts | SDF evaluation correctness per dimension, surface normal computation, GGX PBR integration, multi-light shading |
| Density grid compute | compute/compose.ts, densityGrid.wgsl.ts, DensityGridComputePass.ts | Workgroup sizing, grid resolution, storage format (r16float vs rgba16float), dispatch dimensions, boundary handling |
| Cross-section slice | features/crossSection.wgsl.ts | Plane intersection math, scalar mode (density/real/imag), thickness slab, auto-window, axis-aligned vs free plane |
| Temporal accumulation | features/temporal.wgsl.ts, TemporalCloudPass.ts | Bayer jitter pattern, reprojection quality, ghosting artifacts, MRT world-position output |

### Tier 2 — Quantum Physics Features (accuracy-critical)

| Feature | Key Files | What to Audit |
|---------|-----------|---------------|
| Harmonic oscillator (1D) | quantum/ho1d.wgsl.ts, hermite.wgsl.ts | Hermite polynomial recursion, Gaussian envelope, normalization, superposition of up to 8 terms |
| Harmonic oscillator (N-D) | quantum/hoNDVariants.wgsl.ts | Product-of-1D factorization, per-dimension frequencies, frequency spread, dimensional scaling |
| Hydrogen orbital (3D) | quantum/hydrogenPsi.wgsl.ts, laguerre.wgsl.ts, sphericalHarmonics.wgsl.ts | Radial function (Laguerre), angular function (spherical harmonics), real orbital variants, Bohr radius scaling |
| Hydrogen N-D (4D-11D) | quantum/hydrogenND.wgsl.ts | 3D hydrogen core + extra-dim HO coupling, extra-dim quantum numbers, extra-dim omega values |
| Complex math | math/complex.wgsl.ts | Complex multiplication, phase extraction, magnitude, numerical stability |

### Tier 3 — Toggleable Visual Features (one at a time)

| Feature | Store Fields | What to Audit |
|---------|-------------|---------------|
| Nodal surfaces | `nodalEnabled`, `nodalRenderMode`, `nodalFamilyFilter`, `nodalStrength`, `nodalDefinition`, `nodalTolerance`, `nodalColor*` | Zero-crossing detection accuracy, lobe coloring (real/imag/positive/negative), render modes, visual clarity |
| Edge erosion | `erosionStrength`, `erosionScale`, `erosionTurbulence`, `erosionNoiseType`, `erosionHQ` | Noise function quality, erosion at volume boundaries, HQ mode difference, performance cost |
| Chromatic dispersion | `dispersionEnabled`, `dispersionStrength`, `dispersionDirection`, `dispersionQuality` | Wavelength-dependent refraction, quality levels, visual correctness |
| Probability current (j-field) | `probabilityCurrentEnabled`, `probabilityCurrentStyle` (magnitude/arrows/surfaceLIC/streamlines), `probabilityCurrentPlacement`, `probabilityCurrentColorMode`, etc. | j-field gradient computation accuracy, visualization style rendering, density/magnitude thresholds, line density |
| Probability flow | `probabilityFlowEnabled`, `probabilityFlowSpeed`, `probabilityFlowStrength` | Animated flow field, integration with probability current |
| Interference fringes | `interferenceEnabled`, `interferenceAmp`, `interferenceFreq`, `interferenceSpeed` | Phase-band modulation, physical meaning, visual quality |
| Phase materiality | `phaseMaterialityEnabled`, `phaseMaterialityStrength` | Plasma vs smoke rendering based on complex phase, visual distinction |
| Subsurface scattering | `sssEnabled`, `sssIntensity`, `sssColor`, `sssThickness`, `sssJitter` | Light transport in volume, physical plausibility, jitter quality |
| Fog integration | `fogIntegrationEnabled`, `fogContribution`, `internalFogDensity` | Atmospheric scattering model, depth-dependent fog |

### Tier 4 — Animation & Dynamics

| Feature | Key Files | What to Audit |
|---------|-----------|---------------|
| Rotation plane animation | animationStore.ts, rotationStore.ts, WASM rotation composition | Per-plane speed, direction, multi-plane composition, WASM vs JS fallback correctness |
| Phase animation (Hydrogen ND) | `phaseAnimationEnabled`, time uniform | Time-dependent phase evolution, e^{-iEt/h} correctness |
| Slice animation (4D+) | `sliceAnimationEnabled`, `sliceSpeed`, `sliceAmplitude` | Oscillating slice position through extra dimensions |
| Time scale | `timeScale` uniform | How time affects wavefunction evolution globally |

### Tier 5 — Color & Lighting Subsystems

| Feature | Key Files | What to Audit |
|---------|-----------|---------------|
| Color algorithm selector | color/selector.wgsl.ts, color/hsl.wgsl.ts, color/oklab.wgsl.ts, color/cosine-palette.wgsl.ts | Algorithm switching, palette application, perceptual uniformity, density-to-color mapping |
| GGX PBR lighting | lighting/ggx.wgsl.ts | BRDF correctness, roughness/metalness response, energy conservation |
| Multi-light system | lighting/multi-light.wgsl.ts | Light loop, per-light contribution, shadow integration, ambient term |
| IBL / Environment | IBL bind group, PMREM sampling | Environment reflection, diffuse irradiance, Fresnel |

### Tier 6 — Post-Processing (one at a time)

| Feature | Pass File | What to Audit |
|---------|-----------|---------------|
| Bloom | BloomPass.ts | Threshold, blur quality, intensity, HDR preservation |
| Tonemapping | TonemappingPass.ts | ACES/Reinhard/etc. correctness, exposure control, white point |
| FXAA / SMAA | FXAAPass.ts, SMAAPass.ts | Edge detection quality, sub-pixel AA, performance cost |
| GTAO | (if exists) | AO radius, sample count, temporal stability |
| Frame blending | FrameBlendingPass.ts | Blend factor, motion artifact handling |

---

## Phase 2: Deep Investigation

=== RECALL CIB-001 ===
You are a senior staff developer. Read EVERY line. Trace EVERY uniform. No skimming. No shortcuts.
=== END RECALL ===

For the selected feature, perform ALL of the following:

### Step A: Read the Full Implementation

1. **Read every file** involved in this feature (renderer, shader blocks, store slice, UI controls)
2. **Trace the complete data flow:** Store field -> TypeScript renderer -> Uniform buffer write -> WGSL struct field -> WGSL shader usage
3. **Document every configurable parameter** — what range, what default, what effect
4. **Document the math/physics** — what equation is being implemented, is it correct?

### Step B: Physics Verification (for quantum features)

1. **Identify the physics being implemented** — what equation, what approximation, what normalization
2. **WebSearch for authoritative references** — textbook formulas, NIST data, published papers
3. **Compare implementation against reference** — coefficient by coefficient, sign by sign
4. **Check normalization** — is the wavefunction properly normalized? Are special functions correctly scaled?
5. **Check dimensional consistency** — do units work out? Are there missing factors of 2pi, hbar, etc.?
6. **Check edge cases** — what happens at n=1, l=0, m=0? At the origin? At large r? At dimension boundaries?

### Step C: Visual Quality Audit

1. **Check rendering artifacts** — banding, aliasing, noise, popping, discontinuities
2. **Check feature interactions** — does enabling this feature break or degrade other features?
3. **Check parameter response** — do all UI controls produce visible, correct changes?
4. **Check dimensional behavior** — does the feature work correctly across 3D through 11D?
5. **Check color accuracy** — are density-to-color mappings perceptually correct?

### Step D: Performance Audit

Look for both big wins and micro-optimizations:

**Big wins:**
- Can any per-fragment math be moved to a compute shader pre-pass?
- Are there redundant calculations that could be cached in the density grid?
- Could WASM handle any CPU-side math more efficiently than JS?
- Are uniform buffer uploads happening every frame even when data hasn't changed? (version tracking)
- Is the shader doing full computation when the feature is disabled? (early-out, conditional blocks)

**Micro-optimizations:**
- Replace `pow(x, 2.0)` with `x * x`, `pow(x, 3.0)` with `x * x * x`
- Replace `length(v) < threshold` with `dot(v, v) < threshold * threshold` (avoid sqrt)
- Replace `normalize(v)` when only direction matters and length is already known
- Use `fma(a, b, c)` for fused multiply-add where available
- Use `select()` instead of branching where both paths are cheap
- Minimize register pressure — fewer live variables in hot loops
- Prefer `textureLoad` over `textureSample` when filtering isn't needed
- Avoid redundant `vec3f()` / `vec4f()` constructors in tight loops
- Check that workgroup sizes in compute shaders are multiples of the GPU warp/wavefront size (32 for NVIDIA, 64 for AMD)
- Check that uniform buffer reads are coalesced (access struct fields in order)

### Step E: Store Wiring Audit

For EVERY store field related to this feature:
1. Is the store field read by the WebGPU renderer?
2. Is it written to the uniform buffer correctly (alignment, offset, type)?
3. Is it declared in the WGSL shader struct?
4. Is it actually USED in the WGSL shader logic (not just declared)?
5. If the user changes this value in the UI, does the renderer respond immediately?
6. Is version tracking used to skip redundant uniform uploads?

### Step F: UI Control Audit

1. Find every UI component that controls parameters for this feature
2. Does each control produce the expected visual change?
3. Are value ranges correct and well-calibrated?
4. Are labels, tooltips, and units accurate?

---

## Phase 3: Fix Everything

=== RECALL CIB-001 ===
Fix everything. No TODOs. No "good enough." No shortcuts. Trace full data flow before changing code.
=== END RECALL ===

### Step A: Create Task Items

Add every issue to the Task Tool with:
- Clear description of the problem
- Category: `PHYSICS | VISUAL | PERFORMANCE | WIRING | BUG | HALLUCINATED`
- Location: `file:line` or symbol name
- Severity: `Critical | High | Moderate | Low`

### Step B: Fix Each Issue (in severity order)

For EACH fix:

**1. Understand the full context:**
- Read the code that needs fixing
- Trace the data flow end to end
- Check for related issues in the same area

**2. Plan the fix:**
- What exactly needs to change?
- What files are affected?
- Will this affect other features? Use `find_referencing_symbols` to check.
- Does the uniform buffer layout need to change? If so, check WGSL struct alignment.

**3. Implement with care:**
- Follow the project's code style (`docs/meta/styleguide.md`)
- If fixing physics: cite the correct formula and source
- If adding a new uniform: store types -> renderer -> uniform buffer -> WGSL struct -> WGSL usage
- If optimizing: measure or estimate the improvement, ensure visual parity

**4. Verify the fix:**
- Does TypeScript compile? Run `npx tsc --noEmit` on changed files
- Does the WGSL look correct? Check struct alignment, binding indices, type matching
- Is the data flow complete? Store -> TypeScript -> Uniform buffer -> WGSL struct -> WGSL usage
- Did you break any other feature? Check references to changed symbols

### Step C: WebGPU & WASM Optimization Pass

After fixing correctness issues, evaluate performance improvements:

**WebGPU-specific:**
- Can this feature use a compute shader pre-pass instead of per-fragment evaluation?
- Are storage buffers appropriate for large data (instead of cramming into uniforms)?
- Can render bundles record static commands?
- Is async pipeline compilation used where possible?
- Are bind groups structured for minimal rebinding (per-frame vs per-object data)?

**WASM-specific:**
- Is there CPU-side math (rotation composition, projection, matrix ops) that could use the WASM path?
- Is the JS fallback correct for cases where WASM isn't loaded?
- Could new WASM functions accelerate preprocessing (e.g., Hermite coefficient tables, normalization constants)?

---

## Phase 4: Build Verification

After all fixes for this feature:
1. Run `npx tsc --noEmit` to verify type correctness
2. Run `npx vitest run` for affected test areas
3. Review all changes: did you introduce any new issues?
4. Check that no `as any` casts were added
5. Check that no TODO comments were added
6. Check that no magic numbers were introduced without store wiring

---

## Phase 5: Continue to Next Feature

- Mark the current feature as complete in Task Tool
- **MANDATORY:** Autonomously proceed to the next feature from the priority list
- **NEVER STOP.** Continue working until the user stops the session
- **NEVER ASK** "should I continue?" — just continue. The user will interrupt when they want to stop.

=== RECALL CIB-001 ===
Before starting the next feature: you are a senior staff developer. Slow down. Read carefully. No shortcuts.
=== END RECALL ===

---

## ANTI-SLOP CHECKLIST

Before completing ANY fix, verify you haven't produced AI slop:

- [ ] Did you READ the full implementation, or did you guess what it does?
- [ ] Did you read EVERY line of the relevant WGSL shader, or did you skim?
- [ ] Did you trace the FULL data flow (store -> TS -> uniform buffer -> WGSL), or did you assume?
- [ ] Is every uniform buffer field actually USED in the shader, or are there dead fields?
- [ ] Does every store value actually reach the shader, or does the wire stop somewhere?
- [ ] Did you check binding indices match between TypeScript and WGSL?
- [ ] Did you check struct alignment (vec3f = 16-byte alignment)?
- [ ] Is the physics correct? Did you verify against an authoritative source?
- [ ] Did you check edge cases (n=1, l=0, m=0, origin, large r, disabled features)?
- [ ] Did you look for BOTH big-win and micro-optimization opportunities?
- [ ] Would a senior staff developer approve this code in a review?

If ANY answer is "no" or "I'm not sure," GO BACK AND DO IT PROPERLY.

---

## What Success Looks Like

A successful session:
- Picks ONE feature and performs EXHAUSTIVE audit of physics, visuals, and performance
- Verifies quantum physics formulas against authoritative sources
- Finds bugs that previous sessions missed
- Fixes every issue completely — no TODOs, no "good enough"
- Delivers measurable performance improvements (big wins AND micro-optimizations)
- Ensures every store parameter reaches the shader and produces correct visual changes
- Leaves the codebase strictly better than it found it
- Produces code that a PhD physicist and a senior GPU engineer would both approve
