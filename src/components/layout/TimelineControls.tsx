import { useMemo, useState, type FC } from 'react';
import { useAnimationStore, MIN_SPEED, MAX_SPEED, type AnimationState } from '@/stores/animationStore';
import { useUIStore } from '@/stores/uiStore';
import { MIN_ANIMATION_BIAS, MAX_ANIMATION_BIAS } from '@/stores/defaults/visualDefaults';
import { useGeometryStore } from '@/stores/geometryStore';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { getRotationPlanes } from '@/lib/math';
import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, m } from 'motion/react';
import { Slider } from '@/components/ui/Slider';
import { BlackHoleAnimationDrawer } from './TimelineControls/BlackHoleAnimationDrawer';
import { JuliaAnimationDrawer } from './TimelineControls/JuliaAnimationDrawer';
import { MandelbulbAnimationDrawer } from './TimelineControls/MandelbulbAnimationDrawer';
import { PolytopeAnimationDrawer } from './TimelineControls/PolytopeAnimationDrawer';
import { SchroedingerAnimationDrawer } from './TimelineControls/SchroedingerAnimationDrawer';
import { hasTimelineControls, isPolytopeCategory, getConfigStoreKey } from '@/lib/geometry/registry';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { ToggleButton } from '@/components/ui/ToggleButton';

export const TimelineControls: FC = () => {
    const dimension = useGeometryStore((state) => state.dimension);
    const objectType = useGeometryStore((state) => state.objectType);
    
    // Animation Store
    const animationSelector = useShallow((state: AnimationState) => ({
        isPlaying: state.isPlaying,
        speed: state.speed,
        direction: state.direction,
        animatingPlanes: state.animatingPlanes,
        toggle: state.toggle,
        setSpeed: state.setSpeed,
        toggleDirection: state.toggleDirection,
        togglePlane: state.togglePlane,
        animateAll: state.animateAll,
        clearAllPlanes: state.clearAllPlanes,
    }));
    
    const {
        isPlaying,
        speed,
        direction,
        animatingPlanes,
        toggle,
        setSpeed,
        toggleDirection,
        togglePlane,
        animateAll,
        clearAllPlanes
    } = useAnimationStore(animationSelector);

    const { animationBias, setAnimationBias } = useUIStore(
        useShallow((state) => ({
            animationBias: state.animationBias,
            setAnimationBias: state.setAnimationBias,
        }))
    );

    // Extended object configs for animation state checking
    const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
        mandelbulbConfig: state.mandelbulb,
        quaternionJuliaConfig: state.quaternionJulia,
        polytopeConfig: state.polytope,
        schroedingerConfig: state.schroedinger,
        blackholeConfig: state.blackhole,
    }));

    const { mandelbulbConfig, polytopeConfig, schroedingerConfig, blackholeConfig } = useExtendedObjectStore(extendedObjectSelector);

    // Black hole specific: Keplerian differential control
    const setKeplerianDifferential = useExtendedObjectStore((state) => state.setBlackHoleKeplerianDifferential);
    const isBlackHole = getConfigStoreKey(objectType) === 'blackhole';

    const planes = useMemo(() => getRotationPlanes(dimension), [dimension]);
    const hasAnimatingPlanes = animatingPlanes.size > 0;

  // Count active animations per object type
  const activeAnimationCount = useMemo(() => {
    const configKey = getConfigStoreKey(objectType);

    switch (configKey) {
      case 'mandelbulb':
        return [
          mandelbulbConfig.powerAnimationEnabled,
          mandelbulbConfig.alternatePowerEnabled,
          mandelbulbConfig.dimensionMixEnabled,
          mandelbulbConfig.originDriftEnabled,
          mandelbulbConfig.sliceAnimationEnabled,
          mandelbulbConfig.phaseShiftEnabled,
        ].filter(Boolean).length;

      case 'quaternionJulia':
        return 0;

      case 'schroedinger':
        return [
          schroedingerConfig.curlEnabled,
          schroedingerConfig.originDriftEnabled,
          schroedingerConfig.sliceAnimationEnabled,
          schroedingerConfig.spreadAnimationEnabled,
        ].filter(Boolean).length;

      case 'blackhole':
        return [
          blackholeConfig.swirlAnimationEnabled,
          blackholeConfig.pulseEnabled,
        ].filter(Boolean).length;

      default:
        // Polytope category
        if (isPolytopeCategory(objectType)) {
          return polytopeConfig.facetOffsetEnabled ? 1 : 0;
        }
        return 0;
    }
  }, [
    objectType,
    mandelbulbConfig.powerAnimationEnabled,
    mandelbulbConfig.alternatePowerEnabled,
    mandelbulbConfig.dimensionMixEnabled,
    mandelbulbConfig.originDriftEnabled,
    mandelbulbConfig.sliceAnimationEnabled,
    mandelbulbConfig.phaseShiftEnabled,
    polytopeConfig.facetOffsetEnabled,
    schroedingerConfig.curlEnabled,
    schroedingerConfig.originDriftEnabled,
    schroedingerConfig.sliceAnimationEnabled,
    schroedingerConfig.spreadAnimationEnabled,
    blackholeConfig.swirlAnimationEnabled,
    blackholeConfig.pulseEnabled,
  ]);

  // Check if any animation is active
  const isAnimating = activeAnimationCount > 0;

    // Animation should only be paused when NOTHING is animating
    const hasAnythingToAnimate = hasAnimatingPlanes || isAnimating;

    const [showRotation, setShowRotation] = useState(false);
    const [showFractalAnim, setShowFractalAnim] = useState(false);

    return (
        <div className="flex flex-col w-full h-full relative">
            <AnimatePresence>
                {/* Rotation Drawer */}
                {showRotation && (
                    <m.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-full left-0 right-0 mb-2 glass-panel rounded-xl z-20"
                    >
                        <div className="p-4 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Rotation Planes</h3>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => animateAll(dimension)}
                                        className="text-[10px] uppercase font-bold text-accent hover:text-accent-glow px-2 py-1"
                                    >
                                        Select All
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => clearAllPlanes()}
                                        className="text-[10px] uppercase font-bold px-2 py-1"
                                    >
                                        Deselect All
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-panel-border">
                                {planes.map((plane) => {
                                    const isActive = animatingPlanes.has(plane.name);
                                    return (
                                        <ToggleButton
                                            key={plane.name}
                                            pressed={isActive}
                                            onToggle={() => togglePlane(plane.name)}
                                            ariaLabel={`Toggle ${plane.name} rotation`}
                                            className="flex-1 min-w-[60px] px-3 py-2 text-[10px] font-mono text-center uppercase tracking-wider"
                                        >
                                            {plane.name}
                                        </ToggleButton>
                                    );
                                })}
                            </div>

                            {/* Keplerian Differential - Black Hole Only */}
                            {isBlackHole && (
                                <div className="mt-4 pt-4 border-t border-border-default">
                                    <Slider
                                        label="Keplerian Differential"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={blackholeConfig.keplerianDifferential}
                                        onChange={setKeplerianDifferential}
                                        showValue
                                        tooltip="0 = uniform rotation, 1 = inner disk rotates faster"
                                    />
                                </div>
                            )}
                        </div>
                    </m.div>
                )}


      {/* Quaternion Julia Animation Drawer */}
      {showFractalAnim && getConfigStoreKey(objectType) === 'quaternionJulia' && (
        <JuliaAnimationDrawer />
      )}

      {/* Mandelbulb/Mandelbulb Fractal Animation Drawer */}
      {showFractalAnim && getConfigStoreKey(objectType) === 'mandelbulb' && (
        <MandelbulbAnimationDrawer />
      )}

      {/* Polytope Animation Drawer */}
      {showFractalAnim && isPolytopeCategory(objectType) && (
        <PolytopeAnimationDrawer />
      )}

      {/* Schroedinger Animation Drawer */}
      {showFractalAnim && getConfigStoreKey(objectType) === 'schroedinger' && (
        <SchroedingerAnimationDrawer />
      )}

      {/* Black Hole Animation Drawer */}
      {showFractalAnim && getConfigStoreKey(objectType) === 'blackhole' && (
        <BlackHoleAnimationDrawer />
      )}
            </AnimatePresence>

            {/* Main Timeline Bar */}
            <div className="h-14 flex items-center px-4 gap-4 shrink-0 overflow-x-auto overflow-y-hidden scrollbar-none relative glass-panel rounded-t-xl sm:rounded-xl">
                {/* Playback Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant={isPlaying ? 'primary' : 'secondary'}
                        size="icon"
                        onClick={toggle}
                        disabled={!hasAnythingToAnimate}
                        ariaLabel={isPlaying ? "Pause" : "Play"}
                        glow={isPlaying}
                        className={`w-9 h-9 rounded-full ${isPlaying ? 'bg-accent text-text-inverse' : ''}`}
                    >
                        {isPlaying ? (
                            <Icon name="pause" size={11} />
                        ) : (
                            <Icon name="play" size={11} className="ml-0.5" />
                        )}
                    </Button>

                    <ToggleButton
                        pressed={direction === -1}
                        onToggle={() => toggleDirection()}
                        ariaLabel={direction === 1 ? 'Enable reverse' : 'Disable reverse'}
                        className="w-9 h-9 p-0 rounded-lg flex items-center justify-center"
                    >
                        <Icon name="redo" size={14} />
                    </ToggleButton>
                </div>

                {/* Speed Slider */}
                <div className="w-44 pt-2.5 pl-3 border-l border-border-subtle">
                    <Slider
                        label="SPEED"
                        min={MIN_SPEED}
                        max={MAX_SPEED}
                        step={0.1}
                        value={speed}
                        onChange={setSpeed}
                        showValue={true}
                        unit="x"
                    />
                </div>

                {/* Bias Slider */}
                <div className="w-44 pt-2.5 pl-3 border-l border-border-subtle">
                    <Slider
                        label="BIAS"
                        min={MIN_ANIMATION_BIAS}
                        max={MAX_ANIMATION_BIAS}
                        step={0.05}
                        value={animationBias}
                        onChange={setAnimationBias}
                        showValue={true}
                    />
                </div>

                <div className="flex-1 min-w-3" />

                {/* Drawer Toggles */}
                <div className="flex items-center gap-2">
                    {hasTimelineControls(objectType) && (
                        <ToggleButton
                            pressed={showFractalAnim}
                            onToggle={() => {
                                setShowFractalAnim(!showFractalAnim);
                                setShowRotation(false);
                            }}
                            sound="swish"
                            ariaLabel="Toggle animations drawer"
                            className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
                        >
                            Anim
                            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${showFractalAnim ? 'bg-accent text-text-inverse' : 'bg-[var(--bg-hover)] text-text-tertiary'}`}>
                                {activeAnimationCount}
                            </span>
                        </ToggleButton>
                    )}

                    <ToggleButton
                        pressed={showRotation}
                        onToggle={() => {
                            setShowRotation(!showRotation);
                            setShowFractalAnim(false);
                        }}
                        sound="swish"
                        ariaLabel="Toggle rotation drawer"
                        className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
                    >
                        Rotate
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${showRotation ? 'bg-accent text-text-inverse' : 'bg-[var(--bg-hover)] text-text-tertiary'}`}>
                            {animatingPlanes.size}
                        </span>
                    </ToggleButton>
                </div>
            </div>
        </div>
    );
};


