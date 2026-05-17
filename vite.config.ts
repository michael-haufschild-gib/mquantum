import { execSync } from 'node:child_process'
import process from 'node:process'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import svgr from 'vite-plugin-svgr'
import wasm from 'vite-plugin-wasm'

/**
 * Short git SHA for build provenance. Surfaced to the client via
 * `import.meta.env.VITE_GIT_SHA` and read by the SRMT sweep reproducibility
 * manifest. Falls back to `'unknown'` on detached checkouts / zipped
 * downloads / non-git environments.
 */
function resolveGitSha(): string {
  // Hermetic / CI builds can inject the SHA explicitly rather than
  // depending on a working `git` binary inside the build sandbox.
  const envSha = process.env.VITE_GIT_SHA?.trim()
  if (envSha) return envSha
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}
const GIT_SHA = resolveGitSha()

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
  ['node_modules/framer-motion', 'motion'],
  ['node_modules/motion', 'motion'],
  ['node_modules/@vercel/analytics', 'analytics'],
  ['node_modules/fzstd', 'rendering-skybox-codec'],
  ['node_modules/detect-gpu', 'detect-gpu'],
  ['node_modules/mediabunny', 'mediabunny'],
]

/** Source path fragment → chunk name. Order matters: first match wins. */
const SOURCE_CHUNKS: [string, string][] = [
  // Leaf chunk — shared utils imported by both stores and physics.
  ['/lib/logger', 'core-utils'],
  ['/constants/', 'core-utils'],
  ['/assets/defaults/scenes.json', 'examples-scenes'],
  ['/assets/defaults/styles.json', 'examples-styles'],
  // Shaders — non-webgpu rendering modules (palette types, light types)
  ['/rendering/lights/', 'shaders'],
  // Compute-mode shader strings are only needed after the matching lazy
  // strategy imports. Keep them out of the default analytic shader chunk.
  ['/rendering/webgpu/shaders/schroedinger/compute/freeScalarNDIndex', 'rendering-compute-shared'],
  ['/rendering/webgpu/shaders/schroedinger/compute/pmlProfile', 'rendering-compute-shared'],
  ['/rendering/webgpu/shaders/schroedinger/compute/tdseComplexPack', 'rendering-compute-shared'],
  ['/rendering/webgpu/shaders/schroedinger/compute/tdseSharedMemFFT', 'rendering-compute-shared'],
  ['/rendering/webgpu/shaders/schroedinger/compute/tdseStockhamFFT', 'rendering-compute-shared'],
  ['/rendering/webgpu/shaders/schroedinger/compute/carpetSlice', 'rendering-carpet'],
  ['/rendering/webgpu/shaders/schroedinger/compute/tdse', 'rendering-tdse-bec'],
  ['/rendering/webgpu/shaders/schroedinger/compute/bec', 'rendering-tdse-bec'],
  ['/rendering/webgpu/shaders/schroedinger/compute/gramSchmidt', 'rendering-tdse-bec'],
  ['/rendering/webgpu/shaders/schroedinger/compute/observables', 'rendering-tdse-bec'],
  ['/rendering/webgpu/shaders/schroedinger/compute/energySpectralDensity', 'rendering-tdse-bec'],
  ['/rendering/webgpu/shaders/schroedinger/compute/vortexDetect', 'rendering-tdse-bec'],
  ['/rendering/webgpu/shaders/schroedinger/compute/freeScalar', 'rendering-fsf'],
  ['/rendering/webgpu/shaders/schroedinger/compute/dirac', 'rendering-dirac'],
  ['/rendering/webgpu/shaders/schroedinger/compute/pauli', 'rendering-pauli'],
  ['/rendering/webgpu/shaders/schroedinger/compute/quantumWalk', 'rendering-qw'],
  ['/rendering/webgpu/shaders/schroedinger/compute/qw', 'rendering-qw'],
  ['/rendering/webgpu/shaders/schroedinger/compute/composeAds', 'rendering-ads'],
  ['/rendering/webgpu/shaders/schroedinger/quantum/antiDeSitter', 'rendering-ads'],
  // Schroedinger analytic/render shaders (must precede generic /webgpu/shaders/ rule)
  ['/rendering/webgpu/shaders/schroedinger/', 'shaders-schroedinger'],
  ['/rendering/webgpu/shaders/postprocessing/bloom', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/shaders/postprocessing/fxaa', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/shaders/postprocessing/smaa', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/shaders/skybox/', 'rendering-skybox'],
  ['/rendering/webgpu/shaders/', 'shaders'],
  // Quantum compute strategies are lazy-loaded by mode. Keep their heavy
  // compute-pass code out of the default analytic rendering startup chunk.
  ['/rendering/webgpu/renderers/strategies/TdseBec', 'rendering-tdse-bec'],
  ['/rendering/webgpu/renderers/strategies/tdse', 'rendering-tdse-bec'],
  ['/rendering/webgpu/passes/TDSE', 'rendering-tdse-bec'],
  ['/rendering/webgpu/passes/DisorderOverlay', 'rendering-tdse-bec'],
  ['/rendering/webgpu/passes/ObservablesComputeSetup', 'rendering-tdse-bec'],
  ['/rendering/webgpu/passes/tdseUniformsLayout', 'rendering-tdse-bec'],
  ['/rendering/webgpu/renderers/strategies/DiracStrategy', 'rendering-dirac'],
  ['/rendering/webgpu/passes/Dirac', 'rendering-dirac'],
  ['/rendering/webgpu/renderers/strategies/PauliStrategy', 'rendering-pauli'],
  ['/rendering/webgpu/passes/Pauli', 'rendering-pauli'],
  ['/rendering/webgpu/renderers/strategies/FreeScalarFieldStrategy', 'rendering-fsf'],
  ['/rendering/webgpu/passes/FreeScalar', 'rendering-fsf'],
  ['/rendering/webgpu/passes/fsf', 'rendering-fsf'],
  ['/rendering/webgpu/renderers/strategies/QuantumWalkStrategy', 'rendering-qw'],
  ['/rendering/webgpu/passes/QuantumWalk', 'rendering-qw'],
  ['/rendering/webgpu/renderers/strategies/WheelerDeWitt', 'rendering-wdw'],
  ['/rendering/webgpu/renderers/strategies/AntiDeSitterStrategy', 'rendering-ads'],
  ['/rendering/webgpu/passes/Ads', 'rendering-ads'],
  ['/rendering/webgpu/renderers/quantumCarpetRuntime', 'rendering-carpet'],
  ['/rendering/webgpu/passes/CarpetSliceComputePass', 'rendering-carpet'],
  ['/rendering/webgpu/passes/BloomPass', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/passes/FrameBlendingPass', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/passes/FXAAPass', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/passes/PaperTexturePass', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/passes/paperTextureShader', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/passes/SMAAPass', 'rendering-postprocess-optional'],
  ['/rendering/webgpu/renderers/WebGPUSkyboxRenderer', 'rendering-skybox'],
  ['/rendering/webgpu/renderers/skybox', 'rendering-skybox'],
  ['/rendering/webgpu/utils/ktx2Loader', 'rendering-skybox'],
  // Mode-specific physics used only after lazy mode/component entry points.
  // Keep cross-mode helpers below in the generic physics chunk.
  ['/lib/physics/antiDeSitter/densityGrid', 'rendering-ads'],
  ['/lib/physics/antiDeSitter/hkll', 'rendering-ads'],
  ['/lib/physics/antiDeSitter/btz', 'rendering-ads'],
  ['/lib/physics/freeScalar/presets', 'rendering-fsf'],
  ['/lib/physics/freeScalar/kSpaceOccupation', 'rendering-fsf'],
  ['/lib/physics/freeScalar/kSpaceDisplayTransforms', 'rendering-fsf'],
  ['/lib/physics/freeScalar/kSpaceRadialSpectrum', 'rendering-fsf'],
  ['/lib/physics/freeScalar/kSpaceWorker', 'rendering-fsf'],
  ['/lib/physics/tdse/presets', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/curvedMetricPresets', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/decoherencePresets', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/tdsePresetTypes', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/diagnostics', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/heller', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/classicalOrbit', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/scarMetric', 'rendering-tdse-bec'],
  // Pure TDSE helpers used by eager stores/UI must stay below the lazy
  // renderer chunks; otherwise stores and rendering-tdse-bec form a cycle.
  ['/lib/physics/tdse/wormholeCoupling', 'physics'],
  ['/lib/physics/tdse/disorderNoise', 'rendering-tdse-bec'],
  ['/lib/physics/tdse/potentialProfile', 'rendering-tdse-bec'],
  ['/lib/physics/coordinateEntanglement', 'rendering-tdse-bec'],
  ['/lib/physics/dirac/presets', 'rendering-dirac'],
  ['/lib/physics/dirac/diracAlgebra', 'rendering-dirac'],
  ['/lib/physics/dirac/cliffordAlgebraFallback', 'rendering-dirac'],
  ['/lib/physics/pauli/presets', 'rendering-pauli'],
  ['/lib/physics/quantumWalk/presets', 'rendering-qw'],
  ['/lib/physics/bec/presets', 'rendering-tdse-bec'],
  ['/lib/physics/wheelerDeWitt/presets', 'rendering-wdw'],
  ['/stores/diagnostics/carpetStore', 'rendering-carpet'],
  ['/stores/diagnostics/pageCurveStore', 'diagnostics-deferred'],
  ['/stores/diagnostics/wormholeCoherenceStore', 'diagnostics-deferred'],
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
  // Right-panel tab bodies must precede the parent panel match.
  ['/components/layout/EditorRightPanel/AnalysisTabContent', 'components-analysis-deferred'],
  ['/components/layout/EditorRightPanel/SceneTabContent', 'components-scene-system-deferred'],
  ['/components/layout/EditorRightPanel/SystemTabContent', 'components-scene-system-deferred'],
  ['/components/layout/EditorLeftPanel', 'components-panels'],
  ['/components/layout/EditorRightPanel', 'components-panels'],
  ['/components/layout/EditorBottomPanel', 'components-panels'],
  ['/components/layout/TimelineControls', 'components-timeline-deferred'],
  ['/components/sections/Geometry/ObjectSettingsSection', 'components-geometry-deferred'],
  ['/components/sections/Geometry/SchroedingerControls/tdseControlsConstants', 'components-panels'],
  ['/components/sections/Geometry/SchroedingerControls/', 'components-geometry-deferred'],
  ['/components/sections/Geometry/PauliSpinorControls/', 'components-geometry-deferred'],
  // Shared section primitives are used by deferred section chunks.
  ['/components/sections/Section', 'components'],
  ['/components/sections/UnavailableSection', 'components'],
  ['/components/sections/Analysis/', 'components-analysis-deferred'],
  ['/components/sections/Environment/', 'components-scene-system-deferred'],
  ['/components/sections/Lights/', 'components-scene-system-deferred'],
  ['/components/sections/PostProcessing/', 'components-scene-system-deferred'],
  ['/components/sections/Performance/', 'components-scene-system-deferred'],
  ['/components/sections/Settings/', 'components-scene-system-deferred'],
  ['/components/sections/', 'components-panels'],
  // Lazy-loaded overlays — deferred until user action
  ['/components/canvas/HudPanelGates', 'components-deferred'],
  ['/components/canvas/PerformanceMonitor', 'components-deferred'],
  ['/components/canvas/QuantumCarpetPanel', 'components-deferred'],
  ['/components/overlays/ScreenshotModal', 'components-deferred'],
  ['/components/overlays/ExportModal', 'components-deferred'],
  ['/components/overlays/export/', 'components-deferred'],
  ['/components/overlays/CropEditor', 'components-deferred'],
  ['/components/overlays/CropBox', 'components-deferred'],
  ['/components/overlays/HawkingPageCurvePanel', 'components-deferred'],
  ['/components/overlays/WormholeCoherencePanel', 'components-deferred'],
  ['/components/overlays/pageCurve/', 'components-deferred'],
  ['/components/presets/', 'components-deferred'],
  ['/components/layout/CanvasContextMenuContent', 'components-deferred'],
  ['/components/layout/CommandPalette', 'components-deferred'],
  ['/components/layout/ShortcutsOverlay', 'components-deferred'],
  // App installs shortcut handlers at startup, while ShortcutsOverlay reads
  // the same shortcut metadata lazily. Keep the shared hook in the initial UI
  // chunk so Rollup does not pull the whole deferred overlay/export chunk into
  // the startup graph.
  ['/hooks/useKeyboardShortcuts', 'components'],
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
  define: {
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(GIT_SHA),
  },
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
    },
  },
  // Pre-bundle known dependencies to speed up dev server cold start
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'zustand',
      'zustand/react/shallow',
      'motion/react',
    ],
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
    // Wire-size budgets are enforced by scripts/check-bundle-size.js.
    // Keep Vite's uncompressed warning above intentional shader chunks.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: assignChunk,
      },
    },
  },
}))
