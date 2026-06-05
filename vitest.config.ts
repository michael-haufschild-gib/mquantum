import react from '@vitejs/plugin-react'
import os from 'os'
import path from 'path'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

// Cap workers at min(8, available CPUs). 8 is the empirical sweet spot on
// dev machines (−43% wall time vs 4 at the time of measurement); clamping
// to CPU count prevents oversubscription on smaller CI runners.
const MAX_WORKERS = Math.max(1, Math.min(8, os.availableParallelism?.() ?? os.cpus().length))

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        replaceAttrValues: { '#000': 'currentColor', '#000000': 'currentColor' },
      },
    }),
  ],
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
      // Underscore-prefixed research diagnostics (one-shot scans, live
      // investigations, publication CSV dumps): skipped by default so
      // `pnpm test` stays regression-focused. Run explicitly via
      // `pnpm exec vitest run src/tests/.../_<name>.test.ts`.
      '**/_*.test.ts',
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
        'src/rendering/webgpu/passes/TDSEComputePass/index.ts',
        'src/rendering/webgpu/passes/TDSEComputePassDispatchers/index.ts',
        'src/rendering/webgpu/passes/TDSEComputePassDispose.ts',
        'src/rendering/webgpu/passes/DensityGridGradientSetup/index.ts',
        'src/rendering/webgpu/passes/DiracComputePass/index.ts',
        'src/rendering/webgpu/passes/DiracComputePassDispatchers/index.ts',
        'src/rendering/webgpu/passes/DiracComputePassSetup/index.ts',
        'src/rendering/webgpu/passes/DiracComputePassUniforms/index.ts',
        'src/rendering/webgpu/passes/PauliComputePass/index.ts',
        'src/rendering/webgpu/passes/PauliComputePassBuffers/index.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePass/index.ts',
        'src/rendering/webgpu/passes/WignerCacheComputePass/index.ts',
        'src/rendering/webgpu/passes/WignerCacheComputePassSetup/index.ts',
        'src/rendering/webgpu/passes/PaperTexturePass/index.ts',
        'src/rendering/webgpu/passes/SMAAPass/index.ts',
        'src/rendering/webgpu/passes/FrameBlendingPass/index.ts',
        'src/rendering/webgpu/passes/FXAAPass/index.ts',
        // gizmoGround.ts — removed: pure geometry math, no GPU calls, testable
        'src/rendering/webgpu/renderers/WebGPUSkyboxRenderer/index.ts',
        // skyboxVertexData.ts — removed: mostly pure functions, testable
        'src/rendering/webgpu/renderers/strategies/TdseBecStrategy/index.ts',
        // useRotationUpdates.ts — removed: React hook with zero GPU calls, testable
        'src/rendering/webgpu/passes/TDSEComputePassBindGroups.ts',
        'src/rendering/webgpu/passes/PauliComputePassSetup/index.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePassSetup/index.ts',
        'src/rendering/webgpu/passes/DiracComputePassBuffers.ts',
        'src/rendering/webgpu/passes/TDSEComputePassSetup/index.ts',
        'src/rendering/webgpu/passes/TDSEComputePassBuffers.ts',
        'src/rendering/webgpu/passes/WebGPUTemporalCloudPass/index.ts',
        'src/rendering/webgpu/passes/WebGPUTemporalCloudPassSetup/index.ts',
        // GPU-only compute pass split files (same criterion as the entries
        // above): 100% WebGPU dispatch/bind-group/buffer-write calls, no
        // testable logic in Vitest/happy-dom. Verified by Playwright e2e
        // tests (rendering.spec.ts, physics-validation.spec.ts).
        'src/rendering/webgpu/passes/TDSEComputePassEvolution/index.ts',
        'src/rendering/webgpu/passes/TDSEComputePassExecute.ts',
        'src/rendering/webgpu/passes/TDSEStateSaveLoad/index.ts',
        'src/rendering/webgpu/passes/TDSEStochasticLocalization/index.ts',
        'src/rendering/webgpu/passes/TDSEObservablesDispatch/index.ts',
        'src/rendering/webgpu/passes/TDSECurvedIntegrator/index.ts',
        'src/rendering/webgpu/passes/TDSEVortexDetect/index.ts',
        'src/rendering/webgpu/passes/DiracComputePassStrang/index.ts',
        'src/rendering/webgpu/passes/QuantumWalkComputePass/index.ts',
        'src/rendering/webgpu/passes/QuantumWalkDiagnostics/index.ts',
        'src/rendering/webgpu/passes/DensityGridComputePass/index.ts',
        'src/rendering/webgpu/passes/EigenfunctionCacheComputePass/index.ts',
        'src/rendering/webgpu/passes/AdsDensityComputePass/index.ts',
        'src/rendering/webgpu/passes/CarpetSliceComputePass/index.ts',
        'src/rendering/webgpu/passes/LightGizmoPass/index.ts',
        'src/rendering/webgpu/passes/CubemapCapturePass/index.ts',
        'src/rendering/webgpu/passes/stateSave/index.ts',
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
        'src/rendering/webgpu/renderers/strategies/AnalyticModeStrategy/index.ts',
        'src/rendering/webgpu/renderers/strategies/analyticOpenQuantum/index.ts',
        'src/rendering/webgpu/renderers/strategies/AntiDeSitterStrategy/index.ts',
        'src/rendering/webgpu/renderers/strategies/FreeScalarFieldStrategy/index.ts',
        'src/rendering/webgpu/renderers/strategies/DiracStrategy/index.ts',
        'src/rendering/webgpu/renderers/strategies/PauliStrategy/index.ts',
        'src/rendering/webgpu/renderers/strategies/QuantumWalkStrategy/index.ts',
        // Renderer + frame update: GPU buffer writes orchestrated against
        // store snapshots. Replaced in coverage by the underlying pure
        // helpers (uniformPacking, uniformPackingSupport, skyboxVertexData).
        'src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer/index.ts',
        'src/rendering/webgpu/renderers/schrodingerFrameUpdate/index.ts',
        // Additional GPU-only pass modules following the existing exclusion
        // criterion (100% WebGPU API calls; verified by Playwright).
        'src/rendering/webgpu/passes/TDSEComputePassInit.ts',
        'src/rendering/webgpu/passes/TDSEComputePassUniforms/index.ts',
        'src/rendering/webgpu/passes/TDSEDiagnosticsReadback/index.ts',
        'src/rendering/webgpu/passes/fsfCosmologyStepping/index.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldKSpace/index.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePassInit.ts',
        'src/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms/index.ts',
        'src/rendering/webgpu/passes/DensityDistributionAnalysis/index.ts',
        // computePassUtils.ts itself stays included — pure dispatch / FFT-pack
        // helpers are testable. Only the GPU texture creators (split into
        // computePassTextures.ts) need exclusion.
        'src/rendering/webgpu/passes/computePassTextures/index.ts',
        'src/rendering/webgpu/core/WebGPUBasePass.ts',
        'src/rendering/webgpu/core/WebGPUResourcePool.ts',
        'src/rendering/webgpu/graph/WebGPURenderGraph.ts',
        'src/rendering/webgpu/renderers/schrodingerPipeline/index.ts',
        // Application entry: bootstraps DOM, mounts React tree, no testable
        // logic in Vitest. Verified by Playwright app-loads.spec.ts.
        'src/App.tsx',
        'src/main.tsx',
        // UI shells with no testable branches (decorative drawers, GPU
        // overlays). Verified by Playwright e2e where they matter.
        'src/components/overlays/WormholeCoherencePanel.tsx',
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
        'src/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtSweepCoordinator/index.ts',
        // High-coverage React components and the URL-state hook: covered
        // by Playwright url-state.spec.ts and panels.spec.ts. Branches
        // here are mostly conditional rendering of optional sliders which
        // happy-dom would render trivially without exercising the
        // underlying physics.
        'src/components/sections/Geometry/SchroedingerControls/AntiDeSitterControls/index.tsx',
      ],
      // Coverage ratchet: thresholds track current actuals (rounded down to
      // nearest 0.5%). Raise when coverage improves. Lower only when the
      // denominator changes (new files, exclusion list changes) — document why.
      // The companion `scripts/check-coverage-ratchet.js` rejects thresholds
      // that drift > 1% below actual, so missed ratchet-ups break CI.
      // Last measured 2026-06-05 (PR #100): stmts 87.23%, branches 78.71%,
      // funcs 85.49%, lines 88.45%. Ratchet bumps branches to stay within
      // the 1% ratchet window after index-layout coverage exclusions were
      // restored.
      thresholds: {
        statements: 86.5,
        branches: 78.5,
        functions: 85,
        lines: 88,
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
