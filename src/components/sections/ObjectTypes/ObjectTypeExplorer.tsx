import { m } from 'motion/react'
import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Tooltip } from '@/components/ui/Tooltip'
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

const VALIDATION_CONFIDENCE_LABELS = {
  strong: 'Strong',
  partial: 'Partial',
  fixture: 'Fixture',
} as const

const VALIDATION_CONFIDENCE_CLASSES = {
  strong: 'border-success-border bg-success-bg text-success',
  partial: 'border-warning-border bg-warning-bg text-warning',
  fixture: 'border-panel-border bg-[var(--bg-hover)] text-text-tertiary',
} as const

const VALIDATION_LEVEL_LABELS = {
  A: 'Analytical oracle',
  R: 'Reference dataset',
  P: 'Property invariant',
  C: 'Convergence',
  F: 'Regression fixture',
} as const

const SWITCH_HINT_CLASSES = {
  dimension: 'border-warning-border bg-warning-bg text-warning',
  representation: 'border-accent/40 bg-accent/10 text-accent',
  evidence: 'border-panel-border bg-[var(--bg-hover)] text-text-tertiary',
} as const

interface SwitchHint {
  key: string
  label: string
  tone: keyof typeof SWITCH_HINT_CLASSES
}

function formatValidationLevels(entry: AvailableQuantumTypeInfo): string {
  return entry.validation.levels.join('+')
}

function getDimensionSwitchHint(
  entry: AvailableQuantumTypeInfo,
  currentDimension: number,
  registryEntry: ReturnType<typeof getQuantumTypeEntry>
): SwitchHint | null {
  if (entry.available || !registryEntry) return null

  const { min, max, recommended } = registryEntry.dimensions
  if (currentDimension < min) {
    return { key: 'dimension', label: `Will switch to ${min}D`, tone: 'dimension' }
  }
  if (currentDimension > max) {
    return {
      key: 'dimension',
      label: `Will switch to ${recommended ?? max}D`,
      tone: 'dimension',
    }
  }
  return entry.disabledReason
    ? { key: 'dimension', label: entry.disabledReason, tone: 'dimension' }
    : null
}

function getRepresentationSwitchHint(
  entry: AvailableQuantumTypeInfo,
  currentRepresentation: string
): SwitchHint | null {
  if (entry.category !== 'compute' || currentRepresentation === 'position') return null
  return { key: 'representation', label: 'Will use Position', tone: 'representation' }
}

function getEvidenceHint(entry: AvailableQuantumTypeInfo): SwitchHint | null {
  if (entry.validation.confidence === 'partial') {
    return { key: 'evidence', label: 'Known limits', tone: 'evidence' }
  }
  if (entry.validation.confidence === 'fixture') {
    return { key: 'evidence', label: 'Fixture evidence only', tone: 'evidence' }
  }
  return null
}

function getSwitchHints(
  entry: AvailableQuantumTypeInfo,
  currentDimension: number,
  currentRepresentation: string,
  registryEntry: ReturnType<typeof getQuantumTypeEntry>
): SwitchHint[] {
  return [
    getDimensionSwitchHint(entry, currentDimension, registryEntry),
    getRepresentationSwitchHint(entry, currentRepresentation),
    getEvidenceHint(entry),
  ].filter((hint): hint is SwitchHint => hint !== null)
}

function renderValidationTooltip(entry: AvailableQuantumTypeInfo): React.ReactNode {
  const { validation } = entry

  return (
    <div className="max-w-72 space-y-2">
      <div className="font-semibold text-text-primary">{entry.name} validation</div>
      <div className="text-text-secondary">{validation.summary}</div>
      {validation.limitation && <div className="text-warning">{validation.limitation}</div>}
      <div className="flex flex-wrap gap-1">
        {validation.levels.map((level) => (
          <span
            key={level}
            className="rounded border border-panel-border bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-2xs text-text-secondary"
          >
            {level}: {VALIDATION_LEVEL_LABELS[level]}
          </span>
        ))}
      </div>
      <div className="space-y-1 border-t border-border-subtle pt-2">
        <div className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">
          Evidence
        </div>
        <div className="space-y-0.5">
          {validation.testRefs.slice(0, 3).map((ref) => (
            <div key={ref} className="break-all font-mono text-2xs text-text-secondary">
              {ref}
            </div>
          ))}
        </div>
        <div className="break-all font-mono text-2xs text-text-tertiary">{validation.source}</div>
      </div>
    </div>
  )
}

export const ObjectTypeExplorer: React.FC = React.memo(() => {
  const { objectType, dimension, setObjectType } = useGeometryStore(
    useShallow((state: GeometryState) => ({
      objectType: state.objectType,
      dimension: state.dimension,
      setObjectType: state.setObjectType,
    }))
  )

  const { quantumMode, representation, setQuantumMode } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      quantumMode: state.schroedinger.quantumMode,
      representation: state.schroedinger.representation,
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
    const registryEntry = getQuantumTypeEntry(entry.key)
    const validationClass = VALIDATION_CONFIDENCE_CLASSES[entry.validation.confidence]
    const validationLabel = VALIDATION_CONFIDENCE_LABELS[entry.validation.confidence]
    const validationLevels = formatValidationLevels(entry)
    const switchHints = getSwitchHints(entry, dimension, representation, registryEntry)

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
        aria-label={[entry.name, entry.disabledReason, ...switchHints.map((hint) => hint.label)]
          .filter(Boolean)
          .join('. ')}
        whileHover={{ scale: 1.01, x: 2 }}
        whileTap={{ scale: 0.98 }}
        data-testid={`object-type-${entry.key}`}
        data-selected={isSelected}
      >
        <div className="flex items-center justify-between w-full mb-1">
          <span className="font-medium text-sm">{entry.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary font-mono">
              {registryEntry?.dimensions.min ?? 1}D+
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tooltip content={renderValidationTooltip(entry)} position="right" delay={150}>
            <div
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${validationClass}`}
              aria-label={`${entry.name} validation ${validationLevels}: ${entry.validation.summary}`}
              data-testid={`object-type-${entry.key}-validation`}
            >
              <span className="font-mono">{validationLevels}</span>
              <span>{validationLabel}</span>
            </div>
          </Tooltip>
        </div>
        {switchHints.length > 0 && (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            data-testid={`object-type-${entry.key}-suitability`}
          >
            {switchHints.map((hint) => (
              <span
                key={hint.key}
                className={`rounded border px-2 py-0.5 text-2xs font-medium ${SWITCH_HINT_CLASSES[hint.tone]}`}
              >
                {hint.label}
              </span>
            ))}
          </div>
        )}
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
