import { soundManager } from '@/lib/audio/SoundManager'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { useObjectTypeInitialization } from '@/hooks/useObjectTypeInitialization'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore, type GeometryState } from '@/stores/geometryStore'
import { m } from 'motion/react'
import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

export const ObjectTypeExplorer: React.FC = React.memo(() => {
  const { objectType, dimension } = useGeometryStore(
    useShallow((state: GeometryState) => ({
      objectType: state.objectType,
      dimension: state.dimension,
    }))
  )

  const { quantumMode, setQuantumMode } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      quantumMode: state.schroedinger.quantumMode,
      setQuantumMode: state.setSchroedingerQuantumMode,
    }))
  )

  // Handle object type initialization (fractals, polytopes, raymarching visibility)
  useObjectTypeInitialization(objectType, dimension)

  const modeOptions = useMemo(
    () => [
      {
        value: 'harmonicOscillator' as SchroedingerQuantumMode,
        label: 'Harmonic Oscillator',
        description: 'N-dimensional quantum superposition states.',
      },
      {
        value: 'hydrogenND' as SchroedingerQuantumMode,
        label: 'Hydrogen Orbitals',
        description: 'N-dimensional hydrogen atom in 3D space.',
      },
      {
        value: 'freeScalarField' as SchroedingerQuantumMode,
        label: 'Free Scalar Field',
        description: 'Klein-Gordon field on a lattice with real-time evolution.',
      },
      {
        value: 'tdseDynamics' as SchroedingerQuantumMode,
        label: 'TDSE Dynamics',
        description: 'Time-dependent Schroedinger equation: wavepackets, tunneling, scattering.',
      },
      {
        value: 'becDynamics' as SchroedingerQuantumMode,
        label: 'Bose-Einstein Condensate',
        description: 'Gross-Pitaevskii equation: superfluid dynamics, vortices, solitons.',
      },
      {
        value: 'diracEquation' as SchroedingerQuantumMode,
        label: 'Dirac',
        description: 'Relativistic Dirac equation: spinor dynamics, Zitterbewegung, Klein tunneling.',
      },
    ],
    []
  )

  const handleSelect = useCallback(
    (value: SchroedingerQuantumMode) => {
      soundManager.playClick()
      // Dimension enforcement is handled by setSchroedingerQuantumMode in the store
      setQuantumMode(value)
    },
    [setQuantumMode]
  )

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 },
  }

  return (
    <m.div
      className="grid grid-cols-1 gap-2"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {modeOptions.map((mode) => {
        const isSelected = quantumMode === mode.value

        return (
          <m.button
            key={mode.value}
            variants={itemVariants}
            onClick={() => handleSelect(mode.value)}
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
            data-testid={`object-type-${mode.value}`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="font-medium text-sm">{mode.label}</span>
              {isSelected && (
                <div className="relative w-2 h-2">
                  {/* Glow layer - static blur, no animation = 0 style recalcs */}
                  <div className="absolute inset-0 rounded-full bg-accent led-glow" />
                  {/* Solid LED core */}
                  <div className="absolute inset-0 rounded-full bg-accent" />
                </div>
              )}
            </div>
            <span className="text-xs text-text-secondary/80 line-clamp-2 leading-relaxed">
              {mode.description}
            </span>
          </m.button>
        )
      })}
    </m.div>
  )
})

ObjectTypeExplorer.displayName = 'ObjectTypeExplorer'
