import { ControlGroup } from '@/components/ui/ControlGroup';
import { Slider } from '@/components/ui/Slider';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore';
import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Black Hole Gravity Controls
 * Only rendered for black hole object type. Gravity is always enabled for black holes.
 * Settings sync with internal black hole lensing parameters.
 * @returns React element for gravity controls
 */
export const GravityAdvanced: React.FC = React.memo(() => {
  // Global gravity settings from postProcessingStore
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

  // Black hole state for syncing
  const bhSelector = useShallow((state: ExtendedObjectState) => ({
    gravityStrength: state.blackhole.gravityStrength,
    bendScale: state.blackhole.bendScale,
    lensingFalloff: state.blackhole.lensingFalloff,
    chromaticAberration: state.blackhole.deferredLensingChromaticAberration,
  }));
  const bhState = useExtendedObjectStore(bhSelector);

  // Sync global gravity settings from black hole on mount
  useEffect(() => {
    // Force gravity enabled
    if (!ppState.gravityEnabled) {
      ppState.setGravityEnabled(true);
    }
    // Sync from black hole to global
    ppState.setGravityStrength(bhState.gravityStrength);
    ppState.setGravityDistortionScale(bhState.bendScale);
    ppState.setGravityFalloff(bhState.lensingFalloff);
    ppState.setGravityChromaticAberration(bhState.chromaticAberration);
    // Only run on mount (component only renders for blackhole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ControlGroup title="Gravitational Lensing" collapsible defaultOpen>
      <div className="flex items-center justify-between">
        <label className="text-xs text-text-secondary">Enable</label>
        <ToggleButton
          pressed={true}
          onToggle={() => {}}
          className="text-xs px-2 py-1 h-auto"
          ariaLabel="Toggle gravitational lensing"
          data-testid="gravity-toggle"
          disabled
        >
          ON
        </ToggleButton>
      </div>

      <p className="text-xs text-text-tertiary">
        Gravity always active for Black Holes. Controls sync with internal lensing.
      </p>

      <Slider
        label="Strength"
        min={0.1}
        max={10}
        step={0.1}
        value={ppState.gravityStrength}
        onChange={ppState.setGravityStrength}
        showValue
        data-testid="gravity-strength"
      />
      <Slider
        label="Distortion Scale"
        min={0.1}
        max={5}
        step={0.1}
        value={ppState.gravityDistortionScale}
        onChange={ppState.setGravityDistortionScale}
        showValue
        data-testid="gravity-distortion-scale"
      />
      <Slider
        label="Falloff"
        min={0.5}
        max={4}
        step={0.1}
        value={ppState.gravityFalloff}
        onChange={ppState.setGravityFalloff}
        showValue
        data-testid="gravity-falloff"
      />
      <Slider
        label="Chromatic Aberration"
        min={0}
        max={1}
        step={0.01}
        value={ppState.gravityChromaticAberration}
        onChange={ppState.setGravityChromaticAberration}
        showValue
        data-testid="gravity-chromatic-aberration"
      />
    </ControlGroup>
  );
});

GravityAdvanced.displayName = 'GravityAdvanced';
