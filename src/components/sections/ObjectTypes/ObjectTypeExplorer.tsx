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
  getQuantumTypeGroupForKey,
  type QuantumTypeGroup,
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
import { useRotationStore } from '@/stores/scene/rotationStore'

const SWITCH_HINT_CLASSES = {
  dimension: 'border-warning-border bg-warning-bg text-warning',
  representation: 'border-accent/40 bg-accent/10 text-accent',
} as const

interface SwitchHint {
  key: string
  label: string
  tone: keyof typeof SWITCH_HINT_CLASSES
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

function getSwitchHints(
  entry: AvailableQuantumTypeInfo,
  currentDimension: number,
  currentRepresentation: string,
  registryEntry: ReturnType<typeof getQuantumTypeEntry>
): SwitchHint[] {
  return [
    getDimensionSwitchHint(entry, currentDimension, registryEntry),
    getRepresentationSwitchHint(entry, currentRepresentation),
  ].filter((hint): hint is SwitchHint => hint !== null)
}

/**
 * One entry in the collapsed Types-tab list: either a standalone mode card or a
 * single card standing in for a whole {@link QuantumTypeGroup} of related modes.
 */
type DisplayItem =
  | { kind: 'single'; entry: AvailableQuantumTypeInfo }
  | { kind: 'group'; group: QuantumTypeGroup; available: boolean }

/**
 * Collapse grouped modes into one card each, preserving registry order.
 *
 * A group's card is emitted at the position of its first member; the remaining
 * members are folded away (chosen via the Geometry-tab sub-mode selector). The
 * group is reported `available` when ANY member is available at the current
 * dimension.
 *
 * @param types - Available types for the current dimension, in registry order.
 * @returns Display items with grouped members collapsed to a single card.
 */
function collapseGroups(types: AvailableQuantumTypeInfo[]): DisplayItem[] {
  const availableByGroup = new Map<string, boolean>()
  for (const t of types) {
    const group = getQuantumTypeGroupForKey(t.key)
    if (group && t.available) availableByGroup.set(group.id, true)
  }

  const out: DisplayItem[] = []
  const emitted = new Set<string>()
  for (const t of types) {
    const group = getQuantumTypeGroupForKey(t.key)
    if (!group) {
      out.push({ kind: 'single', entry: t })
      continue
    }
    if (emitted.has(group.id)) continue
    emitted.add(group.id)
    out.push({ kind: 'group', group, available: availableByGroup.get(group.id) ?? false })
  }
  return out
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
  const resetAllRotations = useRotationStore((state) => state.resetAllRotations)

  useObjectTypeInitialization(objectType, dimension)

  const { addToast } = useToast()

  // Derive the currently-selected flat key from the runtime two-field model
  const selectedKey = resolveQuantumTypeKey(objectType, quantumMode)

  // All types from the flat registry, with availability for current dimension
  const allTypes = useMemo(() => getAvailableQuantumTypes(dimension), [dimension])
  const analyticTypes = useMemo(() => allTypes.filter((t) => t.category === 'analytic'), [allTypes])
  const computeTypes = useMemo(() => allTypes.filter((t) => t.category === 'compute'), [allTypes])
  // Collapse grouped families (e.g. the 14 Zeta / Prime modes) into one card.
  const analyticItems = useMemo(() => collapseGroups(analyticTypes), [analyticTypes])
  const computeItems = useMemo(() => collapseGroups(computeTypes), [computeTypes])

  const handleSelect = useCallback(
    (entry: AvailableQuantumTypeInfo) => {
      soundManager.playClick()

      // Abort any running sweep before switching type/mode so disabled controls re-enable
      useCoordinateEntanglementStore.getState().abortSweep()
      useMonitoringSweepStore.getState().abort()
      useQuantumnessAtlasStore.getState().abortSweep()

      const prevDim = useGeometryStore.getState().dimension
      const setObjectTypeWithRotationReset = (nextType: GeometryState['objectType']) => {
        if (useGeometryStore.getState().objectType !== nextType) {
          resetAllRotations()
        }
        setObjectType(nextType)
      }

      if (entry.key === 'pauliSpinor') {
        // Pauli uses a different ObjectType
        setObjectTypeWithRotationReset('pauliSpinor')
      } else if (entry.key === 'bellTest') {
        // Bell Pair has its own ObjectType — two-qubit spin Hilbert space
        setObjectTypeWithRotationReset('bellPair')
      } else {
        // All other modes use the schroedinger ObjectType
        if (useGeometryStore.getState().objectType !== 'schroedinger') {
          setObjectTypeWithRotationReset('schroedinger')
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
    [resetAllRotations, setObjectType, setQuantumMode, addToast]
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

  /** Shared presentational shell for both standalone and group cards. */
  const renderCardShell = (opts: {
    cardKey: string
    testid: string
    suitabilityTestid: string
    name: string
    description: string
    isSelected: boolean
    dimLabel: string
    switchHints: SwitchHint[]
    disabledReason?: string
    variantBadge?: string
    onClick: () => void
  }) => (
    <m.button
      key={opts.cardKey}
      variants={itemVariants}
      onClick={opts.onClick}
      onMouseEnter={() => soundManager.playHover()}
      className={`
          relative group flex flex-col p-3 rounded-lg border text-left transition-colors duration-200
          ${
            opts.isSelected
              ? 'bg-accent/10 border-accent text-accent shadow-[0_0_15px_color-mix(in_oklch,var(--color-accent)_10%,transparent)]'
              : 'bg-panel border-panel-border hover:border-text-secondary/50 text-text-secondary hover:text-text-primary hover:bg-surface'
          }
          cursor-pointer
        `}
      aria-label={[opts.name, opts.disabledReason, ...opts.switchHints.map((hint) => hint.label)]
        .filter(Boolean)
        .join('. ')}
      whileHover={{ scale: 1.01, x: 2 }}
      whileTap={{ scale: 0.98 }}
      data-testid={opts.testid}
      data-selected={opts.isSelected}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className="font-medium text-sm">{opts.name}</span>
        <div className="flex items-center gap-2">
          {opts.variantBadge && (
            <span className="text-2xs text-text-tertiary font-medium rounded border border-panel-border px-1.5 py-0.5">
              {opts.variantBadge}
            </span>
          )}
          <span className="text-xs text-text-tertiary font-mono">{opts.dimLabel}</span>
          {opts.isSelected && (
            <div className="relative w-2 h-2">
              <div className="absolute inset-0 rounded-full bg-accent led-glow" />
              <div className="absolute inset-0 rounded-full bg-accent" />
            </div>
          )}
        </div>
      </div>
      <span className="text-xs text-text-secondary/80 line-clamp-2 leading-relaxed">
        {opts.description}
      </span>
      {opts.switchHints.length > 0 && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          data-testid={opts.suitabilityTestid}
        >
          {opts.switchHints.map((hint) => (
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

  const renderCard = (entry: AvailableQuantumTypeInfo) => {
    const registryEntry = getQuantumTypeEntry(entry.key)
    const switchHints = getSwitchHints(entry, dimension, representation, registryEntry)
    return renderCardShell({
      cardKey: entry.key,
      testid: `object-type-${entry.key}`,
      suitabilityTestid: `object-type-${entry.key}-suitability`,
      name: entry.name,
      description: entry.description,
      isSelected: selectedKey === entry.key,
      dimLabel: `${registryEntry?.dimensions.min ?? 1}D+`,
      switchHints,
      disabledReason: entry.disabledReason,
      onClick: () => handleSelect(entry),
    })
  }

  /**
   * One card standing in for a whole family of related modes. Clicking it lands
   * on the group's default member (via the standard select path); the specific
   * variant is then chosen from the sub-mode selector in the Geometry panel.
   */
  const renderGroupCard = (group: QuantumTypeGroup, available: boolean) => {
    const isSelected = selectedKey !== undefined && group.members.includes(selectedKey)
    const repEntry = getQuantumTypeEntry(group.defaultMember)
    const repInfo: AvailableQuantumTypeInfo = {
      key: group.defaultMember,
      name: group.name,
      description: group.description,
      category: group.category,
      available,
      disabledReason: available || !repEntry ? undefined : `Requires ${repEntry.dimensions.min}D+`,
    }
    const switchHints = getSwitchHints(repInfo, dimension, representation, repEntry)
    return renderCardShell({
      cardKey: group.id,
      testid: `object-type-group-${group.id}`,
      suitabilityTestid: `object-type-group-${group.id}-suitability`,
      name: group.name,
      description: group.description,
      isSelected,
      dimLabel: `${repEntry?.dimensions.min ?? 3}D+`,
      switchHints,
      disabledReason: repInfo.disabledReason,
      variantBadge: `${group.members.length} types`,
      // Already inside the family → the sub-mode is chosen in the Geometry
      // panel; clicking the card again must not yank back to the default.
      onClick: () => {
        if (!isSelected) handleSelect(repInfo)
      },
    })
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
      {analyticItems.map((item) =>
        item.kind === 'group' ? renderGroupCard(item.group, item.available) : renderCard(item.entry)
      )}
      <div className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary px-1 mt-2">
        Compute (GPU)
      </div>
      {computeItems.map((item) =>
        item.kind === 'group' ? renderGroupCard(item.group, item.available) : renderCard(item.entry)
      )}
    </m.div>
  )
})

ObjectTypeExplorer.displayName = 'ObjectTypeExplorer'
