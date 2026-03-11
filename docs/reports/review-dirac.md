# Dirac Equation Review

## Scope

In-depth code review of the Dirac equation object type and related functionality, including:

- Dirac physics/algebra code in `src/lib/physics/dirac`
- Clifford algebra generation in `src/wasm/mdimension_core/src/clifford.rs`
- GPU compute path in `src/rendering/webgpu/passes/DiracComputePass.ts`
- Dirac compute shaders in `src/rendering/webgpu/shaders/schroedinger/compute`
- Store, UI, and renderer integration for `diracEquation`

Tests were not run.

## Findings

### 1. Critical: 11D support is broken by a 32-component shader limit

- **Location:** `src/lib/physics/dirac/cliffordAlgebraFallback.ts`, `src/wasm/mdimension_core/src/clifford.rs`, `src/rendering/webgpu/shaders/schroedinger/compute/diracKinetic.wgsl.ts`
- **Problem:** The implementation advertises support through 11 spatial dimensions, and both the JS fallback and Rust Clifford generator return a 64-component spinor for 11D. The kinetic shader only allocates local arrays of length 32, then loops up to `params.spinorSize`.
- **Impact:** The core propagator cannot correctly evolve the advertised 11D system. At best, components are silently truncated; at worst, the shader becomes invalid or behaves unpredictably.
- **Evidence:**

```7:10:src/lib/physics/dirac/cliffordAlgebraFallback.ts
/**
 * Compute spinor dimension: S = 2^(⌊(N+1)/2⌋), minimum 2.
 */
export function spinorSize(spatialDim: number): number {
  return Math.max(2, 1 << Math.floor((spatialDim + 1) / 2))
```

```15:25:src/wasm/mdimension_core/src/clifford.rs
/// Compute spinor dimension for Dirac equation in N spatial dimensions.
///
/// The Dirac equation needs N alpha matrices plus beta (N+1 total anticommuting
/// involutions). The Clifford algebra Cl(N+1) has irreducible representation of
/// dimension S = 2^(⌊(N+1)/2⌋), minimum 2.
///
/// N=1→2, N=2→2, N=3→4, N=4→4, N=5→8, N=6→8, N=7→16, N=8→16, N=9→32, N=10→32, N=11→64
pub fn spinor_size(spatial_dim: usize) -> usize {
    (1usize << ((spatial_dim + 1) / 2)).max(2)
}
```

```74:87:src/rendering/webgpu/shaders/schroedinger/compute/diracKinetic.wgsl.ts
// Read spinor at this k-point into local arrays
// Max spinor size is 32 (for 10D/11D)
var psiRe_local: array<f32, 32>;
var psiIm_local: array<f32, 32>;
for (var sc: u32 = 0u; sc < S; sc++) {
  let bufIdx = sc * params.totalSites + idx;
  psiRe_local[sc] = spinorRe[bufIdx];
  psiIm_local[sc] = spinorIm[bufIdx];
}
...
var HpsiRe: array<f32, 32>;
var HpsiIm: array<f32, 32>;
```

### 2. Critical: positive-energy and spin initialization controls are not implemented

- **Location:** `src/lib/geometry/extended/types.ts`, `src/rendering/webgpu/passes/DiracComputePass.ts`, `src/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl.ts`, `src/rendering/webgpu/shaders/schroedinger/compute/diracInit.wgsl.ts`
- **Problem:** The UI and config expose `positiveEnergyFraction` and `spinDirection`, but the initializer does not use them. `positiveEnergyFraction` is uploaded into uniforms and then ignored. `spinDirection` is not present in the GPU uniform layout at all.
- **Impact:** The documented positive-energy projection, zitterbewegung mixing control, and spin-polarized packet setup do not actually exist. The simulation always starts from hardcoded component choices.
- **Evidence:**

```713:720:src/lib/geometry/extended/types.ts
/** Initial spin direction (for spin-polarized packets).
 *  For S=2: single angle θ. For S=4: (θ, φ) on Bloch sphere.
 *  For S>4: first two entries used as (θ, φ), rest default to 0. */
spinDirection: number[]
/** Positive-energy projection strength (0-1).
 *  1.0 = pure positive energy (no Zitterbewegung).
 *  0.5 = equal positive/negative (maximum Zitterbewegung). */
positiveEnergyFraction: number
```

```671:675:src/rendering/webgpu/passes/DiracComputePass.ts
f32[48] = config.coulombZ
u32[49] = initMap[config.initialCondition] ?? 0
f32[50] = config.packetWidth
f32[51] = config.positiveEnergyFraction
```

```38:46:src/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl.ts
// Potential + init (16 bytes)
coulombZ: f32,                  // offset 192
initCondition: u32,             // offset 196 (0=gaussianPacket, 1=planeWave, 2=standingWave, 3=zitterbewegung)
packetWidth: f32,               // offset 200
positiveEnergyFraction: f32,    // offset 204

// Packet init arrays (48 + 48 = 96 bytes)
```

```62:108:src/rendering/webgpu/shaders/schroedinger/compute/diracInit.wgsl.ts
if (params.initCondition == 0u) {
  // gaussianPacket: populate component 0 (spin-up particle)
  let bufIdx0 = idx;
  spinorRe[bufIdx0] = envelope * cosP;
  spinorIm[bufIdx0] = envelope * sinP;
...
} else if (params.initCondition == 3u) {
  // zitterbewegung: equal population of component 0 (particle) and S/2 (antiparticle)
  let half = params.spinorSize / 2u;
  let amp = 0.7071 * envelope;
  ...
  let bufIdxH = half * params.totalSites + idx;
  spinorRe[bufIdxH] = amp * cosP;
  spinorIm[bufIdxH] = amp * sinP;
}
```

### 3. Critical: gamma-matrix upload has a stale async response race

- **Location:** `src/rendering/webgpu/passes/DiracComputePass.ts`
- **Problem:** Each rebuild requests new gamma matrices asynchronously, but the completion callback writes into shared `gammaPendingUpload` and `gammaDataReady` state without checking whether the response still matches the current config.
- **Impact:** If the lattice dimension changes before an earlier worker request returns, stale gamma data can overwrite the active buffer and the solver can evolve the state with the wrong Clifford algebra.
- **Evidence:**

```279:286:src/rendering/webgpu/passes/DiracComputePass.ts
// Request gamma matrices from web worker (async)
this.algebraBridge.generateMatrices(config.latticeDim).then(({ gammaData }) => {
  // The packed format has a leading u32 spinor_size — skip it for GPU upload
  this.gammaPendingUpload = gammaData.subarray(1)
  this.gammaDataReady = true
}).catch((err) => {
  console.error('[Dirac] Failed to generate gamma matrices:', err)
})
```

```870:874:src/rendering/webgpu/passes/DiracComputePass.ts
if (this.gammaDataReady && this.gammaPendingUpload && this.gammaBuffer) {
  device.queue.writeBuffer(this.gammaBuffer, 0, this.gammaPendingUpload as Float32Array<ArrayBuffer>)
  this.gammaPendingUpload = null
}
```

### 4. High: particle/antiparticle views are not actual positive/negative-energy projections

- **Location:** `src/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl.ts`, `src/rendering/webgpu/shaders/schroedinger/compute/diracDiagnostics.wgsl.ts`
- **Problem:** The implementation treats the first half of the spinor as “particle” and the second half as “antiparticle”.
- **Impact:** The split view and diagnostics do not measure what their labels claim once the state is moving or evolving. This is especially problematic because these are central educational features for the Dirac mode.
- **Evidence:**

```144:188:src/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl.ts
} else if (params.fieldView == 1u) {
  // particleDensity: upper spinor components
  var particleD: f32 = 0.0;
  for (var c: u32 = 0u; c < half; c++) {
    let bufIdx = c * params.totalSites + siteIdx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    particleD += re * re + im * im;
  }
...
} else if (params.fieldView == 3u) {
  // particleAntiparticleSplit: particle in R, antiparticle in G
  ...
  if (c < half) {
    particleD += d;
  } else {
    antiD += d;
  }
```

```52:72:src/rendering/webgpu/shaders/schroedinger/compute/diracDiagnostics.wgsl.ts
let S = diagParams.spinorSize;
let half = S / 2u;

var totalD: f32 = 0.0;
var particleD: f32 = 0.0;
var antiD: f32 = 0.0;

if (idx < diagParams.totalSites) {
  // Sum |ψ_c|² over all spinor components at this site
  for (var c: u32 = 0u; c < S; c++) {
    ...
    if (c < half) {
      particleD += d;
    } else {
      antiD += d;
    }
  }
}
```

### 5. High: `spinDensity` is computing current-like data, not spin

- **Location:** `src/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl.ts`
- **Problem:** The `spinDensity` branch computes expectations of `alpha_k`, not the Dirac spin operators `Sigma_k`.
- **Impact:** The visualization is physically mislabeled. Users selecting spin density are not seeing spin density.
- **Evidence:**

```190:217:src/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl.ts
} else if (params.fieldView == 4u) {
  // spinDensity: approximate via |s| where s_k = ψ†Σ_k ψ
  // For 2-component spinors, Σ_k = Pauli matrices = alpha matrices
  // This is an approximation for higher dimensions
  var spinMag2: f32 = 0.0;
  let nSpin = min(params.latticeDim, 3u);
  for (var k: u32 = 0u; k < nSpin; k++) {
    // Compute ψ†α_k ψ
    var expectRe: f32 = 0.0;
    ...
    let gRe = gammaReWG(k, row, col);
    let gIm = gammaImWG(k, row, col);
```

### 6. High: worker fallback does not recover after runtime failure

- **Location:** `src/lib/physics/dirac/diracAlgebra.ts`
- **Problem:** The bridge is supposed to fall back to the JS implementation when the worker path is unavailable, but runtime worker errors only reject current promises. The worker is not marked failed or replaced.
- **Impact:** After one runtime failure, future requests can continue to hit a broken worker instead of falling back cleanly.
- **Evidence:**

```42:47:src/lib/physics/dirac/diracAlgebra.ts
this.worker.onerror = (e) => {
  for (const [, p] of this.pending) {
    p.reject(new Error(`Dirac algebra worker error: ${e.message}`))
  }
  this.pending.clear()
}
```

```66:82:src/lib/physics/dirac/diracAlgebra.ts
const worker = this.ensureWorker()

if (!worker) {
  // Synchronous JS fallback
  return generateDiracMatricesFallback(spatialDim)
}

const epoch = ++this.epoch
return new Promise((resolve, reject) => {
  this.pending.set(epoch, { resolve, reject })
  const msg: DiracAlgebraRequest = {
```

### 7. Medium: Dirac mode exposes an auto-loop control that only changes TDSE state

- **Location:** `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx`
- **Problem:** Dirac mode shows the `Auto-Loop` UI, but the toggle reads and writes `config.tdse?.autoLoop` through `setTdseAutoLoop`.
- **Impact:** The control is misleading and effectively a no-op for Dirac. It mutates unrelated TDSE settings instead of Dirac behavior.
- **Evidence:**

```190:208:src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx
{/* TDSE Auto-Loop — reinitialize wavefunction when norm decays */}
{(isTdse || isDirac) && <div className="space-y-4" data-testid="animation-panel-tdseAutoLoop">
  ...
  <ToggleButton
    pressed={config.tdse?.autoLoop ?? true}
    onToggle={() => setTdseAutoLoop(!(config.tdse?.autoLoop ?? true))}
    className="text-xs px-2 py-1 h-auto"
    ariaLabel="Toggle TDSE auto-loop"
  >
    {(config.tdse?.autoLoop ?? true) ? 'ON' : 'OFF'}
  </ToggleButton>
```

### 8. Medium: the massless graphene preset is not stable under UI editing

- **Location:** `src/lib/physics/dirac/presets.ts`, `src/stores/slices/geometry/schroedingerSlice.ts`, `src/components/sections/Geometry/SchroedingerControls/DiracControls.tsx`
- **Problem:** The `Graphene (2D Dirac)` preset sets `mass: 0.0`, but the store setter and slider clamp mass to at least `0.01`.
- **Impact:** The advertised massless regime is not user-preservable. Loading the preset works, but touching the mass control permanently leaves that regime.
- **Evidence:**

```97:109:src/lib/physics/dirac/presets.ts
overrides: {
  latticeDim: 2,
  gridSize: [256, 256],
  spacing: [0.08, 0.08],
  mass: 0.0,
  speedOfLight: 1.0,
  potentialType: 'barrier',
  potentialStrength: 2.0,
  potentialWidth: 1.5,
```

```2385:2393:src/stores/slices/geometry/schroedingerSlice.ts
setDiracMass: (mass) => {
  if (!isFiniteSchroedingerInput(mass)) return
  const clamped = Math.max(0.01, Math.min(10, mass))
  setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      dirac: { ...state.schroedinger.dirac, mass: clamped },
```

```192:197:src/components/sections/Geometry/SchroedingerControls/DiracControls.tsx
<Slider
  label="Mass m"
  value={dirac.mass}
  onChange={actions.setMass}
  min={0.01} max={10} step={0.01}
/>
```

## Overall Assessment

The biggest issues are core correctness problems rather than polish:

- The highest-dimensional advertised mode is not actually supported by the kinetic shader.
- The initialization path does not create the physically described states.
- Several flagship observables are mislabeled or only loosely approximated.
- The gamma upload path has an async race that can invalidate the solver after dimension changes.

UI and integration issues are secondary, but there are still misleading controls and presets whose advertised behavior is not actually preserved by the app.

## Review Notes

- This review was performed by reading code only.
- No tests, builds, or runtime checks were executed.
