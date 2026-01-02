---
description: Deep shader performance optimization with GPU profiling
---

# Mission

You are performing **autonomous deep shader optimization** for a WebGL raymarching application. Your goal is to identify specific performance bottlenecks within shaders and implement concrete optimizations that measurably improve frame rate.

**Success criteria**: Achieve measurable FPS improvement (document before/after metrics) while maintaining visual quality.

## Context: What This Application Renders

This is a 3D visualization app rendering complex mathematical objects:
- **Mandelbulb/Julia**: Fractal SDFs using iterative distance estimation (expensive: `pow()`, `atan()`, trigonometric functions in loops)
- **Schrödinger**: Quantum wavefunction volumetric rendering (expensive: wavefunction sampling, Beer-Lambert integration)
- **Black Hole**: Kerr metric raymarching with accretion disk (expensive: metric tensor computation, disk sampling, gravitational lensing)

All use **raymarching** - the main performance concern is iteration count and per-iteration cost.

---

# Prerequisites: Browser Access

## Required: Chrome DevTools MCP

This command requires the **Chrome DevTools MCP** to be running. Check if it's available by looking for `mcp__chrome-devtools__*` tools.

**If Chrome DevTools MCP is NOT available:**
```
⚠️ STOP - Chrome DevTools MCP is required but not connected.

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

## Step 1.1: Start the Dev Server

```bash
npm run dev
```

Wait for compilation. The app runs at `http://localhost:3000`.

## Step 1.2: Navigate to Target Object

Use Chrome DevTools MCP to navigate to the object you want to optimize:

```javascript
// Example: Navigate to Mandelbulb
// Use the appropriate URL from the table above
```

Wait for the scene to fully load and render.

## Step 1.3: Collect Baseline Performance Data

Use Chrome DevTools MCP to execute in the browser console:

```javascript
// Enable GPU timing and start logging
window.__PROFILER__.enable()
window.__PROFILER__.startLogging(3000)
```

**Wait 15-20 seconds** for data to accumulate, then execute:

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
- If `ScenePass` or object-specific pass (MandelbulbPass, BlackHolePass, etc.) is slowest → Proceed to Phase 2
- If a post-processing pass (BloomPass, SSAOPass, etc.) is slowest → Read the pass implementation in `src/rendering/graph/passes/` and optimize there instead

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
- **Red**: Many iterations (slow pixels - optimization targets)

## Step 2.2: Capture and Analyze the Heatmap

Use Chrome DevTools MCP to take a screenshot of the heatmap visualization.

Look for patterns:
- **Red at object edges**: Normal - edges require more iterations to resolve
- **Red in empty space**: BAD - wasted iterations on misses. Fix: improve bounding volume culling
- **Uniform red across object**: BAD - too many iterations everywhere. Fix: reduce MAX_MARCH_STEPS or improve early termination
- **Red at specific features**: The math for that feature is expensive. Fix: simplify that specific calculation

## Step 2.3: Disable Heatmap When Done

Use Chrome DevTools MCP to execute:

```javascript
window.__PROFILER__.setDebugMode(0)
```

---

# Phase 3: Shader Source Analysis

Based on which pass is the bottleneck, read the relevant shader files:

## For Mandelbulb (fractal SDF):

```
src/rendering/shaders/mandelbulb/sdf/de.glsl.ts       # Distance estimator
src/rendering/shaders/shared/raymarch/core.glsl.ts   # Raymarch loop
src/rendering/shaders/shared/fractal/main.glsl.ts    # Main shader
```

**Key functions to analyze**:
- `DE()` or `GetDist()` - the SDF distance function (called every iteration)
- `RayMarchCore()` - the main loop
- Look for: `pow()`, `sin()`, `cos()`, `atan()`, `sqrt()` - these are expensive

## For Julia (quaternion fractal):

```
src/rendering/shaders/julia/sdf/                     # Julia-specific SDF
src/rendering/shaders/shared/raymarch/core.glsl.ts   # Shared raymarch
```

## For Schrödinger (volumetric):

```
src/rendering/shaders/schroedinger/volume/integration.glsl.ts  # Volume integration
src/rendering/shaders/schroedinger/volume/sampling.glsl.ts     # Density sampling
src/rendering/shaders/schroedinger/main.glsl.ts                # Main shader
```

**Key functions to analyze**:
- `volumeRaymarch()` / `volumeRaymarchHQ()` - the integration loop
- `sampleDensity()` - wavefunction evaluation (called every sample)

## For Black Hole:

```
src/rendering/shaders/blackhole/main.glsl.ts         # Main shader with all physics
src/rendering/shaders/blackhole/disk.glsl.ts         # Accretion disk
src/rendering/shaders/blackhole/metric.glsl.ts       # Kerr metric
```

**Key functions to analyze**:
- `raymarchBlackHole()` - main integration loop
- `kerrMetric()` or geodesic integration - expensive tensor math
- `sampleDisk()` - disk color/emission calculation

## Shader Code Red Flags

When reading shader source, look for these performance anti-patterns:

**In loops (very expensive - multiplied by iteration count):**
```glsl
// RED FLAG: Expensive functions inside loops
for (int i = 0; i < MAX_STEPS; i++) {
    float angle = atan(y, x);        // ~50 cycles each
    float power = pow(r, n);         // ~30 cycles each
    float sine = sin(theta);         // ~20 cycles each
    vec4 tex = texture(sampler, uv); // ~100+ cycles (memory bound)
}
```

**Unnecessary precision:**
```glsl
// RED FLAG: Using expensive functions when cheaper alternatives exist
float dist = sqrt(x*x + y*y);  // Can often use distSquared and compare squared values
float norm = normalize(v);      // Sometimes length isn't needed, just direction
```

**Redundant calculations:**
```glsl
// RED FLAG: Same calculation done multiple times
for (int i = 0; i < steps; i++) {
    float r = length(p);        // Calculated here
    float theta = acos(p.z/r);  // And r used here
    // ... later in same iteration:
    float r2 = length(p);       // REDUNDANT - r already computed above
}
```

**Branch divergence:**
```glsl
// RED FLAG: Complex conditionals that cause thread divergence
if (someCondition) {
    // 50 lines of expensive code
} else {
    // 50 different lines of expensive code
}
// GPU threads in same warp must wait for each other
```

---

# Phase 4: Implement Optimizations

Choose optimizations based on your analysis. Here are specific techniques:

## 4.1: Reduce Iteration Count

**Where**: `src/rendering/shaders/shared/raymarch/core.glsl.ts`

```glsl
// Find these constants and consider reducing them:
#define MAX_MARCH_STEPS_HQ 256  // Try 192 or 128
#define MAX_MARCH_STEPS_LQ 64   // Try 48 or 32
```

**Trade-off**: Lower values = faster but may miss thin features.

## 4.2: Improve Early Termination

Add early exit conditions in the raymarch loop:

```glsl
// Exit if we're clearly inside/outside the bounding volume
if (dO > maxT * 1.5) break;  // We've gone too far

// Exit if step size is tiny (we're stuck)
if (dS < surfDist * 0.01) break;
```

## 4.3: Optimize Expensive Math

Replace expensive operations with approximations:

```glsl
// Instead of:
float angle = atan(y, x);

// Use (when full precision not needed):
float angle = atan2Approx(y, x);  // Or precompute if possible

// Instead of:
float dist = sqrt(x*x + y*y + z*z);

// Use (when comparing distances):
float distSq = x*x + y*y + z*z;  // Compare squared distances
```

## 4.4: Reduce Texture Samples

In volumetric shaders, texture samples are expensive:

```glsl
// Instead of sampling every iteration:
for (int i = 0; i < steps; i++) {
    vec4 sample = texture(uVolume, pos);  // EXPENSIVE
    // ...
}

// Sample less frequently or use LOD:
for (int i = 0; i < steps; i++) {
    if (i % 2 == 0) {  // Sample every other step
        cachedSample = textureLod(uVolume, pos, mipLevel);
    }
    // Use cachedSample...
}
```

## 4.5: Improve Bounding Volume Culling

If the heatmap shows red in empty space, improve the bounding sphere:

```glsl
// In intersectSphere() or similar:
// Make BOUND_R tighter to the actual object
#define BOUND_R 1.5  // Try smaller values like 1.3 or 1.2
```

## 4.6: Quality-Based Optimization

Use the existing quality system to do less work at lower quality:

```glsl
if (uFastMode) {
    // Use cheaper approximations during interaction
    maxSteps = MAX_MARCH_STEPS_LQ;
    // Skip expensive features like SSS, detailed shadows
}
```

---

# Phase 5: Verification

## Step 5.1: Test the Changes

After making edits, the dev server hot-reloads. Use Chrome DevTools MCP to:

1. Refresh the page to ensure changes are applied
2. Take a screenshot to verify visual quality
3. Compare with original rendering - check for:
   - Visual artifacts
   - Edge quality degradation
   - Flickering or missing geometry

## Step 5.2: Measure Improvement

Use Chrome DevTools MCP to execute:

```javascript
// Re-run profiling
window.__PROFILER__.enable()
window.__PROFILER__.startLogging(3000)
```

Wait 15-20 seconds, then execute:

```javascript
JSON.stringify(window.__PROFILER__.getSlowestPasses(10), null, 2)
```

And get updated FPS:
```javascript
window.__PROFILER__.getSummary()
```

**Compare with baseline**:
- Did the target pass GPU time decrease?
- Did overall FPS improve?
- What's the percentage improvement?

## Step 5.3: Document Results

Create or update a report with:
- Before metrics (FPS, slowest pass time)
- After metrics (FPS, slowest pass time)
- What optimizations were applied
- Any visual quality trade-offs

---

# Decision Matrix: What To Optimize

| Symptom | Likely Cause | Optimization |
|---------|--------------|--------------|
| Uniform red heatmap | Too many iterations | Reduce MAX_MARCH_STEPS |
| Red in empty space | Poor bounding volume | Tighten BOUND_R, add early exit |
| Red at edges only | Normal behavior | Acceptable, or reduce surface threshold |
| High GPU time, low iterations | Expensive per-iteration math | Optimize DE/SDF function |
| Post-process pass is slowest | Not a shader issue | Check pass implementation |

---

# Constraints

- **DO NOT** break existing functionality
- **DO NOT** change visual quality significantly without documenting the trade-off
- **DO** maintain WebGL2 / GLSL ES 3.00 compatibility
- **DO** test on at least one object type before declaring success
- **DO** commit changes with clear description of optimization and measured improvement

---

# Output Format

When you complete this optimization, provide:

1. **Baseline**: FPS and slowest pass time before optimization
2. **Changes Made**: List of specific code changes with file paths
3. **Results**: FPS and slowest pass time after optimization
4. **Improvement**: Percentage improvement in target metric
5. **Trade-offs**: Any visual quality changes (if any)
