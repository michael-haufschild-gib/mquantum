# Plan: Bloom Rewrite (Localized Neon Glow, No Global Tint)

Date: 2026-02-20  
Status: Proposed  
Scope: Rewrite bloom implementation in WebGPU post-processing to remove global haze/chroma bias and produce physically plausible, localized glow.

## Primary Sources

- Three.js Unreal bloom overview: [https://threejs.org/docs/pages/UnrealBloomPass.html](https://threejs.org/docs/pages/UnrealBloomPass.html)
- Unreal Engine bloom docs (Gaussian + convolution): [https://dev.epicgames.com/documentation/en-us/unreal-engine/bloom-in-unreal-engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/bloom-in-unreal-engine)
- Unreal threshold tuning guidance (threshold ~= 1, threshold = -1 means full-screen contribution): [https://dev.epicgames.com/documentation/en-us/unreal-engine/add-post-process-volumes](https://dev.epicgames.com/documentation/en-us/unreal-engine/add-post-process-volumes)

## 1. Objective

Deliver bloom that behaves like a high-quality emissive glow effect:

- glow appears around bright emitters and reflections
- dark/background regions stay dark
- no persistent green (or other channel) haze on black backgrounds
- stable, centered bloom with no directional offset artifacts

## 2. Confirmed Problems To Fix

1. Bright-pass uses max channel (`max(r,g,b)`) instead of luminance, causing channel-biased triggering in saturated scenes.
2. Downsample path quality is weak (nearest-like sampling behavior in mip transitions), producing muddy spread.
3. Effective default bloom energy is too high, allowing full-frame haze.
4. Convolution mode applies thresholding on blurred scene signal, promoting midtone bleed.
5. Threshold contract is inconsistent across defaults, store clamps, pass clamps, and URL parsing.

## 3. Rewrite Strategy

Use a standard HDR bloom pyramid pipeline and align all configuration contracts.

### 3.1 Keep vs rewrite

- Keep: `BloomPass` integration point in render graph and resource IDs (`hdr-color` -> `bloom-output`).
- Rewrite: bloom internals (threshold, downsample, blur, upsample/combine, defaults, parameter contract).
- Convolution mode: keep behind explicit advanced mode, but move to true bright-pass input so it cannot tint dark scene regions by default.

### 3.2 Target algorithm (Gaussian mode)

1. Bright-pass prefilter:
- compute luminance (`dot(rgb, vec3(0.2126, 0.7152, 0.0722))`)
- apply soft knee around threshold
- output prefiltered bright texture only

2. Downsample chain (mip pyramid):
- generate 1/2, 1/4, 1/8, 1/16, 1/32 textures
- filtered sampling (box/tent; Karis average on first downsample if needed)

3. Blur:
- separable Gaussian blur per mip
- normalized coefficients per mip
- radius scaling controlled by band size/scale

4. Upsample/combine:
- progressive upsample from smallest mip to largest
- additive/tent upsample to preserve locality and smooth falloff
- optional per-level tint and weight in combine stage

5. Composite:
- `scene + bloom * gain`
- optional clamp/safety to avoid runaway glow

## 4. Contract and Parameter Cleanup

Unify bloom parameter semantics across all layers:

- `/Users/Spare/Documents/code/mquantum/src/stores/defaults/visualDefaults.ts`
- `/Users/Spare/Documents/code/mquantum/src/stores/slices/postProcessingSlice.ts`
- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/BloomPass.ts`
- `/Users/Spare/Documents/code/mquantum/src/lib/url/state-serializer.ts`

### 4.1 Threshold contract (single source of truth)

Pick one contract and apply everywhere. Recommended:

- threshold range: `[-1, 8]`
- `-1`: all pixels can contribute
- `1`: practical default for HDR emissive isolation

If `-1` is considered too risky for users, keep UI clamp at `[0, 5]` but remove all references to `-1` in docs/comments/parsers.

### 4.2 Default tuning (safe baseline)

Initial proposal for reduced haze risk:

- `bloomGain`: 0.6 to 0.9 (start at 0.75)
- `bloomThreshold`: 1.0
- `bloomKnee`: 0.4 to 0.6 (start at 0.5)
- enable fewer high-radius levels by default or reduce far-level weights sharply
- keep tints white by default

## 5. Implementation Plan

### Phase 0: Baseline and guardrails

- Capture current behavior snapshots in a deterministic scene.
- Add or update tests that can detect:
  - background haze
  - center offset regressions
  - threshold contract mismatches

Deliverables:
- baseline screenshots/metrics
- failing regression tests for known issues

### Phase 1: Parameter contract unification

- Align threshold ranges and comments in defaults/store/pass/URL parser.
- Ensure UI sliders and runtime clamps are consistent.

Deliverables:
- unified clamping/serialization behavior
- updated tests for deserialization and clamping

### Phase 2: Gaussian pipeline rewrite

- Replace current gaussian internals with explicit:
  - luminance prefilter pass
  - filtered mip downsample
  - per-mip separable blur
  - progressive upsample/combine
- Keep existing render graph integration stable.

Deliverables:
- new WGSL shader blocks and pass orchestration
- no API break for external pass wiring

### Phase 3: Convolution mode correction

- Route convolution from bright-pass output, not raw blurred scene.
- Keep advanced controls but prevent default midtone wash.
- Optionally mark convolution mode as high-cost/advanced in UI copy.

Deliverables:
- corrected convolution behavior on dark scenes

### Phase 4: Tuning and polish

- tune per-level weights and sizes for neon-like glow profile
- adjust defaults to avoid background lift
- verify with representative quantum scenes (dark background + emissive structures)

Deliverables:
- final tuned defaults and docs

## 6. Test and Verification Plan

## 6.1 Unit/logic tests (Vitest)

- Bright-pass shader contains luminance metric (not max-channel).
- Uniform layouts and buffer sizes match WGSL alignment.
- Threshold behavior near edge cases (0, 1, -1 if supported).
- URL serialize/deserialize contract equality with store clamps.

## 6.2 Rendering behavior tests

- Add targeted Playwright scenarios with controlled emissive objects:
  - black background + single white emitter
  - black background + single green emitter
  - mixed emissive colors
- Evaluate:
  - no unintended glow in distant dark corners
  - centroid of bloom aligns with emitter position
  - white emitters remain neutral (no green drift)

## 6.3 Performance checks

- verify frame cost at common resolutions and DPR scales
- ensure no unexpected memory churn from transient textures

## 7. Acceptance Criteria

1. With threshold = 1 and neutral tint, bloom is localized to high-brightness regions only.
2. Black background does not gain persistent color tint when no bright source exists in that region.
3. Bloom halo centroid matches source emitter location across mip levels.
4. Gaussian mode quality is visibly improved (smooth falloff, no blocky/muddy haze).
5. Store/default/URL/pass threshold semantics are fully consistent and documented.
6. Automated tests cover contract and at least one visual regression guard.

## 8. Risks and Mitigations

- Risk: rewrite introduces GPU cost regressions.
  - Mitigation: preserve mip count limits and resolution scaling controls.

- Risk: visual tuning differs across scenes.
  - Mitigation: define canonical test scenes and tune against those first.

- Risk: convolution mode still perceived as too global.
  - Mitigation: keep as advanced mode with conservative defaults and explicit warning text.

## 9. Rollout Plan

1. Land contract cleanup first.
2. Land gaussian rewrite behind a temporary feature flag if needed.
3. Compare visual/perf against baseline.
4. Remove flag after validation.
5. Update user-facing control descriptions for threshold/gain/radius semantics.
