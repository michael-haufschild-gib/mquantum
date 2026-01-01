/**
 * FractalAnimationDrawer Component
 *
 * Registry-driven animation drawer that generates animation panels
 * from the object type registry. Replaces hardcoded per-type sections.
 *
 * Features:
 * - Reads available animation systems from registry
 * - Generates AnimationSystemPanel for each available system
 * - Handles dimension-specific availability (e.g., sliceAnimation for 4D+)
 * - Bridges registry schema to store actions
 *
 * @example
 * ```tsx
 * {showFractalAnim && <FractalAnimationDrawer />}
 * ```
 */

import type { AnimationSystemDef } from '@/lib/geometry/registry';
import {
    getAvailableAnimationSystems,
    getConfigStoreKey,
} from '@/lib/geometry/registry';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { m } from 'motion/react';
import React, { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AnimationSystemPanel } from './AnimationSystemPanel';

/**
 * Gets a value from a nested path in an object
 * Supports paths like 'powerAnimation.minPower' and 'sliceAnimationEnabled'
 * @param obj - The object to read from
 * @param path - Dot-separated path to the value
 * @returns The value at the path or undefined if not found
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Maps animation system parameters to store values
 *
 * The registry defines parameter keys which may be:
 * - Flat keys like 'sliceAmplitude'
 * - Nested paths like 'powerAnimation.minPower'
 *
 * This function extracts current values from the config store.
 * @param config - The config store object
 * @param system - The animation system definition
 * @returns Record of parameter names to their current values
 */
function extractParamValues(
  config: Record<string, unknown>,
  system: AnimationSystemDef
): Record<string, number> {
  const values: Record<string, number> = {};

  for (const paramKey of Object.keys(system.params)) {
    // Try nested path first (e.g., 'powerAnimation.minPower')
    const value = getNestedValue(config, paramKey);
    if (typeof value === 'number') {
      values[paramKey] = value;
    }
  }

  return values;
}

/**
 * Gets the enabled state for an animation system from config
 * Supports both flat keys (e.g., 'sliceAnimationEnabled')
 * and nested paths (e.g., 'juliaConstantAnimation.enabled')
 * @param config - Animation configuration object
 * @param system - Animation system definition
 * @returns True if the system is enabled
 */
function getSystemEnabled(
  config: Record<string, unknown>,
  system: AnimationSystemDef
): boolean {
  const enabledKey = system.enabledKey;
  const value = getNestedValue(config, enabledKey);
  return typeof value === 'boolean' ? value : system.enabledByDefault;
}

/**
 * FractalAnimationDrawer renders animation controls for the current object type.
 *
 * It reads the available animation systems from the registry and generates
 * AnimationSystemPanel components for each one. This eliminates the need
 * for hardcoded per-type UI sections.
 */
export const FractalAnimationDrawer: React.FC = React.memo(() => {
  const objectType = useGeometryStore((state) => state.objectType);
  const dimension = useGeometryStore((state) => state.dimension);

  // Get the config store key from registry
  const configKey = useMemo(() => getConfigStoreKey(objectType), [objectType]);

  // Get available animation systems from registry
  const systems = useMemo(
    () => getAvailableAnimationSystems(objectType, dimension),
    [objectType, dimension]
  );

  // Get config from store based on object type
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => {
    if (configKey && configKey in state) {
      const value = state[configKey as keyof typeof state];
      // Only return config objects, not functions (store actions)
      if (typeof value === 'object' && value !== null) {
        return value as unknown as Record<string, unknown>;
      }
    }
    return {};
  });
  const config = useExtendedObjectStore(extendedObjectSelector);

  // Handler to update config in store
  const updateConfig = useCallback(
    (updates: Record<string, unknown>) => {
      const state = useExtendedObjectStore.getState();

      for (const [key, value] of Object.entries(updates)) {
        // Determine setter name based on configKey from registry
        let setterName: string;
        const currentConfigKey = configKey;

        if (currentConfigKey === 'mandelbulb') {
          // Mandelbulb uses flat keys: 'powerMin' → 'setMandelbulbPowerMin'
          setterName = `setMandelbulb${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        } else if (currentConfigKey === 'schroedinger') {
          // Schroedinger uses flat keys like mandelbulb
          setterName = `setSchroedinger${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        } else {
          // Default fallback (shouldn't happen for fractals)
          continue;
        }

        const setter = state[setterName as keyof typeof state];
        if (typeof setter === 'function') {
          (setter as (v: unknown) => void)(value);
        }
      }
    },
    [configKey]
  );

  // If no animation systems available, don't render anything
  if (Object.keys(systems).length === 0) {
    return null;
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-full left-0 right-0 bg-panel-bg/95 backdrop-blur-xl border-t border-b border-panel-border z-20 shadow-2xl max-h-[400px] overflow-y-auto"
      data-testid="fractal-animation-drawer"
    >
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(systems).map(([systemKey, system]) => (
          <AnimationSystemPanel
            key={systemKey}
            systemKey={systemKey}
            system={system}
            enabled={getSystemEnabled(config, system)}
            values={extractParamValues(config, system)}
            onToggle={(enabled) => updateConfig({ [system.enabledKey]: enabled })}
            onParamChange={(paramKey, value) => updateConfig({ [paramKey]: value })}
          />
        ))}
      </div>
    </m.div>
  );
});

FractalAnimationDrawer.displayName = 'FractalAnimationDrawer';

export default FractalAnimationDrawer;
