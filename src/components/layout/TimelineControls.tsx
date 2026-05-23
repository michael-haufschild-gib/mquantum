import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { type FC, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
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
} from '@/stores/scene/animationStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { type GeometryState, useGeometryStore } from '@/stores/scene/geometryStore'

const PauliAnimationDrawer = lazy(() =>
  import('./TimelineControls/PauliAnimationDrawer').then((m) => ({
    default: m.PauliAnimationDrawer,
  }))
)
const RotationAnimationDrawer = lazy(() =>
  import('./TimelineControls/RotationAnimationDrawer').then((m) => ({
    default: m.RotationAnimationDrawer,
  }))
)
const SchroedingerAnimationDrawer = lazy(() =>
  import('./TimelineControls/SchroedingerAnimationDrawer').then((m) => ({
    default: m.SchroedingerAnimationDrawer,
  }))
)
const SchroedingerOpenQuantumDrawer = lazy(() =>
  import('./TimelineControls/SchroedingerOpenQuantumDrawer').then((m) => ({
    default: m.SchroedingerOpenQuantumDrawer,
  }))
)
const WheelerDeWittAnimationDrawer = lazy(() =>
  import('./TimelineControls/WheelerDeWittAnimationDrawer').then((m) => ({
    default: m.WheelerDeWittAnimationDrawer,
  }))
)

interface TimelineAnimationConfig {
  quantumMode: string
  sliceAnimationEnabled: boolean
  interferenceEnabled: boolean
  phaseShimmerEnabled: boolean
  probabilityCurrentEnabled: boolean
  phaseAnimationEnabled: boolean
  tdseAutoLoopEnabled: boolean
  wdwPhaseRotationEnabled: boolean
  wdwWorldlineEnabled: boolean
}

const countEnabled = (values: readonly boolean[]): number => values.filter(Boolean).length

const countSchroedingerAnimations = (config: TimelineAnimationConfig, isWdW: boolean): number => {
  if (isWdW) {
    return countEnabled([config.wdwPhaseRotationEnabled, config.wdwWorldlineEnabled])
  }
  if (config.quantumMode === 'tdseDynamics') {
    return countEnabled([config.sliceAnimationEnabled, config.tdseAutoLoopEnabled])
  }
  return countEnabled([
    config.sliceAnimationEnabled,
    config.interferenceEnabled,
    config.phaseShimmerEnabled,
    config.probabilityCurrentEnabled,
    config.phaseAnimationEnabled,
  ])
}

const countActiveAnimations = (
  configStoreKey: string | undefined,
  config: TimelineAnimationConfig,
  isWdW: boolean,
  pauliSliceAnimationEnabled: boolean
): number => {
  if (configStoreKey === 'schroedinger') return countSchroedingerAnimations(config, isWdW)
  if (configStoreKey === 'pauliSpinor') return pauliSliceAnimationEnabled ? 1 : 0
  return 0
}

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
      // Wheeler–DeWitt render-only effects. Defensive reads — tests may omit
      // the wheelerDeWitt sub-state when they mock schroedinger partially.
      wdwPhaseRotationEnabled: state.schroedinger.wheelerDeWitt?.phaseRotationEnabled ?? false,
      wdwWorldlineEnabled: state.schroedinger.wheelerDeWitt?.worldlineEnabled ?? false,
      // TDSE Auto-Loop is the only effect surfaced in the TDSE drawer aside from
      // the shared dimensional sweeps. Defensive `?` for partial test mocks.
      tdseAutoLoopEnabled: state.schroedinger.tdse?.autoLoop ?? false,
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
      markComputeNeedsReset: state.markComputeNeedsReset,
      resetQuantumWalk: state.resetQuantumWalk,
      resetPauliField: state.resetPauliField,
      requestOpenQuantumStateReset: state.requestOpenQuantumStateReset,
      triggerWdwRecompute: state.triggerWdwRecompute,
      triggerAdsRecompute: state.triggerAdsRecompute,
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

  const isWdW = schroedingerConfig.quantumMode === 'wheelerDeWitt'

  // Compute modes with no animation effects content in the drawer.
  // AdS (Stage 1) is static — no time evolution, no effects drawer yet.
  const isEffectlessComputeMode =
    isSchroedinger &&
    schroedingerConfig.quantumMode !== 'harmonicOscillator' &&
    schroedingerConfig.quantumMode !== 'hydrogenND' &&
    schroedingerConfig.quantumMode !== 'hydrogenNDCoupled' &&
    schroedingerConfig.quantumMode !== 'tdseDynamics' &&
    schroedingerConfig.quantumMode !== 'wheelerDeWitt'

  const hasEffectsDrawerContent = !isEffectlessComputeMode

  const activeAnimationCount = useMemo(
    () =>
      countActiveAnimations(configStoreKey, schroedingerConfig, isWdW, pauliSliceAnimationEnabled),
    [configStoreKey, schroedingerConfig, isWdW, pauliSliceAnimationEnabled]
  )

  const isHydrogen =
    schroedingerConfig.quantumMode === 'hydrogenND' ||
    schroedingerConfig.quantumMode === 'hydrogenNDCoupled'

  const effectsTooltip = useMemo(() => {
    if (isPauliSpinor) {
      return 'Simulation speed and dimensional sweep controls for the Pauli spinor.'
    }
    if (isSchroedinger && schroedingerConfig.quantumMode === 'tdseDynamics') {
      return 'TDSE auto-loop control for automatic wavepacket re-initialization.'
    }
    if (isSchroedinger && isWdW) {
      return 'Wheeler–DeWitt visual effects: phase rotation of the colored fringes and a semiclassical worldline pulse traveling along each WKB streamline.'
    }
    return 'Quantum animation effects: phase evolution, interference fringes, probability current, and dimensional sweeps.'
  }, [isPauliSpinor, isSchroedinger, isWdW, schroedingerConfig.quantumMode])

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
        resetActions.markComputeNeedsReset('dirac')
        break
      case 'quantumWalk':
        resetActions.resetQuantumWalk()
        break
      case 'wheelerDeWitt':
        resetActions.triggerWdwRecompute()
        break
      case 'antiDeSitter':
        resetActions.triggerAdsRecompute()
        break
    }
  }, [isPauliSpinor, schroedingerConfig.quantumMode, resetActions])

  const prefersReducedMotion = useReducedMotion()

  const [activeDrawer, setActiveDrawer] = useState<'rotation' | 'anim' | 'openQ' | null>(null)

  // Close the effects drawer when switching to a mode that has no drawer content
  useEffect(() => {
    if (!hasEffectsDrawerContent && activeDrawer === 'anim') setActiveDrawer(null)
  }, [hasEffectsDrawerContent, activeDrawer])

  // Close the open-quantum drawer when switching to a mode/representation
  // where those controls are unavailable. Otherwise a hidden `openQ` state
  // can reappear later when the user returns to a supported mode.
  useEffect(() => {
    if (!supportsOpenQuantumControls && activeDrawer === 'openQ') setActiveDrawer(null)
  }, [supportsOpenQuantumControls, activeDrawer])

  const showRotationDrawer = activeDrawer === 'rotation'
  const showAnimDrawer = activeDrawer === 'anim'
  const effectiveShowOpenQDrawer = activeDrawer === 'openQ' && supportsOpenQuantumControls

  const toggleDrawer = (drawer: 'rotation' | 'anim' | 'openQ') =>
    setActiveDrawer((prev) => (prev === drawer ? null : drawer))

  return (
    <div className="flex flex-col w-full h-full relative">
      <AnimatePresence>
        {showRotationDrawer && (
          <Suspense fallback={null}>
            <RotationAnimationDrawer onClose={() => setActiveDrawer(null)} />
          </Suspense>
        )}

        {showAnimDrawer && isSchroedinger && isWdW && (
          <Suspense fallback={null}>
            <WheelerDeWittAnimationDrawer onClose={() => setActiveDrawer(null)} />
          </Suspense>
        )}

        {showAnimDrawer && isSchroedinger && !isWdW && hasEffectsDrawerContent && (
          <Suspense fallback={null}>
            <SchroedingerAnimationDrawer onClose={() => setActiveDrawer(null)} />
          </Suspense>
        )}

        {showAnimDrawer && isPauliSpinor && (
          <Suspense fallback={null}>
            <PauliAnimationDrawer onClose={() => setActiveDrawer(null)} />
          </Suspense>
        )}

        {effectiveShowOpenQDrawer && (
          <Suspense fallback={null}>
            <SchroedingerOpenQuantumDrawer onClose={() => setActiveDrawer(null)} />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Main Timeline Bar */}
      <div className="min-h-14 flex flex-wrap items-center px-2 py-2 gap-2 shrink-0 overflow-visible relative surface-panel rounded-t-xl sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0 sm:gap-4 sm:overflow-x-auto sm:overflow-y-hidden sm:scrollbar-none sm:rounded-xl">
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
        <div className="w-[clamp(8rem,45vw,11rem)] pt-2.5 ps-2 border-s border-border-subtle shrink-0 sm:w-44 sm:ps-3">
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

        <div className="hidden sm:block flex-1 min-w-3" />

        {/* Drawer Toggles */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          {hasTimelineControls(objectType) && hasEffectsDrawerContent && (
            <ToggleButton
              pressed={showAnimDrawer}
              onToggle={() => toggleDrawer('anim')}
              sound="swish"
              ariaLabel="Toggle animations drawer"
              tooltip={effectsTooltip}
              className="text-xs font-semibold px-3 py-2 rounded-full"
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
              pressed={activeDrawer === 'openQ'}
              onToggle={() => toggleDrawer('openQ')}
              sound="swish"
              ariaLabel={`Toggle open quantum drawer, ${activeOpenQuantumCount} active`}
              tooltip="Open quantum system controls: decoherence, relaxation, and thermal coupling."
              className="text-xs font-semibold px-3 py-2 rounded-full"
            >
              Open Quantum
              <span
                className={`ms-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeDrawer === 'openQ' ? 'bg-accent text-text-inverse' : 'bg-accent-subtle text-text-primary'}`}
              >
                {activeOpenQuantumCount}
              </span>
            </ToggleButton>
          )}

          <ToggleButton
            pressed={showRotationDrawer}
            onToggle={() => toggleDrawer('rotation')}
            sound="swish"
            ariaLabel="Toggle rotation drawer"
            tooltip="Select which N-dimensional rotation planes to animate."
            className="text-xs font-semibold px-3 py-2 rounded-full"
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
