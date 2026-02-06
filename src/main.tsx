import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize WASM module for high-performance animation operations
// This is async and non-blocking - functions fallback to JS until ready
import { initAnimationWasm } from '@/lib/wasm'
initAnimationWasm()

// Expose stores for e2e testing
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useUIStore } from '@/stores/uiStore'

if (import.meta.env.DEV) {
  // @ts-expect-error - Dev-only debug store access
  window.__GEOMETRY_STORE__ = useGeometryStore
  // @ts-expect-error - Dev-only debug store access
  window.__UI_STORE__ = useUIStore
  // @ts-expect-error - Dev-only debug store access
  window.__ENVIRONMENT_STORE__ = useEnvironmentStore
  // @ts-expect-error - Dev-only debug store access
  window.__APPEARANCE_STORE__ = useAppearanceStore
  // @ts-expect-error - Dev-only debug store access
  window.__LAYOUT_STORE__ = useLayoutStore
  // @ts-expect-error - Dev-only debug store access
  window.__POST_PROCESSING_STORE__ = usePostProcessingStore
  // @ts-expect-error - Dev-only debug store access
  window.__EXTENDED_OBJECT_STORE__ = useExtendedObjectStore

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
