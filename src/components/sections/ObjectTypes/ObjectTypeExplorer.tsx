import { m } from 'motion/react'
import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useObjectTypeInitialization } from '@/hooks/useObjectTypeInitialization'
import { useToast } from '@/hooks/useToast'
import { soundManager } from '@/lib/audio/SoundManager'
import {
  type AvailableQuantumTypeInfo,
  getAvailableQuantumTypes,
  getQuantumTypeEntry,
  resolveQuantumTypeKey,
} from '@/lib/geometry/registry'
import { useCoordinateEntanglementStore } from '@/stores/diagnostics/coordinateEntanglementStore'
import { useMonitoringSweepStore } from '@/stores/diagnostics/monitoringSweepStore'
import { useQuantumnessAtlasStore } from '@/stores/diagnostics/quantumnessAtlasStore'
import {
  type ExtendedObjectState,
  useExtendedObjectStore,
} from '@/stores/scene/extendedObjectStore'
import { type GeometryState, useGeometryStore } from '@/stores/scene/geometryStore'

export const ObjectTypeExplorer: React.FC = React.memo(() => {
  const { objectType, dimension, setObjectType } = useGeometryStore(
    useShallow((state: GeometryState) => ({
      objectType: state.objectType,
      dimension: state.dimension,
      setObjectType: state.setObjectType,
    }))
  )

  const { quantumMode, setQuantumMode } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      quantumMode: state.schroedinger.quantumMode,
      setQuantumMode: state.setSchroedingerQuantumMode,
    }))
  )

  useObjectTypeInitialization(objectType, dimension)

  const { addToast } = useToast()

  // Derive the currently-selected flat key from the runtime two-field model
  const selectedKey = resolveQuantumTypeKey(objectType, quantumMode)

  // All types from the flat registry, with availability for current dimension
  const allTypes = useMemo(() => getAvailableQuantumTypes(dimension), [dimension])
  const analyticTypes = useMemo(() => allTypes.filter((t) => t.category === 'analytic'), [allTypes])
  const computeTypes = useMemo(() => allTypes.filter((t) => t.category === 'compute'), [allTypes])

  const handleSelect = useCallback(
    (entry: AvailableQuantumTypeInfo) => {
      soundManager.playClick()

      // Abort any running sweep before switching type/mode so disabled controls re-enable
      useCoordinateEntanglementStore.getState().abortSweep()
      useMonitoringSweepStore.getState().abort()
      useQuantumnessAtlasStore.getState().abortSweep()

      const prevDim = useGeometryStore.getState().dimension

      if (entry.key === 'pauliSpinor') {
        // Pauli uses a different ObjectType
        setObjectType('pauliSpinor')
      } else if (entry.key === 'bellTest') {
        // Bell Pair has its own ObjectType — two-qubit spin Hilbert space
        setObjectType('bellPair')
      } else {
        // All other modes use the schroedinger ObjectType
        if (useGeometryStore.getState().objectType !== 'schroedinger') {
          setObjectType('schroedinger')
        }
        setQuantumMode(entry.key)
      }

      // Feedback toast
      const newDim = useGeometryStore.getState().dimension
      const changes: string[] = []
      if (newDim !== prevDim) changes.push(`Dimension → ${newDim}D`)
      if (entry.category === 'compute') changes.push('Representation → Position')
      if (changes.length > 0) {
        addToast(`${entry.name}: ${changes.join(', ')}`, 'info')
      }
    },
    [setObjectType, setQuantumMode, addToast]
  )

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 },
  }

  const renderCard = (entry: AvailableQuantumTypeInfo) => {
    const isSelected = selectedKey === entry.key

    return (
      <m.button
        key={entry.key}
        variants={itemVariants}
        onClick={() => handleSelect(entry)}
        onMouseEnter={() => soundManager.playHover()}
        className={`
          relative group flex flex-col p-3 rounded-lg border text-left transition-colors duration-200
          ${
            isSelected
              ? 'bg-accent/10 border-accent text-accent shadow-[0_0_15px_color-mix(in_oklch,var(--color-accent)_10%,transparent)]'
              : 'bg-[var(--bg-panel)]/30 border-panel-border hover:border-text-secondary/50 text-text-secondary hover:text-text-primary hover:bg-[var(--bg-panel)]/50'
          }
          cursor-pointer
        `}
        whileHover={{ scale: 1.01, x: 2 }}
        whileTap={{ scale: 0.98 }}
        data-testid={`object-type-${entry.key}`}
        data-selected={isSelected}
      >
        <div className="flex items-center justify-between w-full mb-1">
          <span className="font-medium text-sm">{entry.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary font-mono">
              {getQuantumTypeEntry(entry.key)?.dimensions.min ?? 1}D+
            </span>
            {isSelected && (
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full bg-accent led-glow" />
                <div className="absolute inset-0 rounded-full bg-accent" />
              </div>
            )}
          </div>
        </div>
        <span className="text-xs text-text-secondary/80 line-clamp-2 leading-relaxed">
          {entry.description}
        </span>
      </m.button>
    )
  }

  return (
    <m.div
      className="grid grid-cols-1 gap-2"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <div className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary px-1">
        Analytic
      </div>
      {analyticTypes.map(renderCard)}
      <div className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary px-1 mt-2">
        Compute (GPU)
      </div>
      {computeTypes.map(renderCard)}
    </m.div>
  )
})

ObjectTypeExplorer.displayName = 'ObjectTypeExplorer'
