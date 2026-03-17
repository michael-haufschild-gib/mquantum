/**
 * Dev-only Window extensions for debugging Zustand stores from the browser console.
 * These properties are only set in development mode (import.meta.env.DEV).
 */

import type { useGeometryStore } from '@/stores/geometryStore'
import type { useUIStore } from '@/stores/uiStore'
import type { useEnvironmentStore } from '@/stores/environmentStore'
import type { useAppearanceStore } from '@/stores/appearanceStore'
import type { useLayoutStore } from '@/stores/layoutStore'
import type { usePostProcessingStore } from '@/stores/postProcessingStore'
import type { useExtendedObjectStore } from '@/stores/extendedObjectStore'

declare global {
  interface Window {
    __GEOMETRY_STORE__?: typeof useGeometryStore
    __UI_STORE__?: typeof useUIStore
    __ENVIRONMENT_STORE__?: typeof useEnvironmentStore
    __APPEARANCE_STORE__?: typeof useAppearanceStore
    __LAYOUT_STORE__?: typeof useLayoutStore
    __POST_PROCESSING_STORE__?: typeof usePostProcessingStore
    __EXTENDED_OBJECT_STORE__?: typeof useExtendedObjectStore
  }
}
