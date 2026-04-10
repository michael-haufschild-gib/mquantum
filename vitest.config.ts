import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/tests/setup.ts',
    css: true,
    pool: 'vmThreads',
    maxWorkers: 4,
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
      // Last measured 2026-04-04: stmts 63.05%, branches 54.79%, funcs 61.74%, lines 63.21%
      // Recalibrated: added 4 GPU-only setup/buffer files to exclusions (TDSE, TemporalCloud).
      // Added 7 new test files: ndArray, monitoringSweepStore, diagnosticsStore,
      // coordinateEntanglementStore, tdseStochasticSetters, tdseUiSetters,
      // decoherencePresets — 136 new tests covering recent feature additions.
      thresholds: {
        statements: 62.5,
        branches: 54.5,
        functions: 61.5,
        lines: 62.5,
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
