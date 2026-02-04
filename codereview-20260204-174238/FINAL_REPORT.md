# AI Code Review Report - Schroedinger WebGPU GPU/CPU Overload

## Summary
- **Files Reviewed**: 12 (core renderer, compute pass, shaders)
- **Critical Issues**: 2
- **High Priority Issues**: 3
- **Warnings**: 5
- **Verdict**: PASS_WITH_WARNINGS (Critical fixes needed for production)

---

## Critical Issues (Must Fix)

### [CRITICAL-1] DensityGridComputePass Recomputes Every Frame When Enabled

**Location**: `src/rendering/webgpu/passes/DensityGridComputePass.ts:255,265`

**Problem**: When density grid is enabled (`useDensityGrid: true`), the compute shader runs EVERY FRAME because `needsRecompute` is set to `true` unconditionally whenever uniform buffers are updated.

**Evidence**:
```typescript
// Line 255: updateSchroedingerUniforms always marks dirty
updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer): void {
  if (this.schroedingerBuffer) {
    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
    this.needsRecompute = true  // <-- ALWAYS TRUE
  }
}

// Line 265: updateBasisUniforms also always marks dirty
updateBasisUniforms(device: GPUDevice, data: ArrayBuffer): void {
  if (this.basisBuffer) {
    device.queue.writeBuffer(this.basisBuffer, 0, data)
    this.needsRecompute = true  // <-- ALWAYS TRUE
  }
}
```

**Impact**: For a 64³ density grid, this causes 262,144 expensive quantum wavefunction evaluations EVERY FRAME, even when nothing changed. This is the primary cause of GPU overload when density grid is enabled.

**Root Cause Flow**:
1. `WebGPUSchrodingerRenderer.execute()` calls `updateSchroedingerUniforms()` (line 1454)
2. Then calls `gridPass.updateSchroedingerUniforms()` (line 1485) → sets `needsRecompute = true`
3. Then calls `gridPass.updateBasisUniforms()` (line 1486) → sets `needsRecompute = true`
4. Then calls `gridPass.execute()` (line 1488) → checks `needsRecompute` (TRUE) → recomputes entire grid!

**Fix**: Compare buffer contents before marking dirty, or track a version number for actual changes:
```typescript
updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
  if (this.schroedingerBuffer) {
    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
    if (version !== this.lastSchroedingerVersion) {
      this.needsRecompute = true
      this.lastSchroedingerVersion = version
    }
  }
}
```

---

### [CRITICAL-2] Per-Frame Allocation in Dirty-Flag Optimization Path

**Location**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:682`

**Problem**: Every frame when the dirty-flag optimization kicks in (no parameter changes), a new `Float32Array` is allocated for the time update.

**Evidence**:
```typescript
// Lines 680-688: This branch runs most frames during normal playback
if (!versionChanged && !spreadAnimationEnabled && this.lastSchroedingerVersion !== -1) {
  // Partial buffer write: only update time field at offset 908
  const timeBuffer = new Float32Array([animationTime])  // <-- NEW ALLOCATION EVERY FRAME
  this.device.queue.writeBuffer(
    this.schroedingerUniformBuffer,
    WebGPUSchrodingerRenderer.TIME_FIELD_OFFSET,
    timeBuffer
  )
  return
}
```

**Impact**: Creates ~4 bytes + object overhead per frame, causing unnecessary GC pressure. At 60 FPS, this is 240 allocations/second.

**Fix**: Pre-allocate a single-element Float32Array at class level:
```typescript
// Add to class fields (around line 131):
private timeUpdateBuffer = new Float32Array(1)

// Then use in the optimization path:
this.timeUpdateBuffer[0] = animationTime
this.device.queue.writeBuffer(
  this.schroedingerUniformBuffer,
  WebGPUSchrodingerRenderer.TIME_FIELD_OFFSET,
  this.timeUpdateBuffer
)
```

---

## High Priority Issues

### [HIGH-1] Expensive Density Sampling in Emission Shader

**Location**: `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts:320,379`

**Problem**: The emission shader calls `sampleDensity()` for shadow and AO calculations, adding significant per-sample overhead on top of the already expensive tetrahedral gradient sampling.

**Evidence**:
```wgsl
// Line 320: Shadow calculation samples density along light ray
let rhoS = sampleDensity(shadowPos, uniforms.time * uniforms.timeScale, uniforms);

// Line 379: AO calculation samples density in multiple directions
let sampleRho = sampleDensity(samplePos, uniforms.time * uniforms.timeScale, uniforms);
```

**Impact**: Each `sampleDensity()` call involves expensive quantum wavefunction evaluation (~300-460 ops). With 128 volume samples per ray and multiple shadow/AO samples per volume sample, this compounds rapidly.

**Recommendation**:
1. Use the density grid texture when available (currently not integrated into emission shader)
2. Skip shadow/AO for low-density regions (implement threshold check)
3. Reduce shadow/AO sample count in performance-critical scenarios

---

### [HIGH-2] Tetrahedral Gradient Sampling Overhead

**Location**: `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts:77-80`

**Problem**: Tetrahedral gradient sampling requires 4 full `sampleDensityWithPhase()` calls per gradient computation.

**Evidence**:
```wgsl
// Lines 77-80: 4 expensive density samples for each gradient
let d0 = sampleDensityWithPhase(pos + TETRA_V0 * delta, t, uniforms);
let d1 = sampleDensityWithPhase(pos + TETRA_V1 * delta, t, uniforms);
let d2 = sampleDensityWithPhase(pos + TETRA_V2 * delta, t, uniforms);
let d3 = sampleDensityWithPhase(pos + TETRA_V3 * delta, t, uniforms);
```

**Impact**: With 96-128 samples per ray and gradient needed at each, this is 384-512 density evaluations per pixel (not counting emission shader samples).

**Mitigation Already Present** (partial):
- `computeGradientTetrahedralAtFlowedPos()` (lines 114-117) skips flow and erosion for gradient samples
- Gradient skip for very low density (lines 319-330 in HQ mode)

---

### [HIGH-3] Dense Volume Loop Without Adaptive Step Size

**Location**: `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts:162,282`

**Problem**: The volume raymarching uses fixed step size regardless of density variation.

**Evidence**:
```wgsl
// Line 162: Fixed sample count loop
for (var i: i32 = 0; i < MAX_VOLUME_SAMPLES; i++) {
  if (i >= sampleCount) { break; }
  // ... fixed step size
}
```

**Impact**: Empty regions get as many samples as dense regions, wasting GPU cycles.

**Note**: Early ray termination IS implemented (line 166: transmittance check, lines 178-186: empty region detection), but step size adaptation is not.

---

## Warnings

### [WARN-1] MAX_VOLUME_SAMPLES = 128 May Be Excessive

**Location**: `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts:23`

**Details**: The maximum sample count is hardcoded at 128. Combined with tetrahedral gradient (4x multiplier), this means up to 640 density evaluations per pixel.

**Recommendation**: Consider making this configurable based on quality settings, or implementing LOD-based sample reduction.

---

### [WARN-2] Density Grid Not Used in Emission Shader

**Location**: `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`

**Details**: When density grid is enabled, the integration loop uses texture lookups, but the emission shader (shadow/AO) still uses direct density evaluation.

**Recommendation**: Route emission shader density samples through the grid texture when available.

---

### [WARN-3] useDensityGrid Defaults to False

**Location**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:187`

**Details**: The performance optimization (density grid) is disabled by default. This means most users don't benefit from it.

**Recommendation**: Once CRITICAL-1 is fixed, consider making `useDensityGrid: true` the default for volumetric mode.

---

### [WARN-4] DEV Diagnostic Logging Every Second

**Location**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:1490-1514`

**Details**: Development diagnostic logging runs every second. While guarded by `import.meta.env.DEV`, this still adds overhead in development mode.

```typescript
if (import.meta.env.DEV) {
  const now = Date.now()
  if (now - this.lastDiagnosticLog > 1000) {
    console.log('[WebGPU Schrödinger] Diagnostic:', { ... })
  }
}
```

**Status**: Acceptable for development, ensure tree-shaking removes in production.

---

### [WARN-5] floatView.fill(0) Clears 1KB Buffer Every Full Update

**Location**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:699`

**Details**: When full buffer update is needed, the entire 1KB buffer is cleared first.

```typescript
// Clear previous frame's data to avoid stale values
floatView.fill(0)
```

**Impact**: Minor (~1KB memset per full update). Only occurs when parameters change, not every frame.

**Recommendation**: Consider removing if all fields are explicitly set anyway.

---

## Verification Summary

| Category | Status | Details |
|----------|--------|---------|
| Per-frame allocations | 1 Found | `new Float32Array([animationTime])` at line 682 |
| Compute shader efficiency | BUG FOUND | Recomputes every frame when enabled |
| Shader loop bounds | OK | Fixed at 128, bounded |
| Discard usage | OK | Correct - only for bounding/transparency |
| Bayer pattern | OK | Fixed - uses jitter instead of discard |
| Version tracking | PARTIAL | Only schroedingerVersion, not full dirty tracking for grid |

---

## Performance Impact Estimate

| Issue | Impact When Active |
|-------|-------------------|
| CRITICAL-1 (Grid recompute) | ~50-70% GPU time wasted |
| CRITICAL-2 (Allocation) | ~1-2% CPU overhead |
| HIGH-1 (Emission samples) | ~15-25% additional GPU time |
| HIGH-2 (Gradient samples) | Built into baseline |
| HIGH-3 (Fixed step) | ~10-20% potential savings |

---

## Recommended Fix Priority

1. **CRITICAL-1**: Fix DensityGridComputePass dirty tracking (if density grid is to be used)
2. **CRITICAL-2**: Pre-allocate time update buffer (simple fix, immediate benefit)
3. **HIGH-3**: Consider adaptive step size for empty regions
4. **WARN-2**: Integrate density grid into emission shader
5. **WARN-3**: Enable density grid by default after fixes

---

## Files Changed Summary

Files requiring immediate fixes:
1. `src/rendering/webgpu/passes/DensityGridComputePass.ts` - Fix dirty tracking
2. `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` - Pre-allocate time buffer

Files for future optimization:
1. `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts` - Grid integration
2. `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts` - Adaptive stepping
