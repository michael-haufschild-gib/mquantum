# GPU Shader Optimization Review

**Date:** 2025-12-29
**Scope:** Mandelbulb, Julia, Schroedinger, Black Hole objects and shared shader modules
**Files Reviewed:** 78 shader files
**Issues Found:** 192+ branching issues, 22 loop unrolling opportunities

---

## Executive Summary

This document contains a comprehensive line-by-line review of all shaders for Mandelbulb, Julia, Schroedinger, and Black Hole objects. The review identifies:

1. **Branching issues** - Code patterns that cause GPU thread divergence (if/else chains, ternary operators, early returns)
2. **Loop unrolling opportunities** - Fixed-iteration loops that could be unrolled for better performance

| Object | Files Reviewed | Branching Issues | Loop Unrolling Opportunities |
|--------|---------------|------------------|------------------------------|
| **Mandelbulb** | 16 | 27 | 4 |
| **Julia** | 7 | 23 | 2 |
| **Schroedinger** | 26 | 45+ | 10 |
| **Black Hole** | 14 | 50+ | 3 |
| **Shared Modules** | 15 | 47 | 3 |
| **TOTAL** | **78** | **192+** | **22** |

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Priority Issues](#high-priority-issues)
3. [Medium Priority Issues](#medium-priority-issues)
4. [Low Priority Issues](#low-priority-issues)
5. [Loop Unrolling Opportunities](#loop-unrolling-opportunities)
6. [Mandelbulb Shader Details](#mandelbulb-shader-details)
7. [Julia Shader Details](#julia-shader-details)
8. [Schroedinger Shader Details](#schroedinger-shader-details)
9. [Black Hole Shader Details](#black-hole-shader-details)
10. [Shared Module Details](#shared-module-details)
11. [Recommended Fix Priority](#recommended-fix-priority)

---

## Critical Issues

These issues have the highest performance impact and should be addressed first.

| Issue | File | Lines | Type | Impact | Fix Description |
|-------|------|-------|------|--------|-----------------|
| Sequential 10-branch if-chain for power | `mandelbulb/power.glsl.ts` | 32-114 | Branching | **Very High** | Convert to switch statement or pre-compute power on CPU |
| 11-branch color algorithm dispatch | `shared/color/selector.glsl.ts` | 8-86 | Branching | **Very High** | Generate algorithm-specific shaders at compile time |
| 8-branch color algorithm dispatch | `blackhole/gravity/colors.glsl.ts` | 38-105 | Branching | **Very High** | Use switch statement or LUT texture |
| Main raymarch loop 5+ early exits | `blackhole/main.glsl.ts` | 299-467 | Branching | **High** | Accept as necessary; improve step adaptation |
| Quantum mode repeated checks | `schroedinger/quantum/psi.glsl.ts` | 76-271 | Branching | **High** | Use dimension-specific shader variants |
| Light loop with dynamic exit | `shared/fractal/main.glsl.ts` | 65-127 | Branching | **High** | Generate variants for common light counts (1, 2, 4) |
| Volume integration loop early exits | `schroedinger/volume/integration.glsl.ts` | 163-306 | Branching | **High** | Use accumulator pattern instead of early returns |
| Doppler blackbody 6+ branches | `blackhole/gravity/doppler.glsl.ts` | 108-133 | Branching | **High** | Use LUT texture for blackbody colors |

### Critical Issue #1: Power Optimization If-Chain

**File:** `src/rendering/shaders/mandelbulb/power.glsl.ts`
**Lines:** 32-114

```glsl
// Power 2: r^2, r^1 (2 muls)
if (pwr == 2.0) {
    rPowMinus1 = r;
    rPow = r * r;
    return;
}

// Power 3: r^3, r^2 (2 muls)
if (pwr == 3.0) {
    float r2 = r * r;
    rPowMinus1 = r2;
    rPow = r2 * r;
    return;
}
// ... continues for powers 4, 5, 6, 7, 8, 9, 10
```

**Why it's a problem:** GPUs execute threads in lockstep within a warp/wavefront. When different fragments have different power values (e.g., during power animation), threads must serialize through each if-branch. With 10 sequential if statements, worst case has threads waiting while other threads execute each branch. This can reduce effective parallelism by up to 10x.

**Suggested Fix:**
```glsl
// Option A: Switch statement (better compiler optimization potential)
switch (int(pwr)) {
    case 2: rPowMinus1 = r; rPow = r * r; break;
    case 3: float r2 = r * r; rPowMinus1 = r2; rPow = r2 * r; break;
    // etc.
    default: rPow = pow(r, pwr); rPowMinus1 = pow(max(r, EPS), pwr - 1.0);
}

// Option B: Pre-compute on CPU when power is constant (best)
// Pass rPow computation method as uniform enum
```

### Critical Issue #2: Color Algorithm Dispatch

**File:** `src/rendering/shaders/shared/color/selector.glsl.ts`
**Lines:** 8-86

```glsl
if (uColorAlgorithm == 0) {
    // Algorithm 0: Monochromatic
    ...
} else if (uColorAlgorithm == 1) {
    // Algorithm 1: Analogous
    ...
} else if (uColorAlgorithm == 2) {
    // Algorithm 2: Cosine gradient palette
    ...
}
// ... continues for 11 total branches
```

**Why it's a problem:** This is the largest if/else chain in the codebase. While `uColorAlgorithm` is a uniform (all fragments take same path), the compiler must emit code for all paths. On some GPUs, sequential branch comparisons are slow.

**Suggested Fix:**
1. **Best:** Generate algorithm-specific shaders at runtime (compile only the needed algorithm)
2. **Alternative:** Use switch statement which some drivers optimize better
3. **Fallback:** Group similar algorithms to reduce code duplication

---

## High Priority Issues

| Issue | File | Lines | Type | Impact | Fix Description |
|-------|------|-------|------|--------|-----------------|
| Ternary in fractal hot loop | `mandelbulb/sdf/sdf3d.glsl.ts` | 37-38 | Branching | **High** | Pre-compute phase offsets outside loop |
| Ternary in fractal hot loop | `mandelbulb/sdf/sdf4d.glsl.ts` | 42, 91 | Branching | **High** | Pre-compute phase offsets outside loop |
| Float equality check for power | `julia/sdf/sdf3d.glsl.ts` | 43, 76 | Branching | **Medium-High** | Use `abs(pwr - 2.0) < 0.01` epsilon comparison |
| Data-dependent bailout in loop | `julia/sdf/sdf3d.glsl.ts` | 31, 72 | Branching | **High** | Unavoidable; reduce max iterations where possible |
| HSL hue calculation 3-branch | `shared/color/hsl.glsl.ts` | 17-19 | Branching | **High** | Implement branchless RGB-to-hue |
| HSL hue2rgb 4-branch | `shared/color/hsl.glsl.ts` | 24-29 | Branching | **High** | Use branchless formulation with step/mix |
| Hermite polynomial 6-branch | `schroedinger/quantum/hermite.glsl.ts` | 72-98 | Branching | **Medium-High** | Use recurrence relation or LUT |
| Legendre variable iteration | `schroedinger/quantum/legendre.glsl.ts` | 78-84 | Loop | **Medium-High** | Pre-compute common values; use specialized functions |
| Dynamic maxSteps selection | `shared/raymarch/core.glsl.ts` | 28-38 | Branching | **Medium-High** | Use branchless mix() with step() |
| 4-branch palette mode | `blackhole/gravity/manifold.glsl.ts` | 198-221 | Branching | **Medium-High** | Use switch or lookup texture |

### High Priority Issue: Phase Ternary in Hot Loop

**File:** `src/rendering/shaders/mandelbulb/sdf/sdf3d.glsl.ts`
**Lines:** 37-38

```glsl
// Inside the main iteration loop (runs 32-64 times per pixel):
float thetaN = (theta + (uPhaseEnabled ? uPhaseTheta : 0.0)) * pwr;
float phiN = (phi + (uPhaseEnabled ? uPhasePhi : 0.0)) * pwr;
```

**Why it's a problem:** Ternary operators inside the hot fractal iteration loop add overhead on every iteration.

**Suggested Fix:** Pre-compute phase offsets outside the loop (already done correctly in sdf5d-sdf11d):
```glsl
// Before loop:
float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

// Inside loop:
float thetaN = (theta + phaseT) * pwr;
float phiN = (phi + phaseP) * pwr;
```

### High Priority Issue: HSL Conversion Branches

**File:** `src/rendering/shaders/shared/color/hsl.glsl.ts`
**Lines:** 24-29

```glsl
float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 0.16667) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 0.66667) return p + (q - p) * (0.66667 - t) * 6.0;
    return p;
}
```

**Suggested Fix:** Use branchless formulation:
```glsl
float hue2rgb(float p, float q, float t) {
    t = fract(t);  // Wraps t to [0,1) without branches
    float x = p + (q - p) * 6.0 * t;
    float y = q;
    float z = p + (q - p) * (0.66667 - t) * 6.0;
    float result = mix(z, y, step(t, 0.5));
    result = mix(result, x, step(t, 0.16667));
    result = mix(p, result, step(t, 0.66667));
    return result;
}
```

---

## Medium Priority Issues

| Issue | File | Lines | Type | Impact | Fix Description |
|-------|------|-------|------|--------|-----------------|
| Inner angle loops (fixed 6 iter) | `mandelbulb/sdf/sdf8d.glsl.ts` | 30-33, 44-47 | Loop | **Medium** | Fully unroll 6-iteration inner loops |
| Inner angle loops (fixed 6 iter) | `schroedinger/sdf/sdf8d.glsl.ts` | 30-46 | Loop | **Medium** | Fully unroll 6-iteration inner loops |
| Shadow loop (32 max) | `shared/features/shadows.glsl.ts` | 19-36 | Loop | **Medium** | Add `#pragma unroll 8` or generate quality variants |
| Light type branches in loop | `shared/fractal/main.glsl.ts` | 73-84 | Branching | **Medium** | Use branchless step/mix for light type checks |
| IBL face selection 6 branches | `shared/lighting/ibl.glsl.ts` | 51-81 | Branching | **Medium** | Use lookup table approach |
| Temporal bounds check | `shared/features/temporal.glsl.ts` | 31-62 | Branching | **Medium** | Combine validity checks into single branchless computation |
| Absorption toggle in loop | `blackhole/main.glsl.ts` | 212-218 | Branching | **Medium** | Use compile-time define or branchless mix() |
| Kerr frame dragging conditional | `blackhole/gravity/lensing.glsl.ts` | 212-240 | Branching | **Medium** | Use step()/mix() for branchless |
| Opacity mode 4-branch dispatch | `shared/features/opacity.glsl.ts` | 88-100 | Branching | **Medium** | Use switch or mode-specific shaders |
| Nested 3x3 loop | `schroedinger/temporal/reconstruction.glsl.ts` | 167-183 | Loop | **Medium** | Unroll 9-iteration neighborhood loop |
| ridgedMF octave selection | `blackhole/gravity/disk-volumetric.glsl.ts` | 193-206 | Branching | **Medium** | Unroll with fixed octave counts |
| Hydrogen radial factorial loops | `schroedinger/quantum/hydrogenRadial.glsl.ts` | 51-58 | Loop | **Medium** | Use LUT for factorials up to 13! |
| MAX_TERMS loops in psi | `schroedinger/quantum/psi.glsl.ts` | 43-62 | Loop | **Medium** | Unroll for common term counts |
| Motion blur sample loop | `blackhole/effects/motion-blur.glsl.ts` | 121-140 | Loop | **Low-Medium** | Unroll 4-iteration loop with step() masking |

---

## Low Priority Issues

These issues have minimal performance impact, typically because they're uniform-based (all threads take same path) or are rare edge cases.

| Issue | File | Lines | Type | Impact | Fix Description |
|-------|------|-------|------|--------|-----------------|
| Early return on miss | Multiple raymarch files | Various | Branching | **Low** | Acceptable - prevents expensive computation |
| Uniform-based feature toggles | Multiple files | Various | Branching | **Low** | All threads take same path |
| Division guard ternary | Multiple files | Various | Branching | **Low** | Use branchless sign preservation |
| Half-vector guard ternary | `shared/lighting/ggx.glsl.ts` | 50 | Branching | **Low** | Use branchless max() divisor |
| Half-vector guard ternary | `shared/lighting/sss.glsl.ts` | 23 | Branching | **Low** | Use branchless max() divisor |
| Epsilon guards in quaternion | `julia/quaternion.glsl.ts` | 95, 101 | Branching | **Low** | Rare edge cases |
| FastNormalize zero-length guard | `shared/lighting/multi-light.glsl.ts` | 14-17 | Branching | **Low** | Use branchless mix with step |
| Hydrogen radial early exit | `schroedinger/quantum/hydrogenND*` | Various | Branching | **Low** | Intentional optimization |
| Dispatch function ternary | `mandelbulb/dispatch.glsl.ts` | 34, 46 | Branching | **Low** | Uniform coherent |
| Range attenuation check | `shared/lighting/multi-light.glsl.ts` | 80-82 | Branching | **Low** | Uniform-based |

---

## Loop Unrolling Opportunities

| File | Lines | Current Code | Iterations | Suggested Action |
|------|-------|--------------|------------|------------------|
| `mandelbulb/sdf/sdf8d.glsl.ts` | 30-33 | `for(k=0;k<6;k++)` | 6 fixed | Fully unroll |
| `mandelbulb/sdf/sdf8d.glsl.ts` | 44-47 | `for(k=2;k<6;k++)` | 4 fixed | Fully unroll |
| `schroedinger/sdf/sdf8d.glsl.ts` | 30-46 | `for(k=0;k<6;k++)` | 6 fixed | Fully unroll |
| `shared/features/shadows.glsl.ts` | 19 | `for(i=0;i<32;i++)` | 8-32 dynamic | Generate quality-specific unrolled functions |
| `shared/fractal/main.glsl.ts` | 65 | `for(i=0;i<MAX_LIGHTS;i++)` | 4-8 typical | Unroll for small MAX_LIGHTS |
| `schroedinger/temporal/reconstruction.glsl.ts` | 167-183 | Nested 3x3 | 9 fixed | Fully unroll neighborhood |
| `schroedinger/quantum/laguerre.glsl.ts` | 52-58 | `for(i=1;i<kClamped;i++)` | Variable | Use LUT for k=0,1,2,3 |
| `schroedinger/quantum/legendre.glsl.ts` | 78-84 | Variable bound | Variable | Add `#pragma unroll` hint |
| `schroedinger/quantum/ho1d.glsl.ts` | 65-88 | `for(j=0;j<MAX_DIM;j++)` | 11 max | Dimension-specific functions |
| `schroedinger/quantum/sphericalHarmonics.glsl.ts` | 77-80 | Factorial loop | Variable | Use LUT |
| `blackhole/gravity/disk-volumetric.glsl.ts` | 193-206 | Dynamic octaves | 1-4 | Full unroll with step() masking |
| `blackhole/effects/motion-blur.glsl.ts` | 121-140 | `for(i=0;i<4;i++)` | 4 fixed | Fully unroll |

### Example: Unrolling sdf8d Inner Loops

**Current Code:**
```glsl
// Lines 30-33:
for(int k=0;k<6;k++){
    t[k]=acos(clamp(z[k] / max(tail, EPS),-1.0,1.0));
    tail=sqrt(max(tail*tail-z[k]*z[k],EPS));
}
```

**Suggested Unrolled:**
```glsl
t[0]=acos(clamp(z[0] / max(tail, EPS),-1.0,1.0)); tail=sqrt(max(tail*tail-z[0]*z[0],EPS));
t[1]=acos(clamp(z[1] / max(tail, EPS),-1.0,1.0)); tail=sqrt(max(tail*tail-z[1]*z[1],EPS));
t[2]=acos(clamp(z[2] / max(tail, EPS),-1.0,1.0)); tail=sqrt(max(tail*tail-z[2]*z[2],EPS));
t[3]=acos(clamp(z[3] / max(tail, EPS),-1.0,1.0)); tail=sqrt(max(tail*tail-z[3]*z[3],EPS));
t[4]=acos(clamp(z[4] / max(tail, EPS),-1.0,1.0)); tail=sqrt(max(tail*tail-z[4]*z[4],EPS));
t[5]=acos(clamp(z[5] / max(tail, EPS),-1.0,1.0));
```

---

## Mandelbulb Shader Details

### Files Reviewed

| File | Status | Issues Found |
|------|--------|--------------|
| `renderers/Mandelbulb/mandelbulb.vert` | Clean | 0 |
| `shaders/mandelbulb/main.glsl.ts` | Issues | 8 branching |
| `shaders/mandelbulb/dispatch.glsl.ts` | Minor | 2 branching |
| `shaders/mandelbulb/power.glsl.ts` | **Critical** | 10-branch if-chain |
| `shaders/mandelbulb/uniforms.glsl.ts` | Clean | 0 |
| `shaders/mandelbulb/sdf/sdf3d.glsl.ts` | Issues | 2 ternaries in loop |
| `shaders/mandelbulb/sdf/sdf4d.glsl.ts` | Issues | 2 ternaries in loop |
| `shaders/mandelbulb/sdf/sdf5d.glsl.ts` | Good | Phase pre-computed |
| `shaders/mandelbulb/sdf/sdf6d.glsl.ts` | Good | Phase pre-computed |
| `shaders/mandelbulb/sdf/sdf7d.glsl.ts` | Good | Phase pre-computed |
| `shaders/mandelbulb/sdf/sdf8d.glsl.ts` | Issues | 2 unrollable loops |
| `shaders/mandelbulb/sdf/sdf9d.glsl.ts` | Good | Already unrolled |
| `shaders/mandelbulb/sdf/sdf10d.glsl.ts` | Good | Already unrolled |
| `shaders/mandelbulb/sdf/sdf11d.glsl.ts` | Good | Already unrolled |
| `shaders/mandelbulb/sdf/sdf-high-d.glsl.ts` | Acceptable | Variable bounds (fallback) |
| `shaders/mandelbulb/compose.ts` | N/A | TypeScript |

### Key Findings

1. **power.glsl.ts** has the most severe issue - 10 sequential if statements for power optimization
2. **sdf3d/sdf4d** have phase ternaries inside hot loops (already fixed in sdf5d+)
3. **sdf8d** has inner loops that could be unrolled (sdf9d-11d already do this)
4. Higher dimension SDFs (9d-11d) are well-optimized with unrolled inner loops

---

## Julia Shader Details

### Files Reviewed

| File | Status | Issues Found |
|------|--------|--------------|
| `renderers/QuaternionJulia/quaternion-julia.vert` | Clean | 0 |
| `shaders/julia/main.glsl.ts` | Re-exports | Uses shared/fractal |
| `shaders/julia/dispatch.glsl.ts` | Minor | 2 ternaries |
| `shaders/julia/quaternion.glsl.ts` | Issues | 7 if-statements, epsilon guards |
| `shaders/julia/uniforms.glsl.ts` | Clean | 0 |
| `shaders/julia/sdf/sdf3d.glsl.ts` | Issues | Bailout divergence, float equality |
| `shaders/julia/compose.ts` | N/A | TypeScript |

### Key Findings

1. **quaternion.glsl.ts** has 7 sequential if statements in `quatPow()` for power optimization (similar to Mandelbulb)
2. **sdf3d.glsl.ts** has float equality comparison `pwr == 2.0` which should use epsilon
3. Early bailout in iteration loop is unavoidable but causes thread divergence

---

## Schroedinger Shader Details

### Files Reviewed

| File | Status | Issues Found |
|------|--------|--------------|
| `renderers/Schroedinger/schroedinger.vert` | Clean | 0 |
| `shaders/schroedinger/main.glsl.ts` | Issues | Multiple branches |
| `shaders/schroedinger/dispatch.glsl.ts` | Minor | Fast mode ternary |
| `shaders/schroedinger/power.glsl.ts` | Issues | Power check branches |
| `shaders/schroedinger/uniforms.glsl.ts` | Clean | 0 |
| `shaders/schroedinger/quantum/complex.glsl.ts` | Clean | 0 |
| `shaders/schroedinger/quantum/hermite.glsl.ts` | Issues | 6-branch if-chain |
| `shaders/schroedinger/quantum/laguerre.glsl.ts` | Issues | Variable iteration loop |
| `shaders/schroedinger/quantum/legendre.glsl.ts` | Issues | Multiple early returns, variable loop |
| `shaders/schroedinger/quantum/ho1d.glsl.ts` | Issues | MAX_DIM loop with breaks |
| `shaders/schroedinger/quantum/hydrogenRadial.glsl.ts` | Issues | Factorial loops |
| `shaders/schroedinger/quantum/psi.glsl.ts` | **High** | Repeated quantum mode checks |
| `shaders/schroedinger/quantum/sphericalHarmonics.glsl.ts` | Issues | Factorial loop, l-value branches |
| `shaders/schroedinger/quantum/hydrogenPsi.glsl.ts` | Issues | Early exits, useReal branches |
| `shaders/schroedinger/quantum/density.glsl.ts` | Issues | Multiple mode checks |
| `shaders/schroedinger/quantum/hydrogenND/*.glsl.ts` | Minor | Early exit patterns |
| `shaders/schroedinger/sdf/sdf3d-11d.glsl.ts` | Issues | Same as Mandelbulb SDFs |
| `shaders/schroedinger/temporal/*.glsl.ts` | Issues | Multiple validity branches |
| `shaders/schroedinger/volume/*.glsl.ts` | Issues | Integration loop early exits |
| `shaders/schroedinger/compose.ts` | N/A | TypeScript |

### Key Findings

1. **psi.glsl.ts** has massive repeated quantum mode checking throughout the file
2. **Quantum polynomial functions** (hermite, laguerre, legendre) have many branches that could use LUTs
3. **Volume integration** has many early exit conditions causing thread divergence
4. **SDF files** mirror Mandelbulb patterns - sdf8d needs unrolling, sdf3d/4d have loop ternaries

---

## Black Hole Shader Details

### Files Reviewed

| File | Status | Issues Found |
|------|--------|--------------|
| `renderers/BlackHole/blackhole.vert` | Clean | 0 |
| `shaders/blackhole/main.glsl.ts` | **Critical** | 30+ branches, main raymarch loop |
| `shaders/blackhole/uniforms.glsl.ts` | Clean | 0 |
| `shaders/blackhole/effects/deferred-lensing.glsl.ts` | Issues | 3 early returns |
| `shaders/blackhole/effects/motion-blur.glsl.ts` | Issues | 5 branches, unrollable loop |
| `shaders/blackhole/gravity/colors.glsl.ts` | **Critical** | 8-branch if-chain |
| `shaders/blackhole/gravity/disk-sdf.glsl.ts` | Issues | 11 branches |
| `shaders/blackhole/gravity/disk-volumetric.glsl.ts` | Issues | Dynamic octaves, many conditionals |
| `shaders/blackhole/gravity/doppler.glsl.ts` | **High** | 6+ branches in blackbody |
| `shaders/blackhole/gravity/horizon.glsl.ts` | Minor | 3 early returns |
| `shaders/blackhole/gravity/lensing.glsl.ts` | Issues | Kerr conditional, guards |
| `shaders/blackhole/gravity/manifold.glsl.ts` | Issues | 4-branch palette mode |
| `shaders/blackhole/gravity/shell.glsl.ts` | Clean | Mostly arithmetic |
| `shaders/blackhole/compose.ts` | N/A | TypeScript |

### Key Findings

1. **main.glsl.ts** is the most complex shader with 30+ branching points
2. **colors.glsl.ts** has an 8-branch if-chain for color algorithms (same pattern as shared selector)
3. **doppler.glsl.ts** blackbody calculation has 6+ branches that should use a LUT
4. **disk-volumetric.glsl.ts** has dynamic octave selection that could be unrolled
5. **motion-blur.glsl.ts** has a 4-iteration loop that should be unrolled

---

## Shared Module Details

### Files Reviewed

| File | Status | Issues Found |
|------|--------|--------------|
| `shared/core/precision.glsl.ts` | Clean | 0 |
| `shared/raymarch/core.glsl.ts` | Issues | 8 branches, 1 loop |
| `shared/raymarch/sphere-intersect.glsl.ts` | Minor | 1 early return |
| `shared/features/ao.glsl.ts` | Clean | Already unrolled |
| `shared/features/opacity.glsl.ts` | Issues | 4-branch mode dispatch |
| `shared/features/shadows.glsl.ts` | Issues | Dynamic loop, early exit |
| `shared/features/temporal.glsl.ts` | Issues | 5 validity branches |
| `shared/color/selector.glsl.ts` | **Critical** | 11-branch if-chain |
| `shared/color/cosine-palette.glsl.ts` | Clean | 0 |
| `shared/color/hsl.glsl.ts` | **High** | 8 branches total |
| `shared/color/oklab.glsl.ts` | Clean | 0 |
| `shared/lighting/ggx.glsl.ts` | Minor | 1 guard ternary |
| `shared/lighting/sss.glsl.ts` | Minor | 1 guard ternary |
| `shared/fractal/main.glsl.ts` | **High** | 10 branches, light loop |
| `shared/fractal/compose-helpers.ts` | N/A | TypeScript |

### Key Findings

1. **selector.glsl.ts** 11-branch color algorithm chain affects ALL fractal objects
2. **hsl.glsl.ts** has multiple branchless conversion opportunities
3. **main.glsl.ts** light loop affects all fractals - consider generating light-count variants
4. **shadows.glsl.ts** could have quality-specific unrolled variants

---

## Recommended Fix Priority

### Phase 1: Critical (Immediate Impact)

1. **`mandelbulb/power.glsl.ts`** - Convert 10-branch if-chain to switch or pre-compute
2. **`shared/color/selector.glsl.ts`** - Generate color algorithm-specific shaders
3. **`blackhole/gravity/colors.glsl.ts`** - Same as above

### Phase 2: High Impact

4. **`mandelbulb/sdf/sdf3d.glsl.ts`** - Pre-compute phase offsets outside hot loops
5. **`mandelbulb/sdf/sdf4d.glsl.ts`** - Same as above
6. **`shared/color/hsl.glsl.ts`** - Implement branchless HSL conversion
7. **`blackhole/gravity/doppler.glsl.ts`** - Use LUT texture for blackbody

### Phase 3: Medium Impact

8. **`mandelbulb/sdf/sdf8d.glsl.ts`** - Unroll fixed-count inner loops
9. **`schroedinger/sdf/sdf8d.glsl.ts`** - Same as above
10. **`shared/features/shadows.glsl.ts`** - Generate quality-specific variants
11. **`shared/fractal/main.glsl.ts`** - Generate variants for 1/2/4 lights
12. **Schroedinger quantum functions** - Use LUTs for polynomial evaluation

### Phase 4: Polish

13. Convert remaining ternaries to branchless step/mix patterns
14. Add `#pragma unroll` hints where beneficial
15. Profile and validate improvements

---

## Branchless Pattern Reference

### Ternary to Branchless

```glsl
// Before (branching):
float result = condition ? valueA : valueB;

// After (branchless):
float result = mix(valueB, valueA, float(condition));
// Or:
float result = mix(valueB, valueA, step(threshold, value));
```

### If-Block to Branchless

```glsl
// Before (branching):
if (x > 0.5) {
    result = a;
} else {
    result = b;
}

// After (branchless):
float selector = step(0.5, x);
result = mix(b, a, selector);
```

### Early Return to Accumulator

```glsl
// Before (branching):
if (condition) return earlyValue;
// ... expensive computation
return computedValue;

// After (branchless):
float useEarly = float(condition);
float computed = /* expensive computation */;
return mix(computed, earlyValue, useEarly);
```

### Loop with Dynamic Exit to Fixed Unrolled

```glsl
// Before (dynamic exit):
for (int i = 0; i < 4; i++) {
    if (i >= count) break;
    result += process(i);
}

// After (unrolled with masking):
result += process(0) * step(0.5, float(count));
result += process(1) * step(1.5, float(count));
result += process(2) * step(2.5, float(count));
result += process(3) * step(3.5, float(count));
```

---

## Notes

- **Uniform-based branches** (where all threads take the same path) are less severe but still add instruction overhead
- **Data-dependent branches** (where thread behavior varies per pixel) cause the most severe performance impact
- **Early returns in raymarching** are generally acceptable as the performance gain outweighs divergence cost
- **LUT textures** for complex functions (blackbody, polynomials) can dramatically reduce instruction count
- **Shader variants** generated at compile time eliminate runtime branching entirely

---

*Generated by comprehensive shader review - 2025-12-29*
