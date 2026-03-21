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
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/scripts/playwright/**', // Playwright tests run separately
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
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
        'src/rendering/webgpu/passes/TemporalCloudPass.ts',
        'src/rendering/webgpu/passes/TemporalCloudDepthPass.ts',
        'src/rendering/webgpu/passes/SMAAPass.ts',
        'src/rendering/webgpu/passes/FullscreenPass.ts',
        'src/rendering/webgpu/passes/FrameBlendingPass.ts',
        'src/rendering/webgpu/passes/CompositePass.ts',
        'src/rendering/webgpu/passes/FXAAPass.ts',
        'src/rendering/webgpu/passes/DepthPass.ts',
        'src/rendering/webgpu/passes/NormalPass.ts',
        'src/rendering/webgpu/passes/MainObjectMRTPass.ts',
        'src/rendering/webgpu/passes/gizmoGround.ts',
        'src/rendering/webgpu/renderers/WebGPUSkyboxRenderer.ts',
        'src/rendering/webgpu/renderers/skyboxVertexData.ts',
        'src/rendering/webgpu/renderers/strategies/TdseBecStrategy.ts',
        'src/rendering/webgpu/core/WebGPUUniformBuffer.ts',
        'src/rendering/renderers/base/useRotationUpdates.ts',
      ],
      thresholds: {
        statements: 59,
        branches: 52.5,
        functions: 57,
        lines: 59.5,
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
      '@/utils': path.resolve(import.meta.dirname, './src/utils'),
      // Mock WASM module for tests (Vite import analysis runs before vitest mocks)
      'mdimension-core': path.resolve(
        import.meta.dirname,
        './src/tests/__mocks__/mdimension-core.ts'
      ),
    },
  },
})
