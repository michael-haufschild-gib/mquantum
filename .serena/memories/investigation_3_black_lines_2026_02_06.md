# Investigation: "3 Thin Horizontal Black Lines" Bug
## Date: 2026-02-06 (session 2)

## Symptom
Harmonic oscillator renders as only "3 thin horizontal black lines in the center of the screen" instead of a volumetric Gaussian blob.

## User Constraints
- Do NOT use subagents
- Ignore non-default features (emissions, nodal, erosion, SSS, etc.)
- Focus on harmonic oscillator only
- Compare with online repo

## Investigation Log

### Step 1: Uniform Buffer Alignment Verification ✅ PASSED
Computed every byte offset in SchroedingerUniforms WGSL struct and compared against TypeScript renderer's hardcoded offsets. ALL match perfectly:
- vec3f alignment padding at sssColor (offset 736), aoColor (848), nodalColor (880) all correct
- vec4f alignment padding before cosineA (960) correct
- Total struct size: 1040 bytes ✓
- TIME_FIELD_OFFSET = 908 ✓
**Conclusion: Alignment is NOT the issue.**

### Step 2: Default Preset Generation - NEEDS VERIFICATION
Default params: `generateQuantumPreset(seed=42, dim=3, termCount=1, maxN=6, spread=0.01)`
- Uses mulberry32 PRNG with seed 42
- With termCount=1, generates only 1 term
- Quantum numbers are RANDOM (biased toward low values): 40% chance of 0, then 25% for 1, etc.
- The actual quantum numbers for seed=42 need to be computed/tested
- **Risk**: If seed 42 produces high quantum numbers (e.g., n=5,6,6), Hermite polynomials have many oscillations and the Gaussian envelope makes the wavefunction very narrow → could produce thin features

### Step 3: Basis Vector Initialization - NOT YET CHECKED
The basis vectors (basisX, basisY, basisZ, origin) are written in `updateBasisUniforms()`.
- If basis vectors are wrong/zero, the coordinate mapping would collapse dimensions
- Need to check what default basis vectors are set

### Step 4: Main Shader Ray Setup - NOT YET CHECKED
- Vertex shader: need to verify it passes correct data
- Fragment shader: ray origin and direction computation
- Sphere intersection: need to verify correctness

### Step 5: Shader Composition - NOT YET CHECKED
- `composeSchroedingerShader()` assembles blocks in order
- Need to verify the right blocks are included for default HO mode

### Step 6: Color Algorithm
- Default is 'mixed' (9) based on renderer code: `colorAlgorithmMap[appearance?.colorAlgorithm ?? 'mixed'] ?? 9`
- But previous audit says DEFAULT_COLOR_ALGORITHM = 'monochromatic'
- Need to verify what the appearance store actually provides

### Step 3: Basis Vector Initialization ✅ PASSED
Default basis for 3D is identity:
- basisX = [1, 0, 0, ...], basisY = [0, 1, 0, ...], basisZ = [0, 0, 1, ...], origin = [0, 0, 0, ...]
- Stored with STRIDE=12 (array<vec4f, 3> = 12 floats per basis vector)
- mapPosToND: xND[j] = pos[j] * fieldScale for 3D. Correct.

### Step 4: Vertex Shader ✅ PASSED
- Transforms position to world space via modelMatrix
- Passes worldPos as vPosition to fragment shader
- Fragment computes ro and rd correctly from inverseModelMatrix

### Step 5: Sphere Intersection ✅ PASSED
- Standard quadratic formula for ray-sphere at origin
- BOUND_R = 2.0 matches halfSize=2.0 cube

### Step 6: Camera Uniforms ✅ PASSED
- All 128 floats/ints at correct offsets (verified byte-by-byte)
- Model matrix and inverse model matrix built correctly from transform store

### Step 7: Main Shader & Volume Integration ✅ LOGIC LOOKS CORRECT
- volumeRaymarch / volumeRaymarchHQ both use standard Beer-Lambert compositing
- Adaptive step size (1x/2x/4x based on log-density thresholds)
- Early exit on low transmittance
- computeAlpha(rho, stepLen, densityGain) = 1 - exp(-densityGain * rho * stepLen)

### Step 8: Psi Evaluation ✅ LOGIC LOOKS CORRECT
- evalPsiWithSpatialPhase correctly dispatches to HO mode
- HO mode loops over terms, computes c_k * Phi_k(x) * e^(-iE_k*t)
- hoNDOptimized calls dimension-specific hoND3D which products ho1D per dim

### Step 9: Emission Color ✅ LOGIC LOOKS CORRECT FOR NON-ZERO DENSITY
- For 'mixed' algorithm (9): lightness = 0.15 + 0.35*normalized, saturation = 0.7 + 0.25*normalized
- Even at zero density, produces non-black HSL color
- computeEmissionLit: ambient + directional lighting from shared lighting system
- Bug 8 (fract) and Bug 9 (gradient=0) fixes confirmed in place

### Step 10: EnvironmentCompositePass - BUG 3 STILL PRESENT ⚠️
**File**: `src/rendering/webgpu/passes/EnvironmentCompositePass.ts`
The depth texture handling bug from the previous audit is NOT fixed:
- Line 58: `var tMainObjectDepth: texture_2d<f32>` → should be `texture_depth_2d`
- Line 230: `sampleType: 'unfilterable-float'` → should be `sampleType: 'depth'`  
- Lines 77,103,125: `.r` accessor on textureLoad → should be direct f32 for texture_depth_2d

**Impact Analysis**: If depth24plus texture is bound with unfilterable-float sample type, WebGPU validation may fail when creating the bind group. This would cause the composite pass to fail silently, producing a black (cleared) output. However, the user sees "3 thin horizontal black lines" not pure black, so this may not be the sole cause. Some GPU drivers may be lenient.

## ROOT CAUSE FOUND (session 3)

### Step 11: Normalization Change Analysis ✅ ROOT CAUSE CONFIRMED

**File**: `src/rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl.ts`

The ho1D normalization was changed from "visual damping" to "canonical quantum normalization":

**OLD (working):** `return damp * H * gauss` where `damp = 1/(1 + 0.15*n²)`
**NEW (broken):** `return alphaNorm * norm * H * gauss` where `norm = 1/sqrt(2^n * n!)`, `alphaNorm = (α/π)^{1/4}`

**Test results (seed=42, n=[2,0,1], omega≈0.81):**
- Peak density dropped **30x** (0.945 → 0.031)
- Center-ray alpha dropped from 0.97 to 0.11
- At moderate offsets (0.7), alpha drops to **0.003 = BELOW 0.01 DISCARD THRESHOLD**
- Adaptive stepping exacerbates: low-density regions use 4x steps, skipping through the wavefunction

**Why "3 thin horizontal black lines":** The n=[2,0,1] quantum state has nodal structure. With 30x lower density, only the very peak lobes produce enough alpha to survive the 0.01 discard check. These peaks form thin bands visible from the camera angle. Most of the volume is invisible.

### Step 12: Additional Changes (from git diff)
- Uniform buffer 1024→1040 (fog/erosion HQ fields added) - WGSL struct matches ✅
- IBL fully removed (bind group 3 eliminated) - clean removal ✅
- hydrogenOrbital mode removed (falls back to HO) - correct ✅
- Quality uniforms IBL fields removed - WGSL matches ✅
- Adaptive step moved before alpha computation - correct for energy conservation ✅
- hoNDVariants early-exit removed - doesn't affect correctness ✅
- Bug 3 (EnvironmentComposite depth type) still present but NOT the root cause

## FIX OPTIONS
1. **Revert to visual damping** (old behavior) - quickest, known to work
2. **Keep canonical normalization + compensate densityGain** - increase densityGain to ~60-80 to compensate 30x drop
3. **Keep canonical + add auto-gain** - compute a per-preset normalization factor at runtime
4. **Hybrid:** canonical normalization with visual-level rescaling constant

## FIX IMPLEMENTED (session 4)

### Option 3 chosen: Keep canonical normalization + auto-compensate in renderer

**Changes made:**

1. **`src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`**:
   - Added `canonicalDensityCompensation` private field (default 1.0)
   - Added `computeCanonicalCompensation(preset, dimension)` method
   - Compensation computed when preset changes, folded into densityGain uniform

2. **No shader changes needed**

**Test verification:**
- Compensation factor for seed=42 (n=[2,0,1]): 30.7045
- Match ratio: 1.0000 (perfect match with old visual output)

### Still TODO
- Fix Bug 3 (EnvironmentComposite depth texture type)

## NEXT STEPS (archived)
1. Fix ho1d.wgsl.ts normalization (option 1 or 2)
2. Fix Bug 3 (EnvironmentComposite depth texture type) while we're at it
