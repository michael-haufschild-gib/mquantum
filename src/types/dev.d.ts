/**
 * Window extensions for debugging Zustand stores from the browser console.
 * Set in DEV mode always, and in production when ?_bench URL param is present.
 */

import type { useAppearanceStore } from '@/stores/appearanceStore'
import type { useEnvironmentStore } from '@/stores/environmentStore'
import type { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import type { useGeometryStore } from '@/stores/geometryStore'
import type { useLayoutStore } from '@/stores/layoutStore'
import type { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import type { usePerformanceStore } from '@/stores/performanceStore'
import type { usePostProcessingStore } from '@/stores/postProcessingStore'
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
  }
}
