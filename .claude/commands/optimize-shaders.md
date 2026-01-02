---
description: Deep shader performance optimization with GPU profiling
---

# Mission

You are performing **autonomous deep shader optimization** for a WebGL raymarching application that renders animated N-dimensional mathematical objects.

---

## CRITICAL CONSTRAINT: ZERO VISUAL QUALITY LOSS

**This is absolute and non-negotiable.**

```
==========================================================
  VISUAL FIDELITY IS SACRED. DO NOT COMPROMISE IT. EVER.
==========================================================
```

**Success criteria**: Achieve measurable FPS improvement during animation with **ZERO change to visual output**. The render must be **pixel-identical** before and after optimization.

If you cannot find optimizations that preserve visual quality, **report that finding** rather than implementing quality-degrading changes.

---

## Application Context: Animated N-Dimensional Objects

This application exists to **animate** complex mathematical objects:

- Objects **continuously rotate** around one or more planes
- Supported dimensions: **3D through 11D**
- Users watch these objects animate - that's the core experience
- **Animation performance IS the product**

### Object Types

| Type | Description | Expensive Operations |
|------|-------------|---------------------|
| **Mandelbulb/Julia** | Fractal SDFs via escape-time iteration | `pow()`, `atan()`, trig functions in loops |
| **Schrödinger** | Quantum wavefunction volumetric rendering | Wavefunction sampling, Beer-Lambert integration |
| **Black Hole** | Kerr metric raymarching with accretion disk | Metric tensor computation, gravitational lensing |

All use **raymarching** with high iteration counts for visual fidelity.

---

# FORBIDDEN Optimizations

**NEVER implement these. They degrade visual quality.**

| Forbidden Technique | Why It's Forbidden |
|--------------------|--------------------|
| Fast math approximations (`acosApprox`, `atanApprox`, `fastSqrt`) | Accumulates error in iterative fractals, visibly distorts geometry |
| Reducing `MAX_MARCH_STEPS` or `MAX_ITER` | Loses fine detail, misses thin features |
| Increasing `SURF_DIST` / surface threshold | Makes surfaces rougher, loses sharp edges |
| "Fast mode" / "Low quality during animation" | **Animation IS the use case** - this defeats the purpose |
| Reducing shadow samples | Causes shadow banding and aliasing |
| Skipping AO/SSS/effects during animation | Visible pop-in when animation stops |
| Texture LOD biasing | Blurs details |
| Temporal reprojection that causes ghosting | Visible artifacts during rotation |
| Any approximation in the SDF inner loop | Fractals amplify errors exponentially |

### Why "Lower Quality While Animating" Is Unacceptable

The user asked explicitly:
> "I never want to see something like 'lower quality while animating'"

The entire purpose of this application is to watch animated objects. Degrading quality during animation means degrading quality 100% of the time the user cares about. **This is not a valid optimization strategy.**

---

# ALLOWED Optimizations

**These preserve visual output while improving performance.**

## Category 1: Eliminate Redundant Work

```glsl
// BEFORE: Same calculation done twice
float r = sqrt(x*x + y*y + z*z);
// ... 20 lines later ...
float r2 = sqrt(x*x + y*y + z*z);  // REDUNDANT

// AFTER: Cache and reuse
float r = sqrt(x*x + y*y + z*z);
// ... 20 lines later, use r ...
```

## Category 2: Defer Expensive Operations

```glsl
// BEFORE: sqrt inside loop when only comparing
for (int i = 0; i < n; i++) {
    if (sqrt(distSq) < threshold) break;
}

// AFTER: Compare squared values (mathematically identical)
float thresholdSq = threshold * threshold;
for (int i = 0; i < n; i++) {
    if (distSq < thresholdSq) break;
}
```

## Category 3: Better Early Exit (Same Visual Result)

```glsl
// Early exit when we KNOW the result won't change
// Only valid if the exit condition guarantees identical output
if (dO > maxT) break;  // Already past maximum distance - would miss anyway
```

## Category 4: Reduce Memory Bandwidth

- Smaller uniform buffers
- Better texture formats (same visual quality, less bandwidth)
- Avoid redundant texture fetches of same coordinate

## Category 5: GPU Occupancy Improvements

- Reduce register pressure (same math, better packing)
- Avoid thread divergence where possible
- Better workgroup sizing

## Category 6: Pass Optimization

- Merge passes that read/write the same data
- Eliminate passes that produce unused outputs
- Reduce render target resolution ONLY if it doesn't affect final output (e.g., intermediate buffers that get upsampled correctly)

## Category 7: Precision Selection (When Visually Identical)

```glsl
// ONLY for values that don't affect final color/position
mediump float orbitTrap;  // Used for coloring variation, not geometry
// NEVER reduce precision for:
// - Position calculations
// - Distance estimations
// - Normal calculations
// - Anything in the SDF loop
```

---

# Prerequisites: Browser Access

## Required: Chrome DevTools MCP

This command requires the **Chrome DevTools MCP** to be running. Check if it's available by looking for `mcp__chrome-devtools__*` tools.

**If Chrome DevTools MCP is NOT available:**
```
STOP - Chrome DevTools MCP is required but not connected.

Ask the user:
"The Chrome DevTools MCP is not available. Please:
1. Start Chrome with remote debugging enabled
2. Ensure the Chrome DevTools MCP server is running
3. Run /mcp to reconnect

Then re-run this command."
```

**If Chrome DevTools MCP IS available:** Proceed with the workflow.

## Object-Specific URLs

The dev server runs at `http://localhost:3000`. Use these URLs to test specific objects:

| Object | URL |
|--------|-----|
| Mandelbulb | `http://localhost:3000/?t=mandelbulb` |
| Julia | `http://localhost:3000/?t=quaternion-julia` |
| Schrödinger | `http://localhost:3000/?t=schroedinger` |
| Black Hole | `http://localhost:3000/?t=blackhole` |

---

# Phase 1: Baseline Measurement

## Step 1.1: Navigate to Target Object

Use Chrome DevTools MCP to navigate to the object you want to optimize.

Wait for the scene to fully load and render.

## Step 1.2: Capture Reference Screenshot

**CRITICAL**: Before any optimization, capture a reference screenshot:

```javascript
// Take reference screenshot for visual comparison
```

Save this as the **ground truth**. All optimizations must produce **identical output**.

## Step 1.3: Collect Baseline Performance Data

Use Chrome DevTools MCP to execute in the browser console:

```javascript
// Enable GPU timing and start logging
window.__PROFILER__.enable()
window.__PROFILER__.startLogging(3000)
```

**Wait 15-20 seconds** for data to accumulate (object should be animating), then execute:

```javascript
// Get the slowest passes
JSON.stringify(window.__PROFILER__.getSlowestPasses(10), null, 2)
```

**Record this output** - you need it to measure improvement later.

Also get the FPS baseline:
```javascript
window.__PROFILER__.getSummary()
```

## Step 1.4: Identify the Bottleneck Pass

From the profiler output, identify:
1. Which pass has the highest `gpu` time
2. Whether it has `"warning": "high"` or `"warning": "exceeds budget"`

**Decision tree**:
- If `ScenePass` or object-specific pass is slowest → Analyze the raymarching shader
- If a post-processing pass is slowest → Read the pass implementation in `src/rendering/graph/passes/`

---

# Phase 2: Visual Performance Analysis

## Step 2.1: Enable Iteration Heatmap

Use Chrome DevTools MCP to execute:

```javascript
window.__PROFILER__.setDebugMode(1)
```

This renders a **green→yellow→red gradient** based on raymarch iterations:
- **Green**: Few iterations (fast pixels)
- **Yellow**: Moderate iterations
- **Red**: Many iterations (expensive pixels)

## Step 2.2: Capture and Analyze the Heatmap

Take a screenshot of the heatmap visualization.

Look for **optimization opportunities that don't affect quality**:

| Pattern | Meaning | Quality-Safe Optimization |
|---------|---------|--------------------------|
| Red in empty space | Wasted iterations on guaranteed misses | Tighter bounding volume (same visual result) |
| Uniform distribution | Well-optimized already | Look elsewhere |
| Red at edges only | Normal behavior | No action needed |

## Step 2.3: Disable Heatmap When Done

```javascript
window.__PROFILER__.setDebugMode(0)
```

---

# Phase 3: Shader Source Analysis

Based on which pass is the bottleneck, read the relevant shader files.

## Key Shader Locations

```
src/rendering/shaders/mandelbulb/sdf/     # Mandelbulb distance functions
src/rendering/shaders/julia/sdf/          # Julia distance functions
src/rendering/shaders/schroedinger/       # Schrödinger volume rendering
src/rendering/shaders/blackhole/          # Black hole raymarching
src/rendering/shaders/shared/raymarch/    # Shared raymarch core
src/rendering/shaders/shared/features/    # Shadows, AO, etc.
src/rendering/graph/passes/               # Render pass implementations
```

## What to Look For (Quality-Preserving Only)

**Redundant calculations:**
```glsl
// RED FLAG: Same value computed multiple times
float r = sqrt(x*x + y*y + z*z);
// ... code that doesn't modify x, y, z ...
float r2 = sqrt(x*x + y*y + z*z);  // REDUNDANT - use r instead
```

**Deferred operations:**
```glsl
// RED FLAG: sqrt() used only for comparison
if (sqrt(distSq) < threshold) { ... }
// OPTIMIZATION: Compare squared values (identical result)
if (distSq < threshold * threshold) { ... }
```

**Dead code:**
```glsl
// RED FLAG: Code that never executes or results never used
float unused = expensiveCalculation();  // Value never read
```

**Inefficient branching:**
```glsl
// RED FLAG: Uniform-based branch that could be compile-time
if (uSomeFeatureEnabled) { /* always true in this build */ }
// Could use #ifdef instead for zero runtime cost
```

---

# Phase 4: Implement Optimizations

## Before Writing Any Code

Ask yourself:
1. **Will this change ANY pixel in the output?** If yes → STOP, do not implement
2. **Is this mathematically equivalent?** If uncertain → STOP, verify first
3. **Does this affect the SDF inner loop?** If yes → Be extremely careful

## Implementation Guidelines

1. Make **one optimization at a time**
2. After each change, **verify visual output matches reference**
3. If output differs by even one pixel, **revert immediately**
4. Document each change with clear reasoning

## Safe Optimization Examples

### Caching Repeated Calculations

```glsl
// BEFORE
float a = expensive(x);
float b = expensive(x);  // Same input!

// AFTER (mathematically identical)
float cached = expensive(x);
float a = cached;
float b = cached;
```

### Squared Distance Comparison

```glsl
// BEFORE
if (length(v) < threshold) { ... }

// AFTER (mathematically identical)
if (dot(v, v) < threshold * threshold) { ... }
```

### Early Exit on Guaranteed Miss

```glsl
// BEFORE
// Always march full distance even when clearly outside bounds

// AFTER (same visual result - would have missed anyway)
if (distanceFromBounds > maxPossibleHit) return MISS;
```

---

# Phase 5: Verification

## Step 5.1: Visual Verification (MANDATORY)

After each optimization:

1. **Refresh the page** to ensure changes are applied
2. **Take a new screenshot**
3. **Compare with reference screenshot**
4. **If ANY visual difference exists → REVERT THE CHANGE**

Visual verification is not optional. Do not skip this step.

## Step 5.2: Measure Performance Improvement

```javascript
window.__PROFILER__.enable()
window.__PROFILER__.startLogging(3000)
```

Wait 15-20 seconds with animation running, then:

```javascript
JSON.stringify(window.__PROFILER__.getSlowestPasses(10), null, 2)
window.__PROFILER__.getSummary()
```

## Step 5.3: Validate Results

**Required conditions for success:**
1. Visual output is **identical** to reference
2. FPS improved OR GPU time decreased
3. No new visual artifacts during animation
4. No flickering, popping, or temporal issues

If condition #1 is not met, the optimization is **rejected** regardless of performance gain.

---

# Decision Matrix

| Observation | Quality-Safe Action |
|-------------|-------------------|
| Redundant sqrt/length calls | Cache and reuse |
| Same texture sampled multiple times at same UV | Cache the sample |
| Uniform-based branches with constant values | Use preprocessor defines |
| Calculations outside loop that could be inside | Move inside (if cheaper) OR vice versa |
| Squared values compared via sqrt | Compare squared directly |
| Dead code paths | Remove entirely |
| Passes writing to unused buffers | Disable the pass |

---

# What To Do If No Safe Optimizations Exist

If after thorough analysis you find:
- All redundant calculations are already eliminated
- No dead code exists
- Bounding volumes are already tight
- No passes can be merged or eliminated

Then **report this finding**:

```
Analysis complete. No quality-preserving optimizations identified.

Current performance:
- FPS: X
- Slowest pass: Y (Z ms)

The shader code is already well-optimized for quality-preserving performance.
Further improvements would require quality trade-offs, which are not permitted.

Potential areas for future investigation:
- [List any architectural changes that might help]
- [Hardware-specific optimizations]
- [WebGPU migration possibilities]
```

This is a valid outcome. Not every codebase has low-hanging optimization fruit.

---

# Output Format

When you complete this optimization session, provide:

1. **Baseline** (during animation)
   - FPS:
   - Total GPU time:
   - Slowest pass:

2. **Changes Made**
   - List each optimization with file path and line numbers
   - Explain why each is quality-preserving

3. **Results** (during animation)
   - FPS:
   - Total GPU time:
   - Slowest pass:

4. **Improvement**
   - Percentage FPS improvement:
   - Percentage GPU time reduction:

5. **Visual Verification**
   - Confirm: "Visual output verified identical to baseline"
   - OR: "No optimizations implemented - all changes reverted due to visual differences"

---

# Constraints Summary

| Rule | Enforcement |
|------|-------------|
| Zero visual quality loss | **ABSOLUTE** - no exceptions |
| No "fast mode" quality reduction | **ABSOLUTE** - animation is the use case |
| No math approximations in SDF | **ABSOLUTE** - fractals amplify errors |
| Visual verification after each change | **MANDATORY** |
| Revert if any pixel differs | **MANDATORY** |
| WebGL2 / GLSL ES 3.00 compatibility | Required |
| Test with animation running | Required |
