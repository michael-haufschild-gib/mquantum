import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
// Initialize WASM module for high-performance animation operations
// This is async and non-blocking - functions fallback to JS until ready
import { initAnimationWasm } from '@/lib/wasm'

import App from './App.tsx'
void initAnimationWasm()

// Expose stores on window for benchmark/profiling specs and console debugging.
//
// WHY window globals instead of page.evaluate(import()):
// Vite HMR can cause `await import('/src/stores/foo.ts')` inside page.evaluate()
// to resolve to a fresh module instance that differs from the one the running
// React tree holds. Window globals guarantee same-instance access regardless
// of HMR state, which benchmark specs rely on for accurate profiling.
//
// WHY dynamic imports:
// Static imports at module top-level are unconditionally in the module graph.
// Dynamic import() inside the DEV guard is dead-code-eliminated by Vite in
// production builds. The stores are already loaded by App.tsx, so these
// resolve from the module cache instantly — no timing issues.
if (import.meta.env.DEV) {
  void Promise.all([
    import('@/stores/geometryStore'),
    import('@/stores/uiStore'),
    import('@/stores/environmentStore'),
    import('@/stores/appearanceStore'),
    import('@/stores/layoutStore'),
    import('@/stores/postProcessingStore'),
    import('@/stores/extendedObjectStore'),
    import('@/stores/performanceStore'),
    import('@/stores/performanceMetricsStore'),
    import('@/stores/animationStore'),
    import('@/stores/diagnosticsStore'),
    import('@/stores/measurementStore'),
    import('@/stores/simulationStateStore'),
    import('@/stores/srmtDiagnosticStore'),
    import('@/stores/srmtSweepStore'),
    import('@/lib/physics/pauli/presets'),
  ]).then(
    ([
      geo,
      ui,
      env,
      app,
      layout,
      pp,
      ext,
      perf,
      perfMetrics,
      anim,
      diag,
      meas,
      sim,
      srmtDiag,
      srmtSweep,
      pauliPresets,
    ]) => {
      window.__GEOMETRY_STORE__ = geo.useGeometryStore
      window.__UI_STORE__ = ui.useUIStore
      window.__ENVIRONMENT_STORE__ = env.useEnvironmentStore
      window.__APPEARANCE_STORE__ = app.useAppearanceStore
      window.__LAYOUT_STORE__ = layout.useLayoutStore
      window.__POST_PROCESSING_STORE__ = pp.usePostProcessingStore
      window.__EXTENDED_OBJECT_STORE__ = ext.useExtendedObjectStore
      window.__PERFORMANCE_STORE__ = perf.usePerformanceStore
      window.__PERFORMANCE_METRICS_STORE__ = perfMetrics.usePerformanceMetricsStore
      window.__ANIMATION_STORE__ = anim.useAnimationStore
      window.__DIAGNOSTICS_STORE__ = diag.useDiagnosticsStore
      window.__MEASUREMENT_STORE__ = meas.useMeasurementStore
      window.__SIMULATION_STATE_STORE__ = sim.useSimulationStateStore
      window.__SRMT_DIAGNOSTIC_STORE__ = srmtDiag.useSrmtDiagnosticStore
      window.__SRMT_SWEEP_STORE__ = srmtSweep.useSrmtSweepStore
      window.__PAULI_SCENARIO_PRESETS__ = pauliPresets.PAULI_SCENARIO_PRESETS
    }
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find the root element')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
