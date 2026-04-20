/**
 * Window extensions for debugging Zustand stores from the browser console.
 * Set in DEV mode always, and in production when ?_bench URL param is present.
 */

import type { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import type { useAnimationStore } from '@/stores/animationStore'
import type { useAppearanceStore } from '@/stores/appearanceStore'
import type { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import type { useEnvironmentStore } from '@/stores/environmentStore'
import type { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import type { useGeometryStore } from '@/stores/geometryStore'
import type { useLayoutStore } from '@/stores/layoutStore'
import type { useMeasurementStore } from '@/stores/measurementStore'
import type { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import type { usePerformanceStore } from '@/stores/performanceStore'
import type { usePostProcessingStore } from '@/stores/postProcessingStore'
import type { useSimulationStateStore } from '@/stores/simulationStateStore'
import type { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'
import type { useSrmtSweepStore } from '@/stores/srmtSweepStore'
import type { useUIStore } from '@/stores/uiStore'

declare global {
  interface Window {
    __GEOMETRY_STORE__?: typeof useGeometryStore
    __UI_STORE__?: typeof useUIStore
    __ENVIRONMENT_STORE__?: typeof useEnvironmentStore
    __APPEARANCE_STORE__?: typeof useAppearanceStore
    __LAYOUT_STORE__?: typeof useLayoutStore
    __POST_PROCESSING_STORE__?: typeof usePostProcessingStore
    __EXTENDED_OBJECT_STORE__?: typeof useExtendedObjectStore
    __PERFORMANCE_STORE__?: typeof usePerformanceStore
    __PERFORMANCE_METRICS_STORE__?: typeof usePerformanceMetricsStore
    __ANIMATION_STORE__?: typeof useAnimationStore
    __DIAGNOSTICS_STORE__?: typeof useDiagnosticsStore
    __MEASUREMENT_STORE__?: typeof useMeasurementStore
    __SIMULATION_STATE_STORE__?: typeof useSimulationStateStore
    __SRMT_DIAGNOSTIC_STORE__?: typeof useSrmtDiagnosticStore
    __SRMT_SWEEP_STORE__?: typeof useSrmtSweepStore
    __PAULI_SCENARIO_PRESETS__?: typeof PAULI_SCENARIO_PRESETS
  }
}
