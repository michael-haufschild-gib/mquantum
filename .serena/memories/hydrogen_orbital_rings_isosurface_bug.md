# Hydrogen Orbital Rings Disappearing in Isosurface Mode

## Bug Summary
When hydrogen orbitals with lobes + rings (e.g., n=3, l=2, m=0) are rendered in isosurface mode, only the lobes are visible. The rings (which are visible in volumetric mode) completely vanish.

## Root Cause: Fixed Isosurface Threshold

The bug is in the isosurface raymarching algorithm. The isosurface mode uses a FIXED log-density threshold to determine the surface, while volumetric mode shows the ENTIRE density field regardless of threshold.

### Key Facts:

1. **Default Isosurface Threshold**: `isoThreshold = -0.76` (log-density in natural log)
   - Location: `src/lib/geometry/extended/types.ts` line 638
   - Clamped range: -6 to 0 in UI (`setSchroedingerIsoThreshold` in schroedingerSlice.ts, line 544)

2. **Log-Density Computation**: 
   - `s = log(rho + DENSITY_EPS)` where `DENSITY_EPS = 1e-8`
   - Source: `src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts` lines 116-118
   - This maps probability density ρ to log space for stability

3. **Isosurface Threshold Test** (main.wgsl.ts, lines 479-502):
   ```wgsl
   let s = sFromRho(rho);        // Convert density to log-density
   let gap = s - threshold;      // Line 479: compute gap = log(rho) - isoThreshold
   
   if (gap > 0.0) {              // Line 482: if log(rho) > isoThreshold, hit surface
     // Binary search refinement
   }
   ```
   The raymarcher only records a HIT when `log(rho) > isoThreshold`.

## Why Rings Disappear

### Hydrogen orbital wavefunction structure:
- **Lobes**: Regions where |ψ| is maximum (ρ = |ψ|² is LARGE)
- **Rings**: Nodal circles between lobes where |ψ| goes to zero but has intermediate values (ρ is SMALL)

### Physics example: n=3, l=2, m=0 (d orbital)
- Two main lobes along z-axis with ρ_max ~ 0.3-0.5
- A ring around the equator (z=0 plane) with ρ_ring ~ 0.02-0.05
- Many smaller ripples

### The threshold problem:
```
ρ_lobe = 0.4  →  s = log(0.4 + 1e-8) = -0.916 > -0.76  ✓ VISIBLE
ρ_ring = 0.03 →  s = log(0.03 + 1e-8) = -3.51 < -0.76  ✗ INVISIBLE
```

When `isoThreshold = -0.76`, only high-density regions (lobes) satisfy `log(ρ) > -0.76`.
Low-density regions (rings, shoulders) fail the threshold test and are never visited by the raymarcher.

## The Volumetric Path Shows Rings

In volumetric rendering (`src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`):
- The raymarcher uses `volumeRaymarch()` or `volumeRaymarchHQ()` from integration.wgsl.ts
- It accumulates density at EVERY step along the ray, not just where it crosses a threshold
- Low-density regions are rendered with low alpha (transparency), but they ARE rendered
- This is why rings appear dimly but visibly in volumetric mode

## File Locations & Code Sections

| File | Lines | Role |
|------|-------|------|
| `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts` | 421-502 | Isosurface fragment shader main loop; threshold test at line 479-502 |
| `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts` | 31-137 | Volumetric fragment shader (shows rings) |
| `src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts` | 116-118 | `sFromRho()` function: converts ρ to log-density |
| `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts` | 195 | `isoThreshold` uniform definition |
| `src/lib/geometry/extended/types.ts` | 418-420, 637-638 | Type definition & default value |
| `src/stores/slices/geometry/schroedingerSlice.ts` | 543-544 | `setSchroedingerIsoThreshold()` setter |

## Critical Shader Code: Isosurface Threshold Test

**Location**: `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts` lines 441-512

```wgsl
// Line 441
let threshold = schroedinger.isoThreshold;  // Default: -0.76

// Line 444
let isoGain = max(schroedinger.densityGain, 0.01);

// Lines 470-512: Main march loop
for (var i = 0; i < 128; i++) {
  let pos = ro + rd * t;
  var rho: f32;
  // Sample density from wavefunction
  rho = sampleDensity(pos, animTime, schroedinger) * isoGain;
  
  // Line 478-479: Convert to log-density and compute gap from threshold
  let s = sFromRho(rho);
  let gap = s - threshold;
  
  // Line 482: ONLY accept surface hit if gap > 0.0
  if (gap > 0.0) {
    // Binary search refinement (lines 483-496)
    // Converge to exact surface location where log(ρ) = threshold
    break;
  }
  
  // Lines 500-502: Alternative: accept hit if very close to threshold
  if (gap > -stConvergeEps) {  // stConvergeEps = 0.05 (line 463)
    hitT = t;
    break;
  }
}
```

## Hypothesis: Why Rings Are Lost

1. **Threshold is too high** for the ring structures
   - At default `-0.76`, only ρ > ~0.47 satisfies the threshold
   - Rings typically have ρ ~ 0.01-0.05, so log(ρ) ~ -4.6 to -2.99 (way below threshold)
   - The raymarcher steps through ring regions without hitting them

2. **No fallback for low-density surfaces**
   - The convergence condition `gap > -0.05` (line 500) only activates if already close
   - For a ray that never enters the threshold region, it never gets close enough

3. **Binary search only refines when threshold is crossed**
   - Lines 483-496 only execute if `gap > 0.0` (threshold exceeded)
   - If the ray misses the threshold entirely, the search never activates

## Solution Approaches

1. **Lower isoThreshold default** (simplest, user-facing)
   - Change default from `-0.76` to `-2.0` or `-3.0`
   - Allows rings to render, but may make surface feel "thinner"
   - User can adjust via UI slider (currently -6 to 0)

2. **Adaptive threshold per orbital** (smarter, automatic)
   - Compute `peakDensity` per quantum state
   - Set threshold to `log(peakDensity * 0.05)` to capture 5% of lobe height
   - Allows rings without manual tuning

3. **Fallback ray continuation** (robust, no quality loss)
   - If ray exits bounding sphere without hit, re-march with lower threshold
   - Preserves lobe sharpness while capturing rings

4. **Toggle/mode for "rings rendering"** (explicit control)
   - Add UI option: "Render Rings in Isosurface Mode"
   - Uses adaptive threshold when enabled

## Related Quantum Numbers

Hydrogen orbitals with visible rings (intermediate l, m values):
- **n=3, l=2, m=0**: Two lobes + one ring
- **n=3, l=2, m=1**: Complex 3D structure with multiple rings
- **n=4, l=3, m=0**: Three lobes + rings
- **n=3, l=1, m=0**: One lobe (pz) + smaller ring structures
- **n=2, l=1, m=0**: pz orbital (single lobe, no rings)
- **n=2, l=1, m=1**: px orbital (single lobe complex structure)

Key: any n with l > 0 and appropriate m can have ring structures between lobes.

## Recommendations for Fix

**Quick fix (2 lines changed)**:
- In `src/lib/geometry/extended/types.ts` line 638: change `isoThreshold: -0.76` to `isoThreshold: -2.0`
- Adjust UI clamp if needed (currently -6 to 0, which is already broad enough)

**Better fix (10-20 lines)**:
- Compute adaptive threshold based on orbital quantum numbers in store
- Scale threshold relative to `peakDensity` from quantum state
- Ensures rings visible for all orbitals while preserving lobe geometry

**Future enhancement**:
- Add "Ring Visibility" slider in UI that controls relative threshold
- Allows user to smoothly dial in/out ring visibility without math knowledge
