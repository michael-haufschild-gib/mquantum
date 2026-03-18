import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
// Initialize WASM module for high-performance animation operations
// This is async and non-blocking - functions fallback to JS until ready
import { initAnimationWasm } from '@/lib/wasm'

import App from './App.tsx'
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
  window.__GEOMETRY_STORE__ = useGeometryStore
  window.__UI_STORE__ = useUIStore
  window.__ENVIRONMENT_STORE__ = useEnvironmentStore
  window.__APPEARANCE_STORE__ = useAppearanceStore
  window.__LAYOUT_STORE__ = useLayoutStore
  window.__POST_PROCESSING_STORE__ = usePostProcessingStore
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
