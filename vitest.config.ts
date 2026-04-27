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
      ],
      // Coverage ratchet: thresholds track current actuals (rounded down to
      // nearest 0.5%). Raise when coverage improves. Lower only when the
      // denominator changes (new files, exclusion list changes) — document why.
      // The companion `scripts/check-coverage-ratchet.js` rejects thresholds
      // that drift > 1% below actual, so missed ratchet-ups break CI.
      // Last measured 2026-04-27: stmts 72.80%, branches 63.00%, funcs 72.53%, lines 73.36%
      // Functions lowered 74 → 72.5 — PR #69 added new and modified source
      // files (uniformPackingHOTerms.ts, WebGPUSchrodingerRenderer.ts edits,
      // schrodingerFrameUpdate.ts edits) without proportional test coverage,
      // so the function denominator grew faster than the numerator.
      // Statements 71.5 → 72.5 and lines 71.5 → 73 raised to track actuals
      // within 1% per the ratchet contract.
      thresholds: {
        statements: 72.5,
        branches: 63,
        functions: 72.5,
        lines: 73,
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
