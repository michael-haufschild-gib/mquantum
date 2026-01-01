/**
 * Gravity Controls Component
 *
 * Controls for gravitational lensing effect applied to the environment layer.
 * Only visible when a black hole is selected, as gravitational lensing
 * is exclusive to black hole objects. Settings sync with the black hole's
 * internal lensing parameters.
 */

import { ControlGroup } from '@/components/ui/ControlGroup';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore';
import React, { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Selector for black hole state - defined outside component per useShallow rules
const blackHoleSelector = (s: ReturnType<typeof useExtendedObjectStore.getState>) => ({
  gravityStrength: s.blackhole.gravityStrength,
  setGravityStrength: s.setBlackHoleGravityStrength,
  bendScale: s.blackhole.bendScale,
  setBendScale: s.setBlackHoleBendScale,
  lensingFalloff: s.blackhole.lensingFalloff,
  setLensingFalloff: s.setBlackHoleLensingFalloff,
  distanceFalloff: s.blackhole.distanceFalloff,
  setDistanceFalloff: s.setBlackHoleDistanceFalloff,
  chromaticAberration: s.blackhole.deferredLensingChromaticAberration,
  setChromaticAberration: s.setBlackHoleDeferredLensingChromaticAberration,
});

export const GravityControls: React.FC = React.memo(() => {
  // Global State
  const ppSelector = useShallow((state: PostProcessingSlice) => ({
    gravityEnabled: state.gravityEnabled,
    setGravityEnabled: state.setGravityEnabled,
    gravityStrength: state.gravityStrength,
    setGravityStrength: state.setGravityStrength,
    gravityDistortionScale: state.gravityDistortionScale,
    setGravityDistortionScale: state.setGravityDistortionScale,
    gravityFalloff: state.gravityFalloff,
    setGravityFalloff: state.setGravityFalloff,
    gravityChromaticAberration: state.gravityChromaticAberration,
    setGravityChromaticAberration: state.setGravityChromaticAberration,
  }));
  const ppState = usePostProcessingStore(ppSelector);

  // Black Hole State - for syncing
  const isBlackHole = useGeometryStore(s => s.objectType === 'blackhole');
  const bhSelector = useShallow(blackHoleSelector);
  const blackHoleState = useExtendedObjectStore(bhSelector);

  // Sync global gravity settings from black hole on mount
  useEffect(() => {
    // Force gravity enabled
    if (!ppState.gravityEnabled) {
      ppState.setGravityEnabled(true);
    }
    // Sync from black hole to global
    ppState.setGravityStrength(blackHoleState.gravityStrength);
    ppState.setGravityDistortionScale(blackHoleState.bendScale);
    ppState.setGravityFalloff(blackHoleState.lensingFalloff);
    ppState.setGravityChromaticAberration(blackHoleState.chromaticAberration);
    // Only run on mount (isBlackHole change triggers component mount/unmount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synced handlers that update both global AND black hole settings
  const handleStrengthChange = useCallback((value: number) => {
    ppState.setGravityStrength(value);
    blackHoleState.setGravityStrength(value);
  }, [ppState, blackHoleState]);

  const handleDistortionScaleChange = useCallback((value: number) => {
    ppState.setGravityDistortionScale(value);
    blackHoleState.setBendScale(value);
  }, [ppState, blackHoleState]);

  const handleFalloffChange = useCallback((value: number) => {
    ppState.setGravityFalloff(value);
    blackHoleState.setLensingFalloff(value);
    blackHoleState.setDistanceFalloff(value);
  }, [ppState, blackHoleState]);

  const handleChromaticAberrationChange = useCallback((value: number) => {
    ppState.setGravityChromaticAberration(value);
    blackHoleState.setChromaticAberration(value);
  }, [ppState, blackHoleState]);

  // Only render for black hole objects
  if (!isBlackHole) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Main Toggle - always on for black hole */}
      <Switch
        checked={true}
        onCheckedChange={ppState.setGravityEnabled}
        label="Gravitational Lensing"
        disabled
      />

      <p className="text-[10px] text-text-secondary mt-1 mb-2">
        Gravity is always active for Black Holes. Settings sync with internal lensing.
      </p>

      <ControlGroup title="Gravity Parameters">
        <Slider
          label="Strength"
          value={ppState.gravityStrength}
          min={0.1}
          max={10}
          step={0.1}
          onChange={handleStrengthChange}
          showValue
        />

        <Slider
          label="Distortion Scale"
          value={ppState.gravityDistortionScale}
          min={0.1}
          max={5}
          step={0.1}
          onChange={handleDistortionScaleChange}
          showValue
        />

        <Slider
          label="Falloff"
          value={ppState.gravityFalloff}
          min={0.5}
          max={4}
          step={0.1}
          onChange={handleFalloffChange}
          showValue
        />

        <Slider
          label="Chromatic Aberration"
          value={ppState.gravityChromaticAberration}
          min={0}
          max={1}
          step={0.01}
          onChange={handleChromaticAberrationChange}
          showValue
        />
      </ControlGroup>
    </div>
  );
});

GravityControls.displayName = 'GravityControls';
