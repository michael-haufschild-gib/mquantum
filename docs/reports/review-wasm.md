# WASM / Worker Code Review

Date: 2026-03-11

## Scope

Review of the Rust/WASM implementation under `src/wasm/mdimension_core`, the TypeScript WASM wrapper in `src/lib/wasm`, and the Dirac worker path in `src/lib/physics/dirac`.

Question reviewed:
- Is the Rust/WASM code actually used?
- Is the worker actually using Rust/WASM?
- Where does the app fall back to TypeScript instead?

No tests were run for this review.

## Verdict

- The general animation/math WASM path is real and wired into runtime use.
- The Dirac worker does not use Rust/WASM at all; it always uses the TypeScript fallback.
- Several Rust exports exist but are currently unused by the live application path.

## Findings

### 1. Critical: Dirac worker is hardwired to TypeScript fallback, not Rust/WASM

The main-thread bridge claims the worker uses WASM and falls back to JS if unavailable:

```ts
// src/lib/physics/dirac/diracAlgebra.ts
/**
 * Generate Clifford algebra gamma matrices for the given spatial dimension.
 * Uses WASM via web worker, falls back to JS if unavailable.
 */
```

But the worker implementation never imports `mdimension_core` and always computes with the fallback:

```ts
// src/lib/physics/dirac/diracAlgebraWorker.ts
import { generateDiracMatricesFallback } from './cliffordAlgebraFallback'

// Use JS Clifford algebra directly in the worker.
// WASM cannot be loaded in a worker bundle by vite-plugin-wasm-pack, and the
// JS fallback produces identical results (verified by Clifford algebra tests).

self.onmessage = async (e: MessageEvent<DiracAlgebraRequest>) => {
  const msg = e.data
  if (msg.type !== 'generateMatrices') return

  const result = generateDiracMatricesFallback(msg.spatialDim)
  const gammaData = result.gammaData
  const s = result.spinorSize

  self.postMessage(
    {
      type: 'result',
      epoch: msg.epoch,
      gammaData,
      spinorSize: s,
    },
    { transfer: [gammaData.buffer] }
  )
}
```

This worker is the source of the gamma matrices uploaded into the renderer:

```ts
// src/rendering/webgpu/passes/DiracComputePass.ts
this.algebraBridge.generateMatrices(config.latticeDim).then(({ gammaData }) => {
  if (requestEpoch !== this.gammaRequestEpoch) return
  this.gammaPendingUpload = gammaData.subarray(1)
  this.gammaDataReady = true
})
```

So the live Dirac rendering path is currently:

`DiracComputePass` -> `DiracAlgebraBridge` -> `diracAlgebraWorker.ts` -> `generateDiracMatricesFallback()`

not Rust/WASM.

### 2. Medium: general animation/math WASM is actually used, but only as an opportunistic acceleration path

App startup does initialize the WASM module:

```ts
// src/main.tsx
import { initAnimationWasm } from '@/lib/wasm'
initAnimationWasm()
```

The wrapper dynamically imports the generated wasm-bindgen package and marks the module ready on success:

```ts
// src/lib/wasm/animation-wasm.ts
const wasm = await import('@/wasm/mdimension_core/pkg/mdimension_core.js')

await wasm.default()
wasm.start()

wasmModule = wasm as unknown as WasmModule
wasmReady = true
```

Hot math helpers then use the WASM functions when `isAnimationWasmReady()` is true, otherwise they fall back to TypeScript/JS:

```ts
// src/lib/math/rotation.ts
if (isAnimationWasmReady()) {
  const wasmResult = composeRotationsIndexedWasm(
    dimension,
    buffers.planeIndices,
    buffers.angles,
    rotationCount
  )
  if (wasmResult) {
    result.set(wasmResult)
    return result
  }
}
```

```ts
// src/lib/math/matrix.ts
if (isAnimationWasmReady()) {
  const wasmResult = multiplyMatricesWasm(aF64, bF64, dim)
  if (wasmResult) {
    result.set(new Float32Array(wasmResult))
    return result
  }
}
```

```ts
// src/lib/math/vector.ts
if (isAnimationWasmReady()) {
  const wasmResult = dotProductWasm(aF64, bF64)
  if (wasmResult !== null) {
    return wasmResult
  }
}
```

That means this WASM is genuinely used in production code paths, but only after async init succeeds. Before that, and on any init failure, the code falls back to TS.

### 3. Medium: fallback to TypeScript can silently become permanent if WASM init fails

The wrapper logs initialization failure only in dev:

```ts
// src/lib/wasm/animation-wasm.ts
} catch (err) {
  const wasmError = err instanceof Error ? err : new Error(String(err))
  if (import.meta.env.DEV) {
    console.warn('[AnimationWASM] Initialization failed, using JS fallback:', wasmError.message)
  }
}
```

If initialization fails in production, the app simply stays on the JS path with no stronger signal. That may be acceptable as graceful degradation, but it also makes it easy to believe WASM is active when it is not.

### 4. Low: generated wasm-bindgen package already calls start, but wrapper calls it again

The app wrapper does:

```ts
await wasm.default()
wasm.start()
```

But the generated init function already executes `__wbindgen_start()`:

```js
// src/wasm/mdimension_core/pkg/mdimension_core.js
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    // ...
    wasm.__wbindgen_start();
    return wasm;
}
```

So the startup hook is effectively invoked twice. This is probably harmless today because the Rust `start()` function just installs a panic hook and logs, but the wiring is still incorrect and misleading.

### 5. Low: some Rust exports appear unused in the live application path

These Rust exports exist in `src/wasm/mdimension_core/src/lib.rs` and are present in the generated package:

- `generate_dirac_matrices_wasm`
- `dirac_spinor_size_wasm`
- `project_vertices_wasm`
- `compose_rotations_wasm`

However:

- `generate_dirac_matrices_wasm` and `dirac_spinor_size_wasm` are not used by the current Dirac worker path.
- `compose_rotations_wasm` is exposed, but the actual hot path uses `composeRotationsIndexedWasm`.
- `project_vertices_wasm` is wrapped but no live callsite was found in the application code reviewed.

This makes the Rust surface area larger than the active runtime usage.

## Overall Assessment

The codebase currently has two different realities:

- For general animation and math helpers, Rust/WASM is real and wired up as a performance optimization.
- For the Dirac worker path, Rust/WASM is not actually in use despite comments and bridge documentation implying that it is.

The most important mismatch is documentation and architecture intent versus actual execution path. The Dirac Rust implementation exists, but the renderer currently receives gamma matrices generated by the TypeScript fallback inside the worker.

## Recommended Follow-up

1. Update comments and docs in `diracAlgebra.ts` and related planning docs so they accurately describe the current worker behavior.
2. Decide whether the Dirac worker should truly use Rust/WASM or whether the TS fallback is the intended long-term implementation.
3. If Rust/WASM is intended for Dirac, rework worker bundling/loading so the worker can actually import and initialize `mdimension_core`.
4. Remove or clearly mark currently unused WASM exports if they are not part of the intended active surface.
5. Remove the extra `wasm.start()` call from `src/lib/wasm/animation-wasm.ts` unless there is a specific reason to invoke it manually after `wasm.default()`.
