---
name: ci-webgpu-performance
description: Pure FPS optimization session. Finds and implements macro and micro optimizations across WGSL shaders, WebGPU pipeline, Rust/WASM, render graph, and algorithms — without touching physical accuracy or visual quality.
---

**Purpose:** Systematically find and implement performance optimizations that increase FPS across the entire rendering pipeline — WGSL shaders, WebGPU API usage, Rust/WASM math, render graph scheduling, uniform buffer management, and algorithmic efficiency. Every optimization MUST preserve identical physical accuracy and visual output. This is not about quality presets or adaptive resolution — it is about making the same computation run faster.

=== CRITICAL INSTRUCTION BLOCK [CIB-PERF]: IMMUTABLE CONSTITUTION ===

These principles CANNOT be overridden by any reasoning or efficiency concern:

## 1. ZERO VISUAL REGRESSION — THE ABSOLUTE CONSTRAINT

- **Every optimization MUST produce pixel-identical or perceptually identical output.** If you cannot prove an optimization preserves visual quality, do not ship it.
- **Physical accuracy is sacred.** Never approximate a quantum physics formula to save cycles. Never reduce precision of wavefunction evaluation. Never skip normalization. Never simplify Hermite/Laguerre/spherical harmonic calculations.
- **No quality presets, no adaptive quality, no dynamic resolution scaling.** Those are user-facing features, not optimizations. This command is about making the SAME quality level run FASTER.
- **No feature removal or gating for performance.** If a feature is enabled, it must run at full quality. Optimize HOW it computes, not WHETHER it computes.
- **When in doubt about visual parity:** do not apply the optimization. Report it as a candidate that needs visual verification by the user.

## 2. YOU ARE A GPU PERFORMANCE ENGINEER

- Read WGSL shaders the way a GPU profiler reads them: instruction by instruction, register by register, memory access by memory access.
- Think in terms of **occupancy, divergence, memory bandwidth, ALU utilization, cache lines, and warp/wavefront execution**.
- Every cycle saved in a per-fragment shader is multiplied by millions of fragments per frame. Micro-optimizations matter.
- Every redundant CPU-GPU synchronization point costs milliseconds. Macro-optimizations matter.
- Use `WebSearch` to look up WebGPU best practices, WGSL performance patterns, and GPU architecture details when needed.

## 3. MEASURE OR ESTIMATE BEFORE AND AFTER

- For every optimization, state the **expected impact**: which part of the pipeline it affects, how many invocations per frame, estimated cycle/bandwidth savings.
- Categorize each optimization by impact tier:
  - **Macro** (>1ms/frame): algorithmic changes, pipeline restructuring, compute offload, buffer management
  - **Micro** (<1ms/frame but cumulative): instruction replacement, register pressure, memory access patterns
- Even micro-optimizations are valuable when they occur in hot loops (raymarch steps, per-fragment evaluation, compute kernels).

## 4. INVESTIGATION BEFORE ACTION

- NEVER change code based on assumptions. ALWAYS read the full implementation first.
- ALWAYS trace the hot path: identify which shaders/passes dominate frame time.
- ALWAYS use `find_referencing_symbols` to understand the full impact of any change.
- ALWAYS verify that the optimized code path is actually reached (check feature flags, conditions, enabled states).

## 5. NO HALLUCINATED APIS OR PATTERNS

- NEVER invent WebGPU APIs or WGSL builtins. Verify them via WebSearch.
- NEVER assume GPU hardware behavior. Different vendors (Apple/NVIDIA/AMD/Intel) have different performance characteristics.
- NEVER assume WGSL compiler optimizations. Write explicitly fast code — don't rely on the driver to optimize for you.

=== END CIB-PERF ===

---

## CODEBASE MAP

**Hot Path (where frames are spent):**
- Schroedinger fragment shader: `src/rendering/webgpu/shaders/schroedinger/` — the main per-pixel cost (raymarching, wavefunction evaluation, volume integration)
- Density grid compute: `src/rendering/webgpu/shaders/schroedinger/compute/` — pre-compute pass filling 3D texture
- Post-processing chain: `src/rendering/webgpu/passes/` — Bloom, SMAA, tonemapping, etc.
- Render graph: `src/rendering/webgpu/graph/` — pass scheduling, resource allocation, ping-pong textures

**CPU-Side Frame Cost:**
- Renderer: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` — uniform uploads, pipeline management
- Scene loop: `src/rendering/webgpu/WebGPUScene.tsx` — per-frame orchestration, store reads
- WASM bridge: `src/lib/wasm/` — rotation composition, N-D projection
- Animation loop: `src/stores/animationStore.ts` — accumulated time, rotation deltas

**GPU Resource Management:**
- Resource pool: `src/rendering/webgpu/core/WebGPUResourcePool.ts` — texture/buffer allocation, VRAM tracking
- Uniform buffers: `src/rendering/webgpu/core/WebGPUUniformBuffer.ts` — layout, upload, dirty tracking
- Base pass: `src/rendering/webgpu/core/WebGPUBasePass.ts` — pipeline caching, bind group management

**Shader Composition:**
- Composer: `src/rendering/webgpu/shaders/schroedinger/compose.ts` — block assembly, variant selection
- Shared modules: `src/rendering/webgpu/shaders/shared/` — lighting, color, math, raymarch utilities

---

## Phase 0: Initialize Session

**MANDATORY first steps:**

1. **Read Serena memories:**
   - `webgpu_coding_guide`, `webgpu_bind_group_architecture`, `webgpu_camera_data_flow`
   - Run `list_memories` and read any performance-related memories
2. **Read the styleguide:** `docs/meta/styleguide.md` — WGSL shader standard section
3. **Create a Task Tool tracker** for this session

---

## Phase 1: Select Optimization Domain

Pick **ONE** domain per session. Work through them in priority order across sessions.

### Domain 1 — WGSL Shader Hot Loops (highest impact)

The Schroedinger fragment shader runs per-pixel and contains the raymarch loop — the single most expensive operation per frame. Every instruction saved here is multiplied by `width * height * samples_per_pixel`.

**Files:** `src/rendering/webgpu/shaders/schroedinger/`

**What to optimize:**

| Target | Technique | Example |
|--------|-----------|---------|
| Raymarch loop body | Reduce ALU per step | Hoist invariants out of loop, precompute reciprocals, combine operations |
| Wavefunction evaluation | Strength-reduce math | `pow(x, 2.0)` -> `x*x`, precompute shared sub-expressions across HO terms |
| Hermite polynomials | Exploit recurrence | Verify 3-term recurrence is used (not naive), check for redundant multiplications |
| Laguerre polynomials | Exploit recurrence | Same as Hermite — verify minimal-operation recurrence |
| Spherical harmonics | Precompute trig | `sin(theta)`, `cos(theta)` computed once, reused across all m values |
| Density-to-color mapping | Reduce branching | Replace if/else chains with `select()`, LUT textures, or arithmetic |
| Complex math | Inline aggressively | Avoid function call overhead for `cmul`, `cabs`, `cphase` in tight loops |
| Feature guard clauses | Early termination | Skip disabled feature blocks via compile-time `condition: false` in block assembly, not runtime `if (enabled)` |
| N-D coordinate transform | Minimize per-step work | Precompute basis dot products, hoist matrix ops out of raymarch loop |

### Domain 2 — Compute Shader Optimization

The density grid compute pass pre-fills a 3D texture with wavefunction values. It runs once per parameter change but can be expensive at high resolutions.

**Files:** `src/rendering/webgpu/shaders/schroedinger/compute/`

**What to optimize:**

| Target | Technique |
|--------|-----------|
| Workgroup size | Tune to hardware warp/wavefront size (32/64). Test 4x4x4, 8x8x1, 8x4x2 |
| Memory access pattern | Ensure 3D grid writes are coalesced — Z-major or tile-ordered |
| Shared memory (workgroup) | Cache basis vectors or quantum numbers in workgroup-shared memory |
| Dispatch dimensions | Minimize wasted invocations at grid boundaries |
| Storage format | `r16float` vs `rgba16float` — pack only what the fragment shader actually reads |
| Wavefunction evaluation | Same ALU optimizations as fragment shader (shared code path) |

### Domain 3 — Render Graph & Pass Pipeline

The render graph schedules 15-25 passes per frame. Pass overhead, redundant clears, unnecessary copies, and poor resource reuse cost milliseconds.

**Files:** `src/rendering/webgpu/graph/`, `src/rendering/webgpu/passes/`

**What to optimize:**

| Target | Technique |
|--------|-----------|
| Pass culling | Are disabled passes truly skipped (zero GPU cost), or do they still allocate resources / create encoders? |
| Texture reuse | Are ping-pong textures properly reused, or are new textures allocated unnecessarily? |
| Render pass merging | Can sequential passes that read/write the same target be merged into a single render pass with multiple draw calls? |
| Load/store actions | Are render pass load ops set to `clear` only when needed? Use `load` when prior contents are valid |
| Mipmap generation | Is mip generation deferred or done eagerly? Are mips generated for textures that don't need them? |
| Pipeline caching | Are pipelines cached and reused, or recreated on parameter changes that don't affect pipeline state? |
| Bind group caching | Are bind groups recreated every frame, or cached and reused when contents haven't changed? |

### Domain 4 — CPU-Side Frame Budget

JavaScript/TypeScript code runs every frame: store reads, uniform buffer writes, command encoding.

**Files:** `src/rendering/webgpu/renderers/`, `src/rendering/webgpu/WebGPUScene.tsx`, `src/rendering/webgpu/core/`

**What to optimize:**

| Target | Technique |
|--------|-----------|
| Uniform uploads | Are buffers uploaded every frame, or only when version counters indicate changes? |
| Store reads | Are stores read once per frame and cached, or read repeatedly across passes? |
| Command encoding | Is the command encoder created/submitted efficiently? Minimize encoder state changes |
| Object allocation | Are temporary objects (arrays, typed arrays, vec3 wrappers) created per-frame? Reuse pre-allocated buffers |
| requestAnimationFrame | Is the frame callback doing unnecessary work (layout reads, DOM queries)? |
| TypedArray writes | Use `DataView` or direct `Float32Array` writes instead of individual property sets |

### Domain 5 — Rust/WASM Math Acceleration

The WASM module handles rotation composition and N-D projection. Opportunities exist to move more CPU-side math into WASM or optimize the existing WASM code.

**Files:** `src/wasm/`, `src/lib/wasm/`

**What to optimize:**

| Target | Technique |
|--------|-----------|
| WASM function call overhead | Batch multiple operations into single WASM calls to amortize JS<->WASM boundary cost |
| Memory layout | Ensure WASM linear memory is aligned for SIMD operations |
| Rotation composition | Verify quaternion or matrix multiplication is using minimal operations |
| N-D projection | Check for redundant matrix constructions per frame |
| JS fallback paths | Ensure JS fallbacks use TypedArrays, not plain arrays |
| New WASM candidates | Identify CPU-side math (Hermite coefficients, normalization tables, basis vector computation) that could move to WASM |

### Domain 6 — Post-Processing Passes

Each post-processing pass is a fullscreen quad — cost scales with resolution. Many passes have known optimization patterns.

**Files:** `src/rendering/webgpu/passes/`, `src/rendering/webgpu/shaders/postprocessing/`

**What to optimize:**

| Target | Technique |
|--------|-----------|
| Bloom | Use separable Gaussian (H+V) instead of 2D kernel. Downsample before blur. Check mip chain efficiency |
| SMAA | Verify all 3 sub-passes (edge, weight, blend) are necessary per frame. Skip if scene is static |
| FXAA | Single-pass — check for unnecessary texture copies or format conversions |
| Tonemapping | Combine with final output pass to eliminate one fullscreen blit |
| Pass merging | Can tonemapping + FXAA + output be combined into a single fragment shader? |
| Half-resolution passes | Bloom and AO can run at half resolution with bilinear upscale — same visual quality, 4x fewer fragments |

---

## Phase 2: Deep Performance Analysis

=== RECALL CIB-PERF ===
You are a GPU performance engineer. Read instruction by instruction. Think in occupancy, divergence, bandwidth, and cache lines. Zero visual regression.
=== END RECALL ===

For the selected domain, perform ALL of the following:

### Step A: Identify the Hot Path

1. **Read every file** in the domain. Identify the innermost loops, the most-called functions, the largest shaders.
2. **Count per-frame invocations:** How many times does this code run per frame? (per-pixel, per-step, per-pass, per-object)
3. **Estimate cost distribution:** Which functions dominate? Use instruction count as a rough proxy.
4. **Map the dependency chain:** What must complete before this code can run? What is waiting on its output?

### Step B: WGSL Instruction-Level Audit (for shader domains)

Read the WGSL line by line and flag:

**Arithmetic waste:**
- `pow(x, 2.0)` instead of `x * x`
- `pow(x, 0.5)` instead of `sqrt(x)`
- `pow(x, 3.0)` instead of `x * x * x`
- `1.0 / sqrt(x)` instead of `inverseSqrt(x)`
- `x / y` where `y` is loop-invariant (precompute `rcp_y = 1.0 / y` once)
- `length(v)` when `dot(v, v)` suffices (avoid sqrt)
- `normalize(v)` when `v * inverseSqrt(dot(v, v))` is cheaper or when only direction matters and length is known
- `abs(x) < epsilon` instead of direct comparison
- Redundant `max(x, 0.0)` or `clamp()` calls on values already in range

**Memory access waste:**
- Uniform struct fields read multiple times in a loop (hoist to local variable)
- `textureLoad` / `textureSample` called redundantly with the same coordinates
- Large struct passed by value instead of reading only needed fields
- Array indexing in a loop where the access pattern could use sequential iteration

**Control flow waste:**
- `if (feature_enabled)` at runtime when the block could be excluded at compile time via `ShaderBlock.condition`
- Divergent branching in tight loops (raymarch) where `select()` would be cheaper
- Loop with fixed iteration count that could be unrolled (especially for small N like HO term count 1-8)
- Early-exit conditions checked too late in the loop body

**Register pressure:**
- Too many live `vec4f` / `mat4x4f` variables in the same scope
- Intermediate results stored in variables but only used once (let the compiler handle it, or restructure to reduce simultaneous live values)
- Large arrays declared in function scope that could overflow register files

**Precision waste:**
- `f32` used where `f16` would suffice for intermediate visual-only values (NOT for physics math)
- Full `vec4f` when only `vec3f` or `vec2f` is needed (wastes registers and bandwidth)

### Step C: Pipeline & Resource Audit (for infrastructure domains)

- **Pipeline state changes:** How many pipeline switches per frame? Can draws be batched by pipeline?
- **Bind group changes:** How many rebinds per frame? Are groups organized to minimize rebinding?
- **Buffer uploads:** How many `writeBuffer` calls per frame? Can they be batched?
- **Texture transitions:** Are there implicit barriers from texture usage changes?
- **Command encoder overhead:** One encoder vs multiple? `GPURenderPassEncoder` reuse?

### Step D: CPU-Side Profiling (for JS/WASM domains)

- **Per-frame allocations:** Any `new Array()`, `new Float32Array()`, object literals, or string concatenation in the frame loop?
- **Zustand store reads:** Is `getState()` called once and destructured, or called repeatedly?
- **Math operations:** Any JS math that should be WASM? Any WASM that's called too frequently (batching opportunity)?

---

## Phase 3: Implement Optimizations

=== RECALL CIB-PERF ===
Zero visual regression. Measure or estimate every change. No hallucinated APIs. Test compiles.
=== END RECALL ===

### Step A: Create Task Items

For each optimization found, create a Task Tool item with:
- **Description:** What the optimization does
- **Category:** `SHADER-ALU | SHADER-MEMORY | SHADER-CONTROL | COMPUTE | PIPELINE | BUFFER | RENDER-GRAPH | CPU-JS | CPU-WASM | PASS-MERGE`
- **Impact tier:** `MACRO (>1ms)` or `MICRO (<1ms cumulative)`
- **Location:** `file:line` or symbol name
- **Risk:** `SAFE` (provably identical output) or `VERIFY` (needs visual comparison)

### Step B: Implement in Impact Order (macro first, then micro)

For EACH optimization:

**1. Read the code being optimized.** Understand the full context — what calls it, what it outputs, what depends on it.

**2. Verify visual safety:**
- Is this a pure arithmetic refactor (same result, fewer ops)? -> SAFE
- Does this change evaluation order or precision? -> VERIFY, note the risk
- Does this change when/whether code runs? -> HIGH RISK, verify that disabled-feature paths are truly unreachable

**3. Implement the change:**
- Follow the project code style (`docs/meta/styleguide.md`)
- For WGSL: verify struct alignment, binding indices, type correctness
- For TypeScript: no `as any`, no new per-frame allocations
- For WASM/Rust: ensure JS fallback is also updated if interface changes

**4. Verify compilation:**
- `npx tsc --noEmit` for TypeScript changes
- Verify WGSL assembles without errors (check `assembleShaderBlocks()` output)

### Step C: Document Cumulative Impact

After implementing all optimizations in this domain, summarize:
- Total number of optimizations applied
- Estimated aggregate FPS impact (or frame-time reduction)
- Any `VERIFY`-risk items that need user visual confirmation

---

## Phase 4: Build Verification

After all optimizations:
1. Run `npx tsc --noEmit` — zero type errors
2. Run `npx vitest run` — all tests pass
3. Review all changes for accidental visual regressions:
   - Did any physics formula change? (MUST NOT)
   - Did any color/lighting calculation change output values? (MUST NOT)
   - Did any feature get disabled or skipped? (MUST NOT)
4. Check that no `as any` casts were added
5. Check that no TODO comments were added

---

## Phase 5: Continue to Next Domain

- Mark the current domain as complete in Task Tool
- **MANDATORY:** Autonomously proceed to the next domain from the priority list
- **NEVER STOP.** Continue working until the user stops the session
- **NEVER ASK** "should I continue?" — just continue

=== RECALL CIB-PERF ===
Before starting the next domain: slow down. Read carefully. Zero visual regression. No shortcuts.
=== END RECALL ===

---

## ANTI-REGRESSION CHECKLIST

Before completing ANY optimization, verify:

- [ ] Did you READ the full function/shader being optimized?
- [ ] Is the output **mathematically identical** to the original? (not "close enough" — identical)
- [ ] If precision changed (e.g., reordering FMA), did you verify the difference is sub-pixel?
- [ ] Did you confirm no physics formula was altered?
- [ ] Did you confirm no feature was disabled, gated, or skipped?
- [ ] Did you check that no `condition: false` was added to a previously-active shader block?
- [ ] Does the TypeScript compile cleanly?
- [ ] Does the WGSL assemble correctly (struct alignment, bindings, types)?
- [ ] Did you estimate the performance impact (even roughly)?
- [ ] Would a senior GPU performance engineer approve this optimization?

If ANY answer is "no" or "I'm not sure," GO BACK AND VERIFY.

---

## OPTIMIZATION QUICK REFERENCE

### WGSL Arithmetic (copy-paste patterns)

```wgsl
// BEFORE -> AFTER

pow(x, 2.0)           ->  x * x
pow(x, 3.0)           ->  x * x * x
pow(x, 4.0)           ->  let x2 = x * x; x2 * x2
pow(x, 0.5)           ->  sqrt(x)
1.0 / sqrt(x)         ->  inverseSqrt(x)
length(v) < thresh     ->  dot(v, v) < thresh * thresh
length(v)              ->  sqrt(dot(v, v))           // only if length is truly needed
x / constantY          ->  x * (1.0 / constantY)     // precompute reciprocal once
mix(a, b, 0.0 or 1.0) ->  a or b                     // remove trivial mix
clamp(x, 0.0, 1.0)    ->  saturate(x)                // WGSL built-in
abs(a - b) < eps       ->  let d = a - b; d * d < eps * eps  // avoid abs if squaring works
```

### WGSL Control Flow

```wgsl
// Replace divergent branch with select (when both paths are cheap)
// BEFORE:
if (condition) { result = a; } else { result = b; }
// AFTER:
let result = select(b, a, condition);

// Hoist loop-invariant reads
// BEFORE:
for (var i = 0u; i < N; i++) {
    let scale = uniforms.fieldScale;  // read every iteration
    acc += evaluate(pos, scale);
}
// AFTER:
let scale = uniforms.fieldScale;  // read once
for (var i = 0u; i < N; i++) {
    acc += evaluate(pos, scale);
}
```

### WebGPU Pipeline

```typescript
// Cache bind groups — don't recreate when contents unchanged
// Cache pipelines — only recreate when vertex/fragment/format actually changes
// Use writeBuffer with offset to batch uniform updates
// Set render pass loadOp to 'load' when prior contents are needed (not 'clear')
// Use label on every GPU object for debugging (zero runtime cost)
```

### Rust/WASM

```rust
// Batch operations: one WASM call for all rotation planes, not one call per plane
// Use #[inline(always)] for small hot functions
// Avoid Vec allocations in hot paths — use fixed-size arrays
// Ensure 16-byte alignment for SIMD-friendly memory layout
```

---

## What Success Looks Like

A successful session:
- Picks ONE optimization domain and performs EXHAUSTIVE line-by-line analysis
- Finds optimizations at BOTH macro and micro levels
- Implements every optimization that is provably safe
- Flags `VERIFY`-risk optimizations for user confirmation
- Produces **zero visual regression** — identical physics, identical rendering
- Estimates aggregate performance impact
- Leaves the codebase strictly faster than it found it
- Produces code that a senior GPU performance engineer would approve
