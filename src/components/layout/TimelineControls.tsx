import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { type FC, useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { getConfigStoreKey, hasTimelineControls } from '@/lib/geometry/registry'
import {
  type AnimationState,
  MAX_SPEED,
  MIN_SPEED,
  useAnimationStore,
} from '@/stores/animationStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { type GeometryState, useGeometryStore } from '@/stores/geometryStore'

import { PauliAnimationDrawer } from './TimelineControls/PauliAnimationDrawer'
import { RotationAnimationDrawer } from './TimelineControls/RotationAnimationDrawer'
import { SchroedingerAnimationDrawer } from './TimelineControls/SchroedingerAnimationDrawer'
import { SchroedingerOpenQuantumDrawer } from './TimelineControls/SchroedingerOpenQuantumDrawer'

export const TimelineControls: FC = () => {
  const objectType = useGeometryStore((state: GeometryState) => state.objectType)

  const { isPlaying, speed, animatingPlanes, togglePlayPause, setSpeed } = useAnimationStore(
    useShallow((state: AnimationState) => ({
      isPlaying: state.isPlaying,
      speed: state.speed,
      animatingPlanes: state.animatingPlanes,
      togglePlayPause: state.togglePlayPause,
      setSpeed: state.setSpeed,
    }))
  )

  const schroedingerConfig = useExtendedObjectStore(
    useShallow((state) => ({
      quantumMode: state.schroedinger.quantumMode,
      representation: state.schroedinger.representation,
      sliceAnimationEnabled: state.schroedinger.sliceAnimationEnabled,
      interferenceEnabled: state.schroedinger.interferenceEnabled,
      phaseShimmerEnabled: state.schroedinger.phaseShimmerEnabled,
      probabilityCurrentEnabled: state.schroedinger.probabilityCurrentEnabled,
      phaseAnimationEnabled: state.schroedinger.phaseAnimationEnabled,
      openQuantumEnabled: state.schroedinger.openQuantum.enabled,
      openQuantumDephasingEnabled: state.schroedinger.openQuantum.dephasingEnabled,
      openQuantumRelaxationEnabled: state.schroedinger.openQuantum.relaxationEnabled,
      openQuantumThermalEnabled: state.schroedinger.openQuantum.thermalEnabled,
    }))
  )

  const pauliSliceAnimationEnabled = useExtendedObjectStore(
    (state) => state.pauliSpinor.sliceAnimationEnabled
  )

  const resetActions = useExtendedObjectStore(
    useShallow((state) => ({
      resetSchroedingerParameters: state.resetSchroedingerParameters,
      resetFreeScalarField: state.resetFreeScalarField,
      resetTdseField: state.resetTdseField,
      resetBecField: state.resetBecField,
      setDiracNeedsReset: state.setDiracNeedsReset,
      resetQuantumWalk: state.resetQuantumWalk,
      resetPauliField: state.resetPauliField,
      requestOpenQuantumStateReset: state.requestOpenQuantumStateReset,
    }))
  )

  const configStoreKey = getConfigStoreKey(objectType)
  const isSchroedinger = configStoreKey === 'schroedinger'
  const isPauliSpinor = configStoreKey === 'pauliSpinor'

  const isComputeMode =
    isPauliSpinor ||
    schroedingerConfig.quantumMode === 'freeScalarField' ||
    schroedingerConfig.quantumMode === 'tdseDynamics' ||
    schroedingerConfig.quantumMode === 'becDynamics' ||
    schroedingerConfig.quantumMode === 'diracEquation' ||
    schroedingerConfig.quantumMode === 'quantumWalk'

  const supportsOpenQuantumControls =
    isSchroedinger &&
    (schroedingerConfig.quantumMode === 'harmonicOscillator' ||
      schroedingerConfig.quantumMode === 'hydrogenND' ||
      schroedingerConfig.quantumMode === 'hydrogenNDCoupled') &&
    schroedingerConfig.representation !== 'wigner'

  const activeAnimationCount = useMemo(() => {
    if (configStoreKey === 'schroedinger') {
      return [
        schroedingerConfig.sliceAnimationEnabled,
        schroedingerConfig.interferenceEnabled,
        schroedingerConfig.phaseShimmerEnabled,
        schroedingerConfig.probabilityCurrentEnabled,
        schroedingerConfig.phaseAnimationEnabled,
      ].filter(Boolean).length
    }
    if (configStoreKey === 'pauliSpinor') {
      return pauliSliceAnimationEnabled ? 1 : 0
    }
    return 0
  }, [
    configStoreKey,
    schroedingerConfig.sliceAnimationEnabled,
    schroedingerConfig.interferenceEnabled,
    schroedingerConfig.phaseShimmerEnabled,
    schroedingerConfig.probabilityCurrentEnabled,
    schroedingerConfig.phaseAnimationEnabled,
    pauliSliceAnimationEnabled,
  ])

  const isHydrogen =
    schroedingerConfig.quantumMode === 'hydrogenND' ||
    schroedingerConfig.quantumMode === 'hydrogenNDCoupled'

  const activeOpenQuantumCount = useMemo(() => {
    if (!schroedingerConfig.openQuantumEnabled) return 0
    if (isHydrogen) return 1
    return [
      schroedingerConfig.openQuantumDephasingEnabled,
      schroedingerConfig.openQuantumRelaxationEnabled,
      schroedingerConfig.openQuantumThermalEnabled,
    ].filter(Boolean).length
  }, [
    schroedingerConfig.openQuantumEnabled,
    schroedingerConfig.openQuantumDephasingEnabled,
    schroedingerConfig.openQuantumRelaxationEnabled,
    schroedingerConfig.openQuantumThermalEnabled,
    isHydrogen,
  ])

  const handleReset = useCallback(() => {
    if (isPauliSpinor) {
      resetActions.resetPauliField()
      return
    }
    switch (schroedingerConfig.quantumMode) {
      case 'harmonicOscillator':
      case 'hydrogenND':
      case 'hydrogenNDCoupled':
        resetActions.resetSchroedingerParameters()
        resetActions.requestOpenQuantumStateReset()
        break
      case 'freeScalarField':
        resetActions.resetFreeScalarField()
        break
      case 'tdseDynamics':
        resetActions.resetTdseField()
        break
      case 'becDynamics':
        resetActions.resetBecField()
        break
      case 'diracEquation':
        resetActions.setDiracNeedsReset()
        break
      case 'quantumWalk':
        resetActions.resetQuantumWalk()
        break
    }
  }, [isPauliSpinor, schroedingerConfig.quantumMode, resetActions])

  const prefersReducedMotion = useReducedMotion()

  const [showRotationDrawer, setShowRotationDrawer] = useState(false)
  const [showAnimDrawer, setShowAnimDrawer] = useState(false)
  const [showOpenQDrawer, setShowOpenQDrawer] = useState(false)

  const effectiveShowOpenQDrawer = showOpenQDrawer && supportsOpenQuantumControls

  // Shared close-others helper — only one drawer open at a time
  const openRotation = () => {
    setShowRotationDrawer(true)
    setShowAnimDrawer(false)
    setShowOpenQDrawer(false)
  }
  const openAnimDrawer = () => {
    setShowAnimDrawer(true)
    setShowRotationDrawer(false)
    setShowOpenQDrawer(false)
  }
  const openOpenQDrawer = () => {
    setShowOpenQDrawer(true)
    setShowAnimDrawer(false)
    setShowRotationDrawer(false)
  }

  return (
    <div className="flex flex-col w-full h-full relative">
      <AnimatePresence>
        {showRotationDrawer && (
          <RotationAnimationDrawer onClose={() => setShowRotationDrawer(false)} />
        )}

        {showAnimDrawer && isSchroedinger && (
          <SchroedingerAnimationDrawer onClose={() => setShowAnimDrawer(false)} />
        )}

        {showAnimDrawer && isPauliSpinor && (
          <PauliAnimationDrawer onClose={() => setShowAnimDrawer(false)} />
        )}

        {effectiveShowOpenQDrawer && (
          <SchroedingerOpenQuantumDrawer onClose={() => setShowOpenQDrawer(false)} />
        )}
      </AnimatePresence>

      {/* Main Timeline Bar */}
      <div className="h-14 flex items-center px-4 gap-4 shrink-0 overflow-x-auto overflow-y-hidden scrollbar-none relative glass-panel rounded-t-xl sm:rounded-xl">
        {/* Playback Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            {isComputeMode && !prefersReducedMotion && (
              <m.div
                className="absolute inset-0 rounded-full animate-glow-breathe"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4 }}
                aria-hidden
              />
            )}
            <Button
              variant="primary"
              size="icon"
              onClick={handleReset}
              ariaLabel="Reset wavefunction"
              tooltip="Reset the wavefunction to its initial state and re-initialize all mode parameters."
              className={
                isComputeMode
                  ? 'w-10 h-10 rounded-full ring-1 ring-accent/40 relative z-10'
                  : 'w-9 h-9 rounded-full'
              }
              glow={isComputeMode}
            >
              <Icon name="reset" size={isComputeMode ? 16 : 14} />
            </Button>
          </div>

          <Button
            variant={isPlaying ? 'primary' : 'secondary'}
            size="icon"
            onClick={togglePlayPause}
            ariaLabel={isPlaying ? 'Pause' : 'Play'}
            tooltip={
              isPlaying ? 'Pause the time evolution.' : 'Start the time evolution animation.'
            }
            glow={isPlaying}
            className={`w-9 h-9 rounded-full ${isPlaying ? 'bg-accent text-text-inverse' : ''}`}
          >
            {isPlaying ? (
              <Icon name="pause" size={11} />
            ) : (
              <Icon name="play" size={11} className="ms-0.5" />
            )}
          </Button>
        </div>

        {/* Speed Slider */}
        <div className="w-28 sm:w-44 pt-2.5 ps-3 border-s border-border-subtle shrink-0">
          <Slider
            label="SPEED"
            tooltip="Animation speed multiplier + controls how fast the wavefunction evolves in time."
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.1}
            value={speed}
            onChange={setSpeed}
            showValue={true}
            unit="x"
          />
        </div>

        <div className="flex-1 min-w-3" />

        {/* Drawer Toggles */}
        <div className="flex items-center gap-2">
          {hasTimelineControls(objectType) && (
            <ToggleButton
              pressed={showAnimDrawer}
              onToggle={() => (showAnimDrawer ? setShowAnimDrawer(false) : openAnimDrawer())}
              sound="swish"
              ariaLabel="Toggle animations drawer"
              tooltip="Open the quantum animation effects panel (phase, interference, probability flow)."
              className="text-xs font-bold uppercase tracking-wider px-3 py-2.5 rounded-full"
            >
              Effects
              <span
                className={`ms-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${showAnimDrawer ? 'bg-accent text-text-inverse' : 'bg-accent-subtle text-text-primary'}`}
              >
                {activeAnimationCount}
              </span>
            </ToggleButton>
          )}

          {supportsOpenQuantumControls && (
            <ToggleButton
              pressed={showOpenQDrawer}
              onToggle={() => (showOpenQDrawer ? setShowOpenQDrawer(false) : openOpenQDrawer())}
              sound="swish"
              ariaLabel={`Toggle open quantum drawer, ${activeOpenQuantumCount} active`}
              tooltip="Open quantum system controls: decoherence, relaxation, and thermal coupling."
              className="text-xs font-bold uppercase tracking-wider px-3 py-2.5 rounded-full"
            >
              Open Quantum
              <span
                className={`ms-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${showOpenQDrawer ? 'bg-accent text-text-inverse' : 'bg-accent-subtle text-text-primary'}`}
              >
                {activeOpenQuantumCount}
              </span>
            </ToggleButton>
          )}

          <ToggleButton
            pressed={showRotationDrawer}
            onToggle={() => (showRotationDrawer ? setShowRotationDrawer(false) : openRotation())}
            sound="swish"
            ariaLabel="Toggle rotation drawer"
            tooltip="Select which N-dimensional rotation planes to animate."
            className="text-xs font-bold uppercase tracking-wider px-3 py-2.5 rounded-full"
          >
            Rotate
            <span
              className={`ms-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${showRotationDrawer ? 'bg-accent text-text-inverse' : 'bg-accent-subtle text-text-primary'}`}
            >
              {animatingPlanes.size}
            </span>
          </ToggleButton>
        </div>
      </div>
    </div>
  )
}
