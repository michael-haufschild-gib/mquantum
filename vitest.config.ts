import react from '@vitejs/plugin-react'
import os from 'os'
import path from 'path'
import { defineConfig } from 'vitest/config'

// Cap workers at min(8, available CPUs). 8 is the empirical sweet spot on
// dev machines (−43% wall time vs 4 at the time of measurement); clamping
// to CPU count prevents oversubscription on smaller CI runners.
const MAX_WORKERS = Math.max(1, Math.min(8, os.availableParallelism?.() ?? os.cpus().length))

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/tests/setup.ts',
    css: true,
    // `threads` beats `vmThreads` significantly on this suite (−43% wall time
    // at 8 workers). `vmThreads` creates a new V8 isolate per worker which
    // pays a large setup cost; `threads` uses worker_threads that share the
    // host heap, so module graph and transform cache hits are near-free.
    pool: 'threads',
    // minWorkers keeps a warm pool so file-level parallelism doesn't pay
    // thread spin-up on every run. maxWorkers stays at min(8, cpus) so big
    // dev boxes get the perf gain but small CI runners don't oversubscribe.
    minWorkers: Math.min(4, MAX_WORKERS),
    maxWorkers: MAX_WORKERS,
    // Pure logic tests (no DOM) run in node environment — skips happy-dom init
    environmentMatchGlobs: [
      ['src/tests/lib/**', 'node'],
      ['src/tests/stores/**', 'node'],
      ['src/tests/wasm/**', 'node'],
      ['src/tests/rendering/**', 'node'],
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/scripts/playwright/**', // Playwright tests run separately
      '**/.claude/worktrees/**', // Isolated agent worktrees
      // One-shot research diagnostics: skipped by default so `pnpm test`
      // stays regression-focused. Run explicitly via
      // `pnpm exec vitest run src/tests/.../_oneshot<Name>.test.ts`.
      '**/_oneshot*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/tests/**',
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        'src/wasm/**/pkg/**',
        // GPU-only pass/renderer files: 100% WebGPU API calls (createComputePipeline,
        // createBindGroup, dispatchWorkgroups). No testable logic in Vitest/happy-dom.
        // These are verified by Playwright e2e tests (rendering.spec.ts,
        // shader-compilation-matrix.spec.ts, physics-validation.spec.ts).
        'src/rendering/webgpu/passes/TDSEComputePass.ts',
        'src/rendering/webgpu/passes/TDSEComputePassDispatchers.ts',
        'src/rendering/webgpu/passes/TDSEComputePassDispose.ts',
        'src/rendering/webgpu/passes/DensityGridGradientSetup.ts',
        'src/rendering/webgpu/passes/DiracComputePass.ts',
        'src/rendering/webgpu/passes/DiracComputePassDispatchers.ts',
        'src/rendering/webgpu/passes/DiracComputePassSetup.ts',
        'src/rendering/webgpu/passes/DiracComputePassUniforms.ts',
        'src/rendering/webgpu/passes/PauliComputePass.ts',
        'src/rendering/webgpu/passes/PauliComputePassBuffers.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts',
        'src/rendering/webgpu/passes/WignerCacheComputePass.ts',
        'src/rendering/webgpu/passes/WignerCacheComputePassSetup.ts',
        'src/rendering/webgpu/passes/PaperTexturePass.ts',
        'src/rendering/webgpu/passes/SMAAPass.ts',
        'src/rendering/webgpu/passes/FrameBlendingPass.ts',
        'src/rendering/webgpu/passes/FXAAPass.ts',
        // gizmoGround.ts — removed: pure geometry math, no GPU calls, testable
        'src/rendering/webgpu/renderers/WebGPUSkyboxRenderer.ts',
        // skyboxVertexData.ts — removed: mostly pure functions, testable
        'src/rendering/webgpu/renderers/strategies/TdseBecStrategy.ts',
        // useRotationUpdates.ts — removed: React hook with zero GPU calls, testable
        'src/rendering/webgpu/passes/TDSEComputePassBindGroups.ts',
        'src/rendering/webgpu/passes/PauliComputePassSetup.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePassSetup.ts',
        'src/rendering/webgpu/passes/DiracComputePassBuffers.ts',
        'src/rendering/webgpu/passes/TDSEComputePassSetup.ts',
        'src/rendering/webgpu/passes/TDSEComputePassBuffers.ts',
        'src/rendering/webgpu/passes/WebGPUTemporalCloudPass.ts',
        'src/rendering/webgpu/passes/WebGPUTemporalCloudPassSetup.ts',
        // GPU-only compute pass split files (same criterion as the entries
        // above): 100% WebGPU dispatch/bind-group/buffer-write calls, no
        // testable logic in Vitest/happy-dom. Verified by Playwright e2e
        // tests (rendering.spec.ts, physics-validation.spec.ts).
        'src/rendering/webgpu/passes/TDSEComputePassEvolution.ts',
        'src/rendering/webgpu/passes/TDSEComputePassExecute.ts',
        'src/rendering/webgpu/passes/TDSEStateSaveLoad.ts',
        'src/rendering/webgpu/passes/TDSEStochasticLocalization.ts',
        'src/rendering/webgpu/passes/TDSEObservablesDispatch.ts',
        'src/rendering/webgpu/passes/TDSECurvedIntegrator.ts',
        'src/rendering/webgpu/passes/TDSEVortexDetect.ts',
        'src/rendering/webgpu/passes/DiracComputePassStrang.ts',
        'src/rendering/webgpu/passes/QuantumWalkComputePass.ts',
        'src/rendering/webgpu/passes/QuantumWalkDiagnostics.ts',
        'src/rendering/webgpu/passes/DensityGridComputePass.ts',
        'src/rendering/webgpu/passes/EigenfunctionCacheComputePass.ts',
        'src/rendering/webgpu/passes/AdsDensityComputePass.ts',
        'src/rendering/webgpu/passes/CarpetSliceComputePass.ts',
        'src/rendering/webgpu/passes/LightGizmoPass.ts',
        'src/rendering/webgpu/passes/CubemapCapturePass.ts',
        'src/rendering/webgpu/passes/stateSave.ts',
        // GPU orchestration: heavy WebGPU coupling, render graph + RAF loop
        // tied to canvas DOM element. Not viable in Vitest/happy-dom.
        'src/rendering/webgpu/WebGPUScene.ts',
        'src/rendering/webgpu/scenePassSetup.ts',
        'src/rendering/webgpu/useSceneFrameLoop.ts',
        'src/rendering/webgpu/useExportRuntime.ts',
        'src/rendering/webgpu/useGizmoInteraction.ts',
        'src/rendering/webgpu/useSceneStoreWiring.ts',
        'src/rendering/webgpu/utils/ktx2Loader.ts',
        'src/rendering/webgpu/exportBatchHelpers.ts',
        // GPU strategies: each strategy's executeFrame() is a sequence of
        // GPU pipeline dispatches. Pure helpers (computeAdsConfigHash,
        // computeBasisVersion) are tested separately where exported.
        'src/rendering/webgpu/renderers/strategies/AnalyticModeStrategy.ts',
        'src/rendering/webgpu/renderers/strategies/analyticOpenQuantum.ts',
        'src/rendering/webgpu/renderers/strategies/AntiDeSitterStrategy.ts',
        'src/rendering/webgpu/renderers/strategies/FreeScalarFieldStrategy.ts',
        'src/rendering/webgpu/renderers/strategies/DiracStrategy.ts',
        'src/rendering/webgpu/renderers/strategies/PauliStrategy.ts',
        'src/rendering/webgpu/renderers/strategies/QuantumWalkStrategy.ts',
        // Renderer + frame update: GPU buffer writes orchestrated against
        // store snapshots. Replaced in coverage by the underlying pure
        // helpers (uniformPacking, uniformPackingSupport, skyboxVertexData).
        'src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts',
        'src/rendering/webgpu/renderers/schrodingerFrameUpdate.ts',
        // Additional GPU-only pass modules following the existing exclusion
        // criterion (100% WebGPU API calls; verified by Playwright).
        'src/rendering/webgpu/passes/TDSEComputePassInit.ts',
        'src/rendering/webgpu/passes/TDSEComputePassUniforms.ts',
        'src/rendering/webgpu/passes/TDSEDiagnosticsReadback.ts',
        'src/rendering/webgpu/passes/fsfCosmologyStepping.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldKSpace.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePassInit.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms.ts',
        'src/rendering/webgpu/passes/DensityDistributionAnalysis.ts',
        // computePassUtils.ts itself stays included — pure dispatch / FFT-pack
        // helpers are testable. Only the GPU texture creators (split into
        // computePassTextures.ts) need exclusion.
        'src/rendering/webgpu/passes/computePassTextures.ts',
        'src/rendering/webgpu/core/WebGPUBasePass.ts',
        'src/rendering/webgpu/core/WebGPUResourcePool.ts',
        'src/rendering/webgpu/graph/WebGPURenderGraph.ts',
        'src/rendering/webgpu/renderers/schrodingerPipeline.ts',
        // Application entry: bootstraps DOM, mounts React tree, no testable
        // logic in Vitest. Verified by Playwright app-loads.spec.ts.
        'src/App.tsx',
        'src/main.tsx',
        // UI shells with no testable branches (decorative drawers, GPU
        // overlays). Verified by Playwright e2e where they matter.
        'src/components/overlays/WormholeCoherencePanel.tsx',
        'src/components/layout/TimelineControls/AnimationSystemPanel.tsx',
        'src/components/layout/TimelineControls/PauliAnimationDrawer.tsx',
        'src/components/layout/TimelineControls/WheelerDeWittAnimationDrawer.tsx',
        // animation-wasm.ts and per-phase split (lib/wasm/animation/*): the
        // WASM module is always disabled in test mode
        // (`import.meta.env.MODE === 'test'`), so every branch inside the
        // `if (ready && module)` guards is unreachable from Vitest. The
        // WASM kernels themselves are validated by Rust unit tests
        // (`pnpm test:rust`) and the wired-up paths by Playwright. The
        // barrel re-export file has no logic.
        'src/lib/wasm/animation-wasm.ts',
        'src/lib/wasm/animation/runtime.ts',
        'src/lib/wasm/animation/operations.ts',
        'src/lib/wasm/animation/matrixVector.ts',
        'src/lib/wasm/animation/fft.ts',
        'src/lib/wasm/animation/entanglement.ts',
        'src/lib/wasm/animation/complexMatrix.ts',
        'src/lib/wasm/animation/tdseDiagnostics.ts',
        'src/lib/wasm/animation/collapse.ts',
        // Sweep coordinator wraps a Web Worker and reads from a Zustand
        // store. The pure sweep math lives in lib/physics/srmt and is
        // tested there; this file is the worker glue.
        'src/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtSweepCoordinator.ts',
        // High-coverage React components and the URL-state hook: covered
        // by Playwright url-state.spec.ts and panels.spec.ts. Branches
        // here are mostly conditional rendering of optional sliders which
        // happy-dom would render trivially without exercising the
        // underlying physics.
        'src/components/sections/Geometry/SchroedingerControls/AntiDeSitterControls.tsx',
      ],
      // Coverage ratchet: thresholds track current actuals (rounded down to
      // nearest 0.5%). Raise when coverage improves. Lower only when the
      // denominator changes (new files, exclusion list changes) — document why.
      // The companion `scripts/check-coverage-ratchet.js` rejects thresholds
      // that drift > 1% below actual, so missed ratchet-ups break CI.
      // Last measured 2026-04-28: stmts 83.78%, branches 73.62%, funcs 79.09%, lines 84.77%
      // Big jump from PR #72 — large test+refactor wave (curved-space sampling,
      // type-extraction splits, broad coverage uplift) plus CodeRabbit
      // follow-ups (extracted boundingRadiusQuantize.ts, set-equality and
      // exact-match assertions). Thresholds raised to track actuals within 1%
      // per the ratchet contract.
      thresholds: {
        statements: 83.5,
        branches: 73.5,
        functions: 79,
        lines: 84.5,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@/components': path.resolve(import.meta.dirname, './src/components'),
      '@/lib': path.resolve(import.meta.dirname, './src/lib'),
      '@/hooks': path.resolve(import.meta.dirname, './src/hooks'),
      '@/stores': path.resolve(import.meta.dirname, './src/stores'),
      '@/types': path.resolve(import.meta.dirname, './src/types'),
      // Mock WASM module for tests (Vite import analysis runs before vitest mocks)
      'mdimension-core': path.resolve(
        import.meta.dirname,
        './src/tests/__mocks__/mdimension-core.ts'
      ),
    },
  },
})
