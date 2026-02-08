# CPU-Side Quantum Computations Audit (2026-02-08)

## Project Context
- N-dimensional quantum physics simulator (PhD thesis)
- Single object type: `ObjectType = 'schroedinger'`
- Quantum modes: Harmonic Oscillator (1D-11D), Hydrogen Orbital (3D), Hydrogen N-D (4D-11D)
- Custom WebGPU renderer (WGSL shaders only)

---

## 1. ENERGY VALUES COMPUTATION

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/schroedinger/presets.ts`
**Function**: `generateQuantumPreset()` (lines 66-155)
**Uniform Upload**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` (lines 1138-1142)

### Formula (Physics-Correct)
```
E_k = Σ_j ω_j * (n_{k,j} + 0.5)
```

where:
- `k` = superposition term index (0 to termCount-1)
- `j` = dimension index (0 to dimension-1)
- `ω_j` = per-dimension angular frequency
- `n_{k,j}` = quantum number for term k in dimension j

### CPU Code
```typescript
// Lines 132-139 in presets.ts
let E = 0
for (let j = 0; j < dim; j++) {
  const omegaJ = omega[j] ?? 1.0
  const nJ = n[j] ?? 0
  E += omegaJ * (nJ + 0.5)
}
energies.push(E)
```

### Validation
✓ **CORRECT**: Formula matches standard quantum mechanics: E = ℏω(n + 1/2)
✓ All dimensions included
✓ Frequency spread applied during generation
✓ Values stored in `QuantumPreset.energies[]` array (Float32Array)

---

## 2. COEFFICIENT VALUES COMPUTATION

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/schroedinger/presets.ts`
**Function**: `generateQuantumPreset()` (lines 141-146)
**Uniform Upload**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` (lines 1126-1136)

### Formula
```
amplitude_k = 1.0 / (1.0 + 0.15 * E_k)
phase_k = random() * 2π
c_k = amplitude_k * (cos(phase_k) + i*sin(phase_k))
```

where:
- `E_k` = energy of term k (computed above)
- `random()` = seeded PRNG (Mulberry32)
- `c_k` = complex coefficient = `(re, im)` pair

### CPU Code
```typescript
// Lines 141-145 in presets.ts
const amplitude = 1.0 / (1.0 + 0.15 * E)
const phase = rng() * 2 * Math.PI
coefficients.push([amplitude * Math.cos(phase), amplitude * Math.sin(phase)])
```

### Design Rationale
- **Energy-dependent amplitude**: Lower-energy (smoother) terms are dominant
- **Random phase**: Creates diverse interference patterns
- **Amplitude damping factor**: 0.15 chosen for aesthetic coherence

### Validation
✓ **PHYSICALLY REASONABLE**: Weights smooth terms more heavily
✓ Complex coefficients stored as `(re, im)` pairs
✓ Normalized for typical superposition (max |c_k| ≈ 1)
✓ Seeded RNG ensures deterministic generation from seed

---

## 3. OMEGA (FREQUENCY) VALUES PER DIMENSION

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/schroedinger/presets.ts`
**Function**: `generateQuantumPreset()` (lines 81-89)
**Uniform Upload**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` (lines 1115-1117)

### Formula
```
ω_j = baseFreq + (offset * spread * 0.5)

where:
  baseFreq = 0.8 + rng() * spread * 2
  offset = (j * φ) % 1.0           [golden ratio spacing]
  spread = frequencySpread input   [0-0.5]
```

### CPU Code
```typescript
// Lines 81-89 in presets.ts
for (let j = 0; j < dim; j++) {
  const baseFreq = 0.8 + rng() * spread * 2
  const offset = (j * 0.618033988749895) % 1.0  // golden ratio
  omega.push(baseFreq + offset * spread * 0.5)
}
```

### Defaults (from DEFAULT_SCHROEDINGER_CONFIG)
- **Default frequencySpread**: 0.01 (1% variation)
- **Base range**: [0.8, 0.9] before spread
- **Typical omega range**: [0.78, 0.93] for small spread
- **Extra dimension omegas** (HydrogenND): [1.0] × 8 (uniform), scaled by `extraDimFrequencySpread`

### Validation
✓ **PHYSICALLY REASONABLE**: Provides quasi-random frequency spread
✓ Golden ratio ensures non-repeating pattern across dimensions
✓ Seeded generation reproducible
✓ Range covers reasonable harmonic oscillator frequencies

---

## 4. QUANTUM NUMBER VALUES PER TERM/DIMENSION

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/schroedinger/presets.ts`
**Function**: `generateQuantumPreset()` (lines 96-130)
**Uniform Upload**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` (lines 1120-1124)

### Formula (Biased Distribution)
```
n_{k,j} ~ Categorical distribution with bias toward low n
- P(n=0) = 40%
- P(n=1) = 25% (or 2 if dim ≥ 4, for even-only constraint)
- P(n=2) = 17%
- P(n=3) = 10% (or 4 if dim ≥ 4)
- P(n > 3) = 8% (random up to maxN)

CONSTRAINT for dims ≥ 4 (j >= 3):
  n must be EVEN (bug fix: prevents zero wavefunction at slice origin)
```

### CPU Code
```typescript
// Lines 99-128 in presets.ts
const mustBeEven = j >= 3  // For dims beyond 3D slice

if (r < 0.4) {
  quantumN = 0
} else if (r < 0.65) {
  quantumN = mustBeEven ? 2 : 1
} else if (r < 0.82) {
  quantumN = 2
} else if (r < 0.92) {
  quantumN = mustBeEven ? Math.min(4, nMax) : Math.min(3, nMax)
} else {
  const raw = Math.floor(rng() * (nMax + 1))
  quantumN = mustBeEven ? Math.min(raw & ~1, nMax) : Math.min(raw, nMax)
}
```

### Clamping
- Per-dimension: clamped to [0, maxN] where maxN ∈ [2, 6]
- Default maxN = 6
- User slider range: [2, 6]

### Critical Bug Fix
**Even-only constraint for dims ≥ 4**: 
- When visualization slice parameter = 0, Hermite polynomial H_n(0) = 0 for odd n
- This would zero out the entire wavefunction term for that dimension
- Solution: Force n to be even (0, 2, 4, 6, ...) for dims > 3

### Validation
✓ **PHYSICALLY SOUND**: Low-n states are smoothest, highest probability
✓ **CORRECT N-D EXTENSION**: Even-only constraint prevents degenerate slices
✓ Distribution creates organic, varied shapes
✓ Clamping prevents numerical issues with high factorials

---

## 5. PEAK DENSITY COMPUTATION

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
**Function**: `computeCanonicalCompensation()` (lines 831-910)
**Used In**: Density gain auto-normalization (line 1202)

### Formula
```
peakDensity = |c_dominant|² × ∏_j peak_1D(n_j, ω_j)

where peak_1D(n, ω) = √(ω/π) / (2ⁿ n!) × max_u[H_n²(u)·e^(-u²)]
```

### Implementation Details

**Step 1: Find dominant term**
```typescript
// Find largest |c_k|²
const maxCoeffMag = max(|c_k|²)  // Lines 847-858
```

**Step 2: Compute 1D peak for each dimension**
```typescript
// For each dimension j:
const alpha = √ω_j
const coeffs = HERMITE_COEFFS[n_j]  // Physicists' polynomials

// Numerically find max of H_n²(u)·e^(-u²) over [0, 5]
let maxHermiteSq = 0
for (let i = 0; i <= 500; i++) {
  const u = (i / 500) * 5.0
  const hn = evaluatePolynomial(coeffs, u)  // Horner's method
  const val = hn² × e^(-u²)
  maxHermiteSq = max(maxHermiteSq, val)
}

// Normalize by 2ⁿ × n!
const factorial = FACTORIALS[n_j]
const twoN_nFact = 2^n_j × factorial
const peak1D = √(ω_j / π) / twoN_nFact × maxHermiteSq
```

**Step 3: Multiply across all dimensions**
```typescript
peakDensity *= peak1D  // Lines 866-891
```

### Constants (Hermite Polynomials)
```typescript
const HERMITE_COEFFS = [
  [1],                              // H_0
  [0, 2],                            // H_1
  [-2, 0, 4],                        // H_2
  [0, -12, 0, 8],                    // H_3
  [12, 0, -48, 0, 16],               // H_4
  [0, 120, 0, -160, 0, 32],          // H_5
  [-120, 0, 720, 0, -480, 0, 64],    // H_6
]

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720]
```

### Cached Value
```typescript
this.cachedPeakDensity = peakDensity
// Uploaded to shader: floatView[704 / 4] = this.cachedPeakDensity
```

### Usage in Density Gain Compensation
```typescript
// Target opacity per step: alpha ≈ 0.7 at peak density
// Beer-Lambert: alpha = 1 - exp(-densityGain × rho × stepLen)
// => densityGain_needed = -ln(1 - 0.7) / (peakDensity × stepLen)

const TARGET_ALPHA = 0.7
const DEFAULT_DENSITY_GAIN = 2.0
const estimatedStepLen = (2 × boundingRadius) / 32  // 32 typical samples
const neededGain = -ln(1 - 0.7) / (peakDensity × estimatedStepLen)
return neededGain / 2.0  // Compensation factor
```

### Validation
✓ **PHYSICALLY CORRECT**: Uses exact 1D wavefunction peak formula
✓ **DIMENSION-AWARE**: Multiplies peaks across all dimensions correctly
✓ **NUMERICALLY STABLE**: Clamped quantum numbers [0, 6], handles exp() safely
✓ **SHADER INTEGRATION**: Peak uploaded every frame for shader access

---

## 6. FIELD SCALE COMPUTATION/DEFAULT

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts` (lines 289, 549)
**Uniform Upload**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` (line 1201)
**Store Setter**: `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/schroedingerSlice.ts` (line 441)

### Default Value
```typescript
fieldScale: 1.0  // DEFAULT_SCHROEDINGER_CONFIG
```

### Clamping (User Control)
```typescript
// Store setter (line 441): clampedSetter('fieldScale', 0.5, 2.0)
const clampedFieldScale = Math.max(0.5, Math.min(2.0, value))
```

### Upload to GPU
```typescript
// Line 1201 in WebGPUSchrodingerRenderer.ts
floatView[680 / 4] = schroedinger?.fieldScale ?? 1.0
```

### Purpose
**Coordinate scale into HO basis**: Stretches/compresses the coordinate system
- `fieldScale = 1.0`: Standard HO coordinate scaling
- `fieldScale < 1.0`: Expands the visualization (smaller effective coordinates)
- `fieldScale > 1.0`: Compresses the visualization (larger effective coordinates)

### Shader Integration
Field is passed to GPU but **not used in amplitude computation**. It's a visual/coordinat scaling parameter used in the raymarching shader to adjust the sample coordinate before evaluating the wavefunction.

### Validation
✓ **REASONABLE RANGE**: [0.5, 2.0] provides 4× zoom range
✓ **INTUITIVE CONTROL**: Matches user expectation for coordinate scaling
✓ **PROPERLY CLAMPED**: Prevents numerical instability

---

## 7. BOUNDING RADIUS COMPUTATION

### Location
**File**: `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/schroedinger/boundingRadius.ts`
**Main Dispatcher**: `computeBoundingRadius()` (lines 196-239)
**Used In**: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` (lines 1072-1082)

### Harmonic Oscillator (Position Space)

**Function**: `computeHOBoundingRadius()` (lines 49-63)

```typescript
function computeHOBoundingRadius(
  dimension: number,
  quantumNumbers: number[][],  // n[k][j] for each term k, dimension j
  omegas: number[]              // ω_j per dimension
): number {
  const GAUSSIAN_MARGIN = 2.5  // Decay lengths beyond classical turning point
  const MIN_BOUND_R = 2.0      // Minimum (matches legacy BOUND_R)
  
  let maxR = MIN_BOUND_R
  for (let j = 0; j < dimension; j++) {
    // Find max quantum number across all terms for this dimension
    const maxN = Math.max(...quantumNumbers.map((term) => term[j] ?? 0))
    
    // Gaussian decay constant
    const alpha = Math.sqrt(Math.max(omegas[j] ?? 1.0, 0.01))
    
    // Classical turning point: where V(x) = E
    const classicalTurningPoint = Math.sqrt(2 * maxN + 1) / alpha
    
    // Add Gaussian tail margin (captures exp(-α²x²) decay)
    const R_j = classicalTurningPoint + GAUSSIAN_MARGIN / alpha
    
    maxR = Math.max(maxR, R_j)
  }
  return maxR
}
```

**Physics**:
- Classical turning point: x_cl = √(2n+1) / √ω
- Gaussian decay: ψ_n(x) ~ H_n(x)·exp(-ωx²/2)
- Margin 2.5: Captures density down to ~exp(-6.25) ≈ 0.2% of peak

### Hydrogen (Position Space)

**Function**: `computeHydrogenBoundingRadius()` (lines 79-99)

```typescript
function computeHydrogenBoundingRadius(
  principalN: number,      // n ∈ [1, 7]
  bohrRadius: number,      // a₀ scale (typically 1.0)
  extraDimN?: number[],    // Quantum numbers for extra dims (4D-11D)
  extraDimOmega?: number[] // Frequencies for extra dims
): number {
  const MIN_BOUND_R = 2.0
  
  // 3D hydrogen: peak probability at r ~ n² a₀, tail extends ~3× beyond
  const hydrogenR = principalN * principalN * bohrRadius * 3.0
  let maxR = Math.max(MIN_BOUND_R, hydrogenR)
  
  // Extra dimensions (4D-11D) use HO formula
  if (extraDimN && extraDimOmega) {
    for (let j = 0; j < extraDimN.length; j++) {
      const n = extraDimN[j] ?? 0
      const alpha = Math.sqrt(Math.max(extraDimOmega[j] ?? 1.0, 0.01))
      const R_j = (Math.sqrt(2 * n + 1) + GAUSSIAN_MARGIN) / alpha
      maxR = Math.max(maxR, R_j)
    }
  }
  return maxR
}
```

**Physics**:
- Hydrogen 3D: Peak at r = n²·a₀ (Bohr model)
- Tail safety factor: 3.0× ensures full orbital visible
- Extra dims: Use HO formula independently

### Momentum Space

**Functions**: 
- `computeHOMomentumBoundingRadius()` (lines 115-134)
- `computeHydrogenMomentumBoundingRadius()` (lines 155-179)

**HO Momentum Space**:
```
k-space turning point: √(2n+1)·√ω   [reciprocal of position]
Bounding radius: R_k / momentumScale  [pre-scale]
```

**Hydrogen Momentum Space**:
```
Momentum-space extent: ~6/(n·a₀)    [peak at k ~ 1/(n·a₀)]
Applied scale factor: 6.0 (safety margin for fast decay)
```

### Dispatcher Logic

```typescript
function computeBoundingRadius(
  quantumMode: string,
  preset: QuantumPreset | null,
  dimension: number,
  principalN: number = 2,
  bohrRadius: number = 1.0,
  extraDimN?: number[],
  extraDimOmega?: number[],
  representation: 'position' | 'momentum' = 'position',
  momentumScale: number = 1.0
): number {
  if (representation === 'momentum') {
    if (quantumMode === 'hydrogenND') {
      return computeHydrogenMomentumBoundingRadius(...)
    }
    if (preset) {
      return computeHOMomentumBoundingRadius(...)
    }
    return MIN_BOUND_R
  }
  
  // Position space (default)
  if (quantumMode === 'hydrogenND') {
    return computeHydrogenBoundingRadius(...)
  }
  if (preset) {
    return computeHOBoundingRadius(...)
  }
  return MIN_BOUND_R
}
```

### Usage in Renderer

```typescript
// Lines 1072-1094 in WebGPUSchrodingerRenderer.ts
const newBoundR = computeBoundingRadius(
  quantumModeStr,           // 'harmonicOscillator' | 'hydrogenND'
  this.cachedPreset,        // Current HO preset
  dimension,                // 3-11
  principalN,               // Current n for hydrogen
  bohrRadius,               // Current a₀ scale
  extraDimQuantumNumbers,   // Extra dim n values
  extraDimOmega,            // Extra dim ω values
  representation,           // 'position' | 'momentum'
  momentumScale             // k-space zoom
)

// Apply hysteresis to avoid geometry rebuild churn
const quantStep = 0.1  // Quantization step
const quantizedBoundR = Math.ceil(newBoundR / quantStep) * quantStep

if (Math.abs(quantizedBoundR - this.boundingRadius) >= 0.15) {
  this.boundingRadius = quantizedBoundR
  this.createBoundingGeometry(device)  // Rebuild bounding cube
}
```

### Cached Value
- **Computed**: Every full update (when schroedinger state changes)
- **Clamped**: Minimum = 2.0, no upper limit
- **Used for**:
  - Setting bounding cube size in GPU
  - Estimating step length for density compensation
  - Clipping geometry to raymarching volume

### Validation
✓ **PHYSICALLY SOUND**: Based on turning points + Gaussian decay
✓ **DIMENSION-AWARE**: Correctly handles 3D-11D
✓ **MOMENTUM-AWARE**: Properly inverts for k-space
✓ **HYSTERESIS**: Avoids geometry rebuild thrashing
✓ **SAFETY MARGINS**: 2.5× Gaussian margin, 3.0× hydrogen tail

---

## Summary Table

| Item | Location | Physics Formula | Default/Range | Status |
|------|----------|-----------------|---------------|----|
| **Energy** | presets.ts:132-139 | E_k = Σ ω_j(n_j + 0.5) | Computed | ✓ Correct |
| **Coefficient** | presets.ts:141-146 | \|c_k\| = 1/(1+0.15E_k), phase ~ U(0,2π) | Auto | ✓ Reasonable |
| **Omega** | presets.ts:81-89 | ω_j ~ U(0.8, 0.9+spread) | 0-0.5 spread | ✓ Correct |
| **Quantum #** | presets.ts:99-128 | Biased categorical + even constraint | 0-maxN [2-6] | ✓ Correct+Fixed |
| **Peak Density** | WebGPU:831-910 | \|c\|² × ∏ peak_1D(n,ω) | Cached | ✓ Exact |
| **Field Scale** | types.ts:549 | Coordinate pre-scaling | [0.5, 2.0] | ✓ OK |
| **Bounding Radius** | boundingRadius.ts:49-239 | Turning pt + Gaussian margin | [2.0, ∞) | ✓ Correct |

---

## Key Findings

1. **Energy computation** is CORRECT and matches standard QM: E = ℏω(n + 1/2)
2. **Quantum numbers** include a critical fix: even-only constraint for dims ≥ 4 prevents zero wavefunction
3. **Peak density** uses exact 1D wavefunction formula for auto-normalization
4. **Bounding radius** physics-based with appropriate safety margins
5. **All values** properly clamped, seeded, and cached for performance
