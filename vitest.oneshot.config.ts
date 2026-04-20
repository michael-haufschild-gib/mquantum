import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

// Research-only override config: extends the main vitest config, but drops
// the `_oneshot*.test.ts` exclude so explicit one-shot diagnostic drivers
// can run via:
//   pnpm exec vitest run --config vitest.oneshot.config.ts <path>
// This file is intentionally NOT exported from package.json scripts — it is
// manual-invoke only. Kept alongside the main config so vite can resolve
// `@vitejs/plugin-react` through the project's node_modules tree.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/tests/setup.ts',
    css: true,
    pool: 'vmThreads',
    maxWorkers: 4,
    environmentMatchGlobs: [
      ['src/tests/lib/**', 'node'],
      ['src/tests/stores/**', 'node'],
      ['src/tests/wasm/**', 'node'],
      ['src/tests/rendering/**', 'node'],
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/scripts/playwright/**',
      '**/.claude/worktrees/**',
      // NB: '**/_oneshot*.test.ts' is INTENTIONALLY omitted vs. vitest.config.ts.
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@/components': path.resolve(import.meta.dirname, './src/components'),
      '@/lib': path.resolve(import.meta.dirname, './src/lib'),
      '@/hooks': path.resolve(import.meta.dirname, './src/hooks'),
      '@/stores': path.resolve(import.meta.dirname, './src/stores'),
      '@/types': path.resolve(import.meta.dirname, './src/types'),
      'mdimension-core': path.resolve(
        import.meta.dirname,
        './src/tests/__mocks__/mdimension-core.ts'
      ),
    },
  },
})
