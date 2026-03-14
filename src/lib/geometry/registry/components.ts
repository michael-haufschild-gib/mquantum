/**
 * Object Type Registry - Dynamic Component Loader
 *
 * Provides lazy loading of controls components via React.lazy().
 * This enables code splitting so each control component is loaded
 * only when needed.
 *
 * @see src/components/sections/Geometry/ObjectSettingsSection.tsx for usage
 */

import { lazy, type ComponentType } from 'react'

/**
 * Cache for lazily loaded components.
 * Prevents re-creating lazy wrappers on each call.
 */
const componentCache = new Map<string, ComponentType<unknown>>()

/**
 * Dynamic import mapping for controls components.
 * Vite requires static import paths for proper code splitting.
 *
 * Keys must match the controlsComponentKey in registry entries.
 */
const componentLoaders: Record<string, () => Promise<{ default: ComponentType<unknown> }>> = {
  SchroedingerControls: () =>
    import('@/components/sections/Geometry/SchroedingerControls').then((m) => ({
      default: m.SchroedingerControls as ComponentType<unknown>,
    })),
  PauliSpinorControls: () =>
    import('@/components/sections/Geometry/PauliSpinorControls').then((m) => ({
      default: m.PauliSpinorControls as ComponentType<unknown>,
    })),
}

/**
 * Gets a lazily-loaded controls component by key.
 * Returns a React.lazy component that can be rendered with Suspense.
 *
 * @param componentKey - The component key from registry (e.g., "SchroedingerControls")
 * @returns The lazy component, or null if not found
 *
 * @example
 * ```tsx
 * const ControlsComponent = getControlsComponent('SchroedingerControls');
 *
 * return (
 *   <Suspense fallback={<ControlsSkeleton />}>
 *     {ControlsComponent && <ControlsComponent />}
 *   </Suspense>
 * );
 * ```
 */
export function getControlsComponent(componentKey: string): ComponentType<unknown> | null {
  // Check if we have a loader for this key
  const loader = componentLoaders[componentKey]
  if (!loader) {
    console.warn(`[Registry] No component loader found for key: ${componentKey}`)
    return null
  }

  // Return cached component if available
  if (componentCache.has(componentKey)) {
    return componentCache.get(componentKey)!
  }

  // Create lazy component and cache it
  const LazyComponent = lazy(loader)
  componentCache.set(componentKey, LazyComponent)
  return LazyComponent
}

/**
 * Checks if a controls component exists for the given key.
 *
 * @param componentKey - The component key to check
 * @returns true if a component loader exists
 */
export function hasControlsComponent(componentKey: string): boolean {
  return componentKey in componentLoaders
}
