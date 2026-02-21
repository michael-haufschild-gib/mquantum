/**
 * ObjectSettingsSection Component
 *
 * Displays type-specific settings for the schroedinger object type.
 * Uses the registry to dynamically load the appropriate controls component.
 *
 * Features:
 * - Dynamic lazy loading of controls via registry
 * - Code-split controls components for smaller initial bundle
 * - Unified control rendering across all object types
 */

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import {
  getControlsComponent,
  getControlsComponentKey,
  hasControlsComponent,
} from '@/lib/geometry/registry'
import { useGeometryStore } from '@/stores/geometryStore'
import React, { Suspense, useMemo } from 'react'

/**
 *
 */
export interface ObjectSettingsSectionProps {
  className?: string
}

/**
 * Skeleton loader for controls while they're being loaded
 * @returns The skeleton loading UI
 */
const ControlsSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse" data-testid="controls-skeleton">
    <div className="h-4 bg-panel-border/50 rounded w-24" />
    <div className="h-8 bg-panel-border/30 rounded" />
    <div className="h-8 bg-panel-border/30 rounded" />
  </div>
)

/**
 * Error fallback for failed component loads
 * @returns The error fallback UI
 */
const ControlsError: React.FC = () => (
  <div
    className="p-3 text-sm text-danger bg-danger rounded-md border border-danger-border"
    data-testid="controls-error"
  >
    <p className="font-medium">Failed to load controls</p>
    <p className="text-xs text-danger mt-1">Please refresh the page</p>
  </div>
)

const CONTROLS_COMPONENTS: Record<string, React.ComponentType<unknown> | null> = {
  SchroedingerControls: getControlsComponent('SchroedingerControls'),
}

/**
 * Main ObjectSettingsSection component
 *
 * Displays controls specific to the currently selected object type.
 * Uses the registry to dynamically load the appropriate controls component,
 * enabling code-splitting for smaller initial bundle size.
 *
 * @param root0 - Component props
 * @param root0.className - Optional CSS class name
 * @returns React element displaying object-specific settings controls
 */
export const ObjectSettingsSection: React.FC<ObjectSettingsSectionProps> = React.memo(
  ({ className = '' }) => {
    const objectType = useGeometryStore((state) => state.objectType)

    // Get the controls component key from registry
    const componentKey = useMemo(() => getControlsComponentKey(objectType), [objectType])

    // Use a static component registry to avoid creating component types during render.
    const ControlsComponent = useMemo(() => {
      if (!componentKey || !hasControlsComponent(componentKey)) {
        return null
      }
      return CONTROLS_COMPONENTS[componentKey] ?? null
    }, [componentKey])

    return (
      <div className={className} data-testid="object-settings-section">
        {ControlsComponent && (
          <ErrorBoundary fallback={<ControlsError />}>
            <Suspense fallback={<ControlsSkeleton />}>
              <ControlsComponent />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    )
  }
)

ObjectSettingsSection.displayName = 'ObjectSettingsSection'
