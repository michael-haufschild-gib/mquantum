/**
 * Object Switcher Debug Component
 *
 * Provides a dropdown to quickly switch between object types for testing.
 * Only visible in development mode.
 *
 * @module dev-tools/ObjectSwitcher
 */

import { memo, useCallback } from 'react'

import { Select } from '@/components/ui/Select'
import type { ObjectType } from '@/lib/geometry/types'
import { useGeometryStore } from '@/stores/geometryStore'

/**
 * All available object types for testing.
 */
const OBJECT_TYPES: { value: ObjectType; label: string }[] = [
  { value: 'schroedinger', label: 'Schrödinger' },
]

/**
 * Debug component for switching between object types.
 *
 * @example
 * ```tsx
 * // In App.tsx or a debug panel
 * {import.meta.env.DEV && <ObjectSwitcher />}
 * ```
 */
export const ObjectSwitcher = memo(function ObjectSwitcher() {
  const objectType = useGeometryStore((s) => s.objectType)
  const setObjectType = useGeometryStore((s) => s.setObjectType)

  const handleChange = useCallback(
    (value: ObjectType) => {
      setObjectType(value)
    },
    [setObjectType]
  )

  return (
    <div className="fixed top-4 right-4 z-50 bg-black/80 backdrop-blur-sm p-3 rounded-lg border border-white/10 shadow-lg">
      <div className="text-xs text-white/60 mb-2 font-medium">Object Type</div>
      <Select<ObjectType> value={objectType} onChange={handleChange} options={OBJECT_TYPES} />
    </div>
  )
})
