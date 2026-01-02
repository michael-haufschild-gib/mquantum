Bug description:
npm run build & npm run preview has significantly lower FPS on average than npm run dev - for the same browser, the same settings, same scene. This is discrepancy is long-running and not related to loading.

Changes made so far (but none solved the issue)
1. vite.config.ts - Build configuration changes
Disabled source maps (sourcemap: false)
Added preview server headers (COOP/COEP)
Tested minify: false (reverted)
Tested inlineDynamicImports: true (reverted - broke build)
Changed target to esnext (may still be set)
2. vercel.json - Deployment headers
Added COOP/COEP headers for all routes
Added cache headers for static assets (JS/CSS: 1 year, assets: 1 year)
3. package.json - Browserslist
Added browserslist config targeting modern browsers (only latest version of Chrome, Edge, Safari, Firefox)
4. Browserlist limited to only "last 1 Chrome version" - still no change
5. esbuild keepNames: true - Enabled keepNames in production to prevent class/function name mangling (no change)
6. Removed manualChunks - Temporarily removed all manual chunk splitting (no change)
7. inlineDynamicImports: true - Tested again to create single bundle like dev mode (no change)
8. Rolldown (rolldown-vite) - Tested unified bundler that uses same bundler for dev and prod (no change)

What We Ruled Out
❌ Minification (disabled it, still slow)
❌ Chunk splitting (disabled it, still slow)
❌ JS execution time (profiler showed 0.24ms frame callback)
❌ Browser optimization (even optimizing for "last 1 Chrome version" doesn't solve the issue)
❌ WASM (issue also affects raymarching objects that don't use WASM)
❌ esbuild keepNames (enabled in prod, still slow)
❌ manualChunks configuration (removed it, still slow)
❌ Module bundling strategy (tried inlineDynamicImports, still slow)
❌ Dev/Prod bundler mismatch (Rolldown uses same bundler for both, still slow)

Key Insight
The issue affects BOTH geometry-based rendering (Polytope) AND pure GPU raymarching (Mandelbulb).
Since raymarching is 100% GPU shader-based with no JS computation, the bottleneck is NOT in JavaScript.
The profiler shows only 0.24ms JS execution per frame, yet FPS is still lower in prod.

Remaining Hypotheses
1. Vite dev server vs preview server behavioral differences (not bundling-related)
2. HTTP/2 vs HTTP/1.1 serving differences
3. Different module loading timing affecting WebGL context initialization
4. Preview server missing some optimization that dev server has
5. React scheduler or R3F frameloop timing differences at runtime

Critical Finding: Rolldown Test
Rolldown uses the SAME bundler for dev and prod, eliminating the "bundler mismatch" theory.
The issue STILL occurred with Rolldown, proving the root cause is NOT:
- Rollup vs esbuild differences
- Bundling strategy differences
- Code transformation differences

This points to the issue being in HOW the code is SERVED, not how it's BUNDLED.

Next Steps to Investigate
- Compare dev server (Vite native) vs preview server (static file serving) behavior
- Check if running prod build through Vite dev server has the same FPS
- Profile with Chrome Performance tab comparing dev vs prod FRAME TIMING (not just JS)
- Measure actual GPU time using EXT_disjoint_timer_query_webgl2
- Check HTTP headers and loading behavior differences between servers

Additional Investigation (Jan 2026)

Test Case: Mandelbulb zoomed in
- Dev: ~45 FPS
- Prod: ~37 FPS
- Difference: ~18% slower in prod

RAF Rate Measurement:
- Both dev and prod show identical RAF rate (120.2 FPS, 8.32ms)
- This proves the browser is NOT throttling differently

Added Diagnostic Component: `src/dev-tools/ProdDevDiagnostics.tsx`
This component logs to console every 5 seconds:
- Render target dimensions (native width/height)
- gl.render() calls per frame
- WebGL context attributes
- GPU renderer info
- Frame timings

To use: Component is already added to App.tsx. Run dev and prod, open console.
Compare the diagnostic output between the two environments.

Key data to compare:
1. `totalPixels` - If different, prod might be rendering at higher resolution
2. `avgRenderCalls` - If prod has more, there's extra rendering work
3. `contextAttributes` - Should be identical
4. `avgFrameTime` - Will show the actual difference in ms

Reference: Three.js forum users reported similar issues caused by:
1. Browserslist transpilation (ruled out - we tried "last 1 Chrome version")
2. Tree shaking breaking class internals (possible but Rolldown test contradicts)
3. WebGL context attributes being different (need to verify)

Chrome-specific consideration from web.dev:
"When an application eventually falls a few frames behind (maybe because it's GPU bound),
Chrome starts waiting for the 3rd oldest frame to finish rendering before it'll start
processing the rendering commands for the next one."
This could explain why a small initial difference compounds into larger FPS drops.

Sources:
- https://discourse.threejs.org/t/production-build-runs-much-slower-than-dev/26428
- https://web.dev/articles/abouttracing

## Diagnostic Results (Jan 2026 - Black Hole Test)

### DEV Mode (localhost:3000)
```
Mode: development
Viewport: 1512x728 CSS, 3024x1456 native (DPR: 2)
Render Scale: 0.75 (2268x1092 = 2,476,656 scaled pixels)
Avg Render Calls/Frame: 12.00
Avg Frame Time: 31.5ms (31.7 FPS)
```

### PROD Mode (localhost:4174)
```
Mode: production
Viewport: 1512x728 CSS, 3024x1456 native (DPR: 2)
Render Scale: 0.75 (2268x1092 = 2,476,656 scaled pixels)
Avg Render Calls/Frame: 12.00
Avg Frame Time: 42ms (24 FPS)
```

### Key Finding
- **Resolution: IDENTICAL**
- **Render calls per frame: IDENTICAL (12)**
- **Context attributes: IDENTICAL**
- **Frame time: 33% LONGER in prod (31.5ms → 42ms)**

The GPU is rendering the exact same workload (same pixels, same passes) but takes
33% longer in production. This eliminates:
- Resolution differences
- Extra render passes
- WebGL context configuration differences

### Remaining Hypothesis
The bundled JavaScript code is somehow causing the GPU to work slower, despite:
- Same WebGL calls
- Same shader code
- Same uniforms

Possible causes:
1. V8 deoptimization of WebGL call sites in bundled code
2. Different memory layout affecting GPU buffer transfers
3. Module execution order affecting WebGL driver state
4. Bundler transforming code in a way that affects performance

## Deep Investigation (Jan 2026)

### Research Findings

1. **R3F GitHub Issue #1635**: Similar issue with create-react-app was caused by Babel transpilation.
   Solution was configuring Babel with `modules: false`, `bugfixes: true`, `loose: true`.
   However, this project uses **Vite** (esbuild/Rollup), not CRA (Babel).

2. **V8 Inline Caching**: Modern TurboFan uses AST node count, NOT byte count.
   Minified variable names should NOT cause performance regression.
   Source: https://web.dev/articles/speed-v8

3. **Rolldown Testing**: Already tested Rolldown (unified bundler for dev/prod) - issue persisted.
   This proves the issue is NOT about dev/prod bundler mismatch (esbuild vs Rollup).

### What We Know For Certain

| Metric | Dev | Prod | Difference |
|--------|-----|------|------------|
| Render calls/frame | 12 | 12 | IDENTICAL |
| Resolution (scaled) | 2,476,656px | 2,476,656px | IDENTICAL |
| WebGL context | Same attrs | Same attrs | IDENTICAL |
| Frame time | 31.5ms | 42ms | **+33% slower** |

The GPU receives IDENTICAL workload but takes 33% longer.

### Enhanced Diagnostics Added

Updated `src/dev-tools/ProdDevDiagnostics.tsx` to also track:
- WebGL program count (shader compilation caching)
- Geometry/texture count
- Shader precision (fragment/vertex)
- Extension count

### Concrete Tests To Try

1. **Test in Firefox**: If issue is Chrome-specific V8 behavior, Firefox won't show it
2. **Disable V8 cache**: Run Chrome with `--js-flags="--no-compilation-cache"`
3. **V8 tracing**: Run Chrome with `--js-flags="--trace-opt --trace-deopt"` to see deoptimizations
4. **Spector.js capture**: Capture WebGL calls in both modes and diff them
5. **Chrome about:tracing**: Record GPU traces and compare command buffer timing

### Hypotheses Ranked by Likelihood

1. **HIGH**: Bundled code causes V8 to compile WebGL call sites differently
   - In dev: Each module's gl.bindTexture() etc. optimizes independently
   - In prod: All calls merged in one scope, potentially causing megamorphic IC

2. **MEDIUM**: GPU command buffer batching differs
   - Unbundled modules have micro-delays between WebGL calls
   - Bundled code has all calls back-to-back, may cause pipeline stalls

3. **LOW**: Chrome has special dev-mode optimizations
   - Unlikely, but possible Chrome recognizes dev patterns

### Next Steps

- [ ] Run diagnostics and compare program count between dev/prod
- [ ] Test in Firefox to isolate if Chrome-specific
- [ ] Use Spector.js to capture and diff WebGL call traces
- [ ] Try Chrome --trace-deopt flag to find V8 deoptimizations
