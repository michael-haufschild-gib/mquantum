import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import svgr from 'vite-plugin-svgr'
import wasm from 'vite-plugin-wasm'

// Favicon and meta image files to copy to dist root
const faviconFiles = [
  'favicon.ico',
  'favicon-192.png',
  'favicon-512.png',
  'apple-touch-icon.png',
  'og-image.jpg',
  'twitter-card.jpg',
  'manifest.webmanifest',
]

// ── Manual chunk assignment ────────────────────────────────────────────
// Explicit chunk boundaries prevent Rollup from auto-assigning orphaned
// modules into consumer chunks, which causes circular chunk dependencies
// and TDZ ReferenceErrors in production builds.
//
// Chunk DAG (no cycles):
//   core-utils (leaf) ← physics ← stores → shaders
//                           ↑                  ↑
//                    shaders-schroedinger    rendering → stores

/** Vendor package → chunk name. Checked via id.includes(). */
const VENDOR_CHUNKS: [string, string][] = [
  ['node_modules/react-dom', 'react-vendor'],
  ['node_modules/react/', 'react-vendor'],
  ['node_modules/scheduler', 'react-vendor'],
  ['node_modules/zustand', 'zustand'],
  ['node_modules/motion', 'motion'],
  ['node_modules/detect-gpu', 'detect-gpu'],
  ['node_modules/mediabunny', 'mediabunny'],
]

/** Source path fragment → chunk name. Order matters: first match wins. */
const SOURCE_CHUNKS: [string, string][] = [
  // Leaf chunk — shared utils imported by both stores and physics.
  ['/lib/logger', 'core-utils'],
  ['/constants/', 'core-utils'],
  ['temporalDepthRegistry', 'core-utils'],
  // Shaders — non-webgpu rendering modules (palette types, light types)
  ['/rendering/lights/', 'shaders'],
  // Schroedinger shaders (must precede generic /webgpu/shaders/ rule)
  ['/rendering/webgpu/shaders/schroedinger/', 'shaders-schroedinger'],
  ['/rendering/webgpu/shaders/', 'shaders'],
  // All remaining webgpu modules
  ['/rendering/webgpu/', 'rendering'],
  // Physics — lib modules without store deps
  ['/lib/physics/', 'physics'],
  ['/lib/math/', 'physics'],
  ['/lib/geometry/', 'physics'],
  ['/lib/wasm/', 'physics'],
  ['/lib/animation/', 'physics'],
  ['/lib/colors/', 'physics'],
  ['/lib/audio/', 'physics'],
  // Stores
  ['/stores/', 'stores'],
  // Components — panels are lazy-loaded after first frame
  ['/components/layout/EditorLeftPanel', 'components-panels'],
  ['/components/layout/EditorRightPanel', 'components-panels'],
  ['/components/layout/EditorBottomPanel', 'components-panels'],
  ['/components/sections/', 'components-panels'],
  ['/components/', 'components'],
]

/** Assign a module to a named chunk, or undefined for Rollup auto-assignment. */
function assignChunk(id: string): string | undefined {
  if (id.includes('node_modules/')) {
    for (const [pattern, chunk] of VENDOR_CHUNKS) {
      if (id.includes(pattern)) return chunk
    }
    return 'vendor'
  }
  // Non-webgpu rendering/shaders/ must go to 'shaders' before the
  // generic /rendering/webgpu/ rule catches it.
  if (id.includes('/rendering/shaders/') && !id.includes('/webgpu/')) return 'shaders'
  for (const [pattern, chunk] of SOURCE_CHUNKS) {
    if (id.includes(pattern)) return chunk
  }
  // Remaining src/ files (lib/export, lib/url, hooks, types) are left
  // for Rollup — they depend on stores and land in the index chunk.
  return undefined
}

// https://vite.dev/config/
export default defineConfig((_env) => ({
  plugins: [
    tailwindcss(),
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        replaceAttrValues: { '#000': 'currentColor', '#000000': 'currentColor' },
      },
    }),
    wasm(),
    viteStaticCopy({
      targets: faviconFiles.map((file) => ({
        src: `src/assets/logo/${file}`,
        dest: '', // Copy to dist root
      })),
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@/components': path.resolve(import.meta.dirname, './src/components'),
      '@/lib': path.resolve(import.meta.dirname, './src/lib'),
      '@/hooks': path.resolve(import.meta.dirname, './src/hooks'),
      '@/stores': path.resolve(import.meta.dirname, './src/stores'),
      '@/types': path.resolve(import.meta.dirname, './src/types'),
      '@/utils': path.resolve(import.meta.dirname, './src/utils'),
    },
  },
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.ktx2'],
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: assignChunk,
      },
    },
  },
}))
