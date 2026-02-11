Implemented `domainColoringPsi` as color algorithm id 8 with configurable modulus contour styling.

Key integration points:
- Palette types/options/mapping/defaults:
  - `src/rendering/shaders/palette/types.ts`
  - Added `domainColoringPsi` to `ColorAlgorithm`
  - Added `DomainColoringSettings` + `DomainColoringModulusMode`
  - Added `DEFAULT_DOMAIN_COLORING_SETTINGS`
  - Added map entry `domainColoringPsi: 8`
- Palette exports:
  - `src/rendering/shaders/palette/index.ts`
- Appearance defaults/slice:
  - `src/stores/defaults/visualDefaults.ts`
  - `src/stores/slices/visual/types.ts`
  - `src/stores/slices/visual/colorSlice.ts`
  - Added `domainColoring` state and `setDomainColoringSettings` action
  - Clamp ranges: density [1,32], width [0.005,0.25], strength [0,1]
- UI controls:
  - New `src/components/sections/Faces/DomainColoringControls.tsx`
  - Wired into `FacesSection.tsx` for `colorAlgorithm === 'domainColoringPsi'`
  - Updated `ColorPreview.tsx` with preview branch for domain coloring + optional contours

WebGPU shader/rendering wiring:
- Shader type union includes algorithm 8:
  - `src/rendering/webgpu/shaders/types.ts`
- Main phase-dependent mode checks now include 8:
  - `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`
- Emission color branch:
  - `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
  - Added `COLOR_ALG_DOMAIN_COLORING_PSI` and `ALGO_BRANCH[8]`
  - Domain coloring formula:
    - hue from `phaseNorm = fract((phase + PI) / TAU)`
    - modulus value from `s` (`log|psi|^2`) or `0.5*s` (`log|psi|`) via mode toggle
    - optional anti-aliased contours in log-modulus space
- Uniform struct and host packing:
  - `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`
  - Appended `domainColoringParams0: vec4f`, `domainColoringParams1: vec4f`
  - `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
  - `SCHROEDINGER_UNIFORM_SIZE` changed 1376 -> 1408
  - Writes domain params at offsets 1376..1404
  - Added map entry `domainColoringPsi: 8`
- Density grid pass uniform buffer size updated:
  - `src/rendering/webgpu/passes/DensityGridComputePass.ts`
  - Size changed 1376 -> 1408

Ancillary type consistency:
- `src/rendering/webgpu/core/storeTypes.ts` appearance fields updated to include distribution/lch/multiSource/domainColoring.
- `src/rendering/webgpu/shaders/shared/color/selectorVariants.wgsl.ts` docs + case 8 + dependency mapping updated.

Tests added/updated:
- `src/tests/stores/appearanceStore.enhanced.test.ts`
  - Added clamping test for domain-coloring settings
- `src/tests/rendering/webgpu/wgslCompilation.test.ts`
  - Added algorithm 8 to specialization matrix and module-dependency expectations
  - Added feature-tag assertion `Color: Domain Coloring Psi`
- `src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts`
  - Added mapping test asserting createObjectRenderer passes compile-time `colorAlgorithm=8`
- `src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts`
  - Extended local union with `domainColoringPsi`

Verification from implementation turn:
- Targeted tests: pass
- Full `npm test`: pass (117 files passed, 1 skipped)
- `npm run build:web`: pass

## Audit (2026-02-11 session 2)

### Audited algorithms: 6 (phaseCyclicUniform), 7 (phaseDiverging), 8 (domainColoringPsi), 9 (realDiverging), 10 (imagDiverging)

**Math verified correct:**
- Alg 6: Oklab circle at L=0.72, C=0.11 — standard perceptually uniform cyclic colormap
- Alg 7: cos(phase) sign carrier for Wigner-style diverging — physically correct
- Alg 8: hue from arg(ψ), lightness from log|ψ|²/log|ψ| with anti-aliased contour lines — standard domain coloring
- Alg 9/10: normalized*cos/sin(phase) extracts signed Re/Im component — physically correct visualization proxy

**Uniform pipeline verified:**
- Domain coloring: offsets 1376-1408, domainColoringParams0/1 vec4f, alignment correct
- Diverging: offsets 1408-1456, three vec4f (neutral+floor, positive, negative), alignment correct
- SCHROEDINGER_UNIFORM_SIZE = 1456 matches DensityGridComputePass

**Performance fix applied:**
- Alg 6: Eliminated fract/divide/multiply roundtrip — cos/sin are 2π-periodic, `phase + PI` suffices

**Dead code noted:**
- selectorVariants.wgsl.ts: `generateColorSelectorBlock` and `getColorModuleDependencies` exported but never imported. Added deprecation comment.