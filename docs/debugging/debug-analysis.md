# Black Hole Event Horizon Transparency Debug Analysis

## Problem
Event horizon remains transparent despite absorption code being added.

## Code Flow Analysis

### Key Variables (for non-spinning black hole)
- `uHorizonRadius = 2.0` (Schwarzschild radius)
- `uVisualEventHorizon = 2.0` (same as Schwarzschild for spin=0)
- `uHorizonAbsorption = 8.0` (default)
- `horizonAbsorptionStart = 2.0 * 1.5 = 3.0` (photon sphere)
- `horizonAbsorptionEnd = 2.0` (visual horizon)

### Raymarching Flow
1. Ray starts far away, marches inward
2. At each step, calculates `ndRadius = ndDistance(pos)`
3. Checks `isInsideHorizon(ndRadius)` which returns true if `ndRadius < 2.0 * 0.1 = 0.2`
4. If inside horizon (r < 0.2), sets transmittance to 0 and breaks
5. Otherwise, applies absorption if in zone

### Absorption Zone Condition (Line 287)
```glsl
if (ndRadius < horizonAbsorptionStart && ndRadius > horizonAbsorptionEnd * 0.1)
// if (ndRadius < 3.0 && ndRadius > 2.0 * 0.1)
// if (ndRadius < 3.0 && ndRadius > 0.2)
```

This means absorption applies when radius is between 0.2 and 3.0.

### Absorption Calculation
```glsl
horizonProximity = 1.0 - smoothstep(2.0, 3.0, ndRadius)
```
- At r = 2.0: smoothstep returns 0.0, proximity = 1.0 (strongest)
- At r = 3.0: smoothstep returns 1.0, proximity = 0.0 (weakest)
- At r = 0.2: smoothstep returns 0.0 (clamped), proximity = 1.0 (strongest)

```glsl
horizonAbsorb = exp(-proximity² * 8.0 * stepSize)
accum.transmittance *= horizonAbsorb
```

### Expected Behavior
For a ray marching from r=3.0 to r=0.2:
- At r=3.0: proximity=0, no absorption
- At r=2.5: proximity=0.5, absorb ~exp(-0.25 * 8 * 0.02) ≈ 0.96
- At r=2.0: proximity=1.0, absorb ~exp(-1.0 * 8 * 0.02) ≈ 0.85
- At r=0.2: proximity=1.0, absorb ~exp(-1.0 * 8 * 0.02) ≈ 0.85

Over ~50-100 steps: transmittance should → 0

## Potential Issues

### 1. CRITICAL: Step Size Near Horizon
From `adaptiveStepSize()` line 54:
```glsl
step *= mix(0.1, 1.0, horizonFactor);
```
Near horizon, step is reduced to 0.1x base step. If base is 0.2, stepSize ≈ 0.02.

With stepSize = 0.02:
- horizonAbsorb = exp(-1.0 * 8.0 * 0.02) = exp(-0.16) = 0.852
- Only 14.8% absorption per step!

### 2. POTENTIAL BUG: Not Enough Steps
If the ray doesn't take enough steps through the absorption zone, it won't absorb completely.

### 3. POTENTIAL BUG: Condition Edge Case
The condition uses `horizonAbsorptionEnd * 0.1` which equals `2.0 * 0.1 = 0.2`.
But `isInsideHorizon` breaks at `r < 0.2`.
This means the absorption zone END exactly matches the horizon break point!

**This could be a race condition**: If the ray reaches r=0.2 and breaks BEFORE applying absorption at that step, the last few critical steps might be skipped.

### 4. Loop Break Timing Issue
The horizon check (line 270) happens BEFORE the absorption zone (line 287).
If ndRadius = 0.15 (inside horizon):
1. Line 270: `isInsideHorizon(0.15)` returns true
2. Line 271: transmittance = 0, hitHorizon = true
3. Line 274: BREAK

The absorption code at line 287 NEVER runs for this step!

But this is fine because transmittance is already 0.

### 5. ACTUAL BUG FOUND: Absorption Happens AFTER Horizon Check

Wait - looking at the order:
1. Line 264: Calculate ndRadius
2. Line 270: Check if inside horizon (r < 0.2) → break if true
3. Line 278: Calculate stepSize
4. Line 287: Apply absorption (r between 0.2 and 3.0)

The absorption at line 287 applies in the CURRENT step.
Then the ray advances: `pos += dir * stepSize` (not shown in this snippet).
NEXT iteration, it checks horizon again.

So if ray is at r=0.25 in one step:
- Not inside horizon, continues
- Applies absorption
- Advances toward black hole
- Next step might be r=0.18 → breaks

This seems correct.

## Hypothesis: Absorption Strength Too Weak

The issue might be that with stepSize ≈ 0.02, the absorption per step is only 14.8%.
Even over 100 steps, if most steps are at low proximity (far from horizon), total absorption might not be enough.

Let me calculate more carefully:
- Absorption zone: r ∈ [0.2, 3.0], distance = 2.8 units
- Step size: ~0.02 to 0.2 (adaptive)
- Average steps through zone: ~50-100 steps

But horizonProximity varies:
- At r=3.0: proximity=0, absorption=1.0 (no absorption)
- At r=2.5: proximity=0.5, absorption=exp(-2.0*0.02)=0.96
- At r=2.0: proximity=1.0, absorption=exp(-8.0*0.02)=0.85
- At r=1.0: proximity=1.0, absorption=exp(-8.0*0.02)=0.85
- At r=0.2: proximity=1.0, absorption=exp(-8.0*0.02)=0.85

Most of the path (r=3.0 to r=2.0) has weak absorption!
Only the inner zone (r=2.0 to r=0.2) has strong absorption.

Distance r=2.0 to r=0.2 = 1.8 units
Steps: ~90 steps (at 0.02 per step)
Transmittance: 0.85^90 ≈ 0.000002

That SHOULD be opaque!

## Next Steps
1. ✅ Add debug visualization (red tint) - DONE
2. Run dev server and visually check if red tint appears
3. If no red tint: shader compilation or hot-reload issue
4. If red tint but still transparent: increase absorption strength or fix accumulation
