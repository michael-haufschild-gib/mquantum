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
        manualChunks(id) {
          // React + its internal deps (scheduler) in one chunk
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/zustand')) return 'zustand'
          if (id.includes('node_modules/motion')) return 'motion'
          // detect-gpu and mediabunny are dynamically imported — let Rollup
          // split them into async chunks instead of bundling with vendor.
          if (id.includes('node_modules/detect-gpu')) return 'detect-gpu'
          if (id.includes('node_modules/mediabunny')) return 'mediabunny'
          if (id.includes('node_modules/')) return 'vendor'
          // Split shaders by subdomain
          if (id.includes('/rendering/webgpu/shaders/schroedinger/')) return 'shaders-schroedinger'
          if (id.includes('/rendering/webgpu/shaders/')) return 'shaders'
          // Rendering: passes + core + renderers + graph (tightly coupled via BasePass)
          if (
            id.includes('/rendering/webgpu/passes/') ||
            id.includes('/rendering/webgpu/core/') ||
            id.includes('/rendering/webgpu/renderers/') ||
            id.includes('/rendering/webgpu/graph/')
          ) {
            return 'rendering'
          }
          // Split physics/math
          if (id.includes('/lib/physics/') || id.includes('/lib/math/')) return 'physics'
          // Split stores
          if (id.includes('/stores/')) return 'stores'
          // Split components: panel content is lazy-loaded after first frame
          if (id.includes('/components/layout/EditorLeftPanel')) return 'components-panels'
          if (id.includes('/components/layout/EditorRightPanel')) return 'components-panels'
          if (id.includes('/components/layout/EditorBottomPanel')) return 'components-panels'
          if (id.includes('/components/sections/')) return 'components-panels'
          if (id.includes('/components/')) return 'components'
        },
      },
    },
  },
}))
