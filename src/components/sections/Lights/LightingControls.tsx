/**
 * Lighting Controls Component
 *
 * Controls for configuring the multi-light system:
 * - Show/hide light gizmos toggle
 * - Light list (add, remove, select) - includes ambient light at top
 * - Light editor (selected light properties)
 * - Ambient Occlusion controls (unified for all object types)
 */

import { ColorPicker } from '@/components/ui/ColorPicker';
import { ControlGroup } from '@/components/ui/ControlGroup';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore';
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore';
import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LightEditor } from './LightEditor';
import { LightList } from './LightList';

export interface LightingControlsProps {
  className?: string;
}

/** AO Quality options for Schrödinger volumetric AO */
const AO_QUALITY_OPTIONS: SelectOption<string>[] = [
  { value: '3', label: '3 cones (Fast)' },
  { value: '4', label: '4 cones (Balanced)' },
  { value: '6', label: '6 cones (Quality)' },
  { value: '8', label: '8 cones (High)' },
];

export const LightingControls: React.FC<LightingControlsProps> = React.memo(({
  className = '',
}) => {
  // Get current object type for AO type switching
  const objectType = useGeometryStore((state) => state.objectType);
  const isSchroedinger = objectType === 'schroedinger';

  const {
    selectedLightId,
    showLightGizmos,
    setShowLightGizmos,
  } = useLightingStore(
    useShallow((state: LightingSlice) => ({
      selectedLightId: state.selectedLightId,
      showLightGizmos: state.showLightGizmos,
      setShowLightGizmos: state.setShowLightGizmos,
    }))
  );

  // Global SSAO settings (for non-Schrödinger objects)
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    ssaoEnabled: state.ssaoEnabled,
    setSSAOEnabled: state.setSSAOEnabled,
    ssaoIntensity: state.ssaoIntensity,
    setSSAOIntensity: state.setSSAOIntensity,
  }));
  const {
    ssaoEnabled,
    setSSAOEnabled,
    ssaoIntensity,
    setSSAOIntensity,
  } = usePostProcessingStore(postProcessingSelector);

  // Schrödinger-specific AO settings
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    schroedingerAoEnabled: state.schroedinger.aoEnabled,
    schroedingerAoStrength: state.schroedinger.aoStrength,
    schroedingerAoQuality: state.schroedinger.aoQuality,
    schroedingerAoRadius: state.schroedinger.aoRadius,
    schroedingerAoColor: state.schroedinger.aoColor,
    setSchroedingerAoEnabled: state.setSchroedingerAoEnabled,
    setSchroedingerAoStrength: state.setSchroedingerAoStrength,
    setSchroedingerAoQuality: state.setSchroedingerAoQuality,
    setSchroedingerAoRadius: state.setSchroedingerAoRadius,
    setSchroedingerAoColor: state.setSchroedingerAoColor,
  }));
  const {
    schroedingerAoEnabled,
    schroedingerAoStrength,
    schroedingerAoQuality,
    schroedingerAoRadius,
    schroedingerAoColor,
    setSchroedingerAoEnabled,
    setSchroedingerAoStrength,
    setSchroedingerAoQuality,
    setSchroedingerAoRadius,
    setSchroedingerAoColor,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Use appropriate values based on object type
  const effectiveAoEnabled = isSchroedinger ? schroedingerAoEnabled : ssaoEnabled;
  const effectiveAoIntensity = isSchroedinger ? schroedingerAoStrength : ssaoIntensity;

  // Handlers that update the appropriate store
  const handleAoToggle = useCallback((enabled: boolean) => {
    if (isSchroedinger) {
      setSchroedingerAoEnabled(enabled);
    } else {
      setSSAOEnabled(enabled);
    }
  }, [isSchroedinger, setSchroedingerAoEnabled, setSSAOEnabled]);

  const handleAoIntensityChange = useCallback((intensity: number) => {
    if (isSchroedinger) {
      setSchroedingerAoStrength(intensity);
    } else {
      setSSAOIntensity(intensity);
    }
  }, [isSchroedinger, setSchroedingerAoStrength, setSSAOIntensity]);

  const handleAoQualityChange = useCallback((val: string) => {
    setSchroedingerAoQuality(parseInt(val, 10));
  }, [setSchroedingerAoQuality]);

  // Get AO type label
  const aoTypeLabel = isSchroedinger
    ? 'Volumetric (Schrödinger)'
    : 'Screen-Space (SSAO)';


  const hasSelectedLight = selectedLightId !== null;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Light List Group */}
      <ControlGroup collapsible defaultOpen
        title="Scene Lights"
        rightElement={
          <div className="flex items-center gap-2" title="Show light indicators in scene">
             <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Gizmos</span>
             <Switch
                checked={showLightGizmos}
                onCheckedChange={setShowLightGizmos}
             />
          </div>
        }
      >
        <LightList />
      </ControlGroup>

      {/* Light Editor (when light selected - includes ambient light) */}
      {hasSelectedLight && (
        <ControlGroup title="Light Properties" collapsible defaultOpen>
          <LightEditor />
        </ControlGroup>
      )}

      {/* Ambient Occlusion - Unified controls */}
      <ControlGroup
        title="Ambient Occlusion"
        collapsible defaultOpen
        rightElement={
          <Switch
            checked={effectiveAoEnabled}
            onCheckedChange={handleAoToggle}
            data-testid="ao-toggle"
          />
        }
      >
        <p className="text-[10px] text-text-secondary mb-2">
          {aoTypeLabel}
        </p>
        <div
          className={`space-y-3 ${!effectiveAoEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          aria-disabled={!effectiveAoEnabled}
        >
          {/* Shared Intensity/Strength slider */}
          <Slider
            label="Intensity"
            value={effectiveAoIntensity ?? 1.0}
            min={0}
            max={2}
            step={0.1}
            onChange={handleAoIntensityChange}
            showValue
            tooltip="Higher values create darker crevice shadows."
            data-testid="ao-intensity-slider"
          />

          {/* Schrödinger-specific controls - shown but disabled when not Schrödinger */}
          <div
            className={`space-y-3 ${!isSchroedinger ? 'opacity-50 pointer-events-none' : ''}`}
            aria-disabled={!isSchroedinger}
          >
            <p className="text-[10px] text-text-secondary border-t border-border-subtle pt-2">
              Volumetric AO Settings {!isSchroedinger && '(Schrödinger only)'}
            </p>
            <Select<string>
              label="Quality"
              options={AO_QUALITY_OPTIONS}
              value={String(schroedingerAoQuality ?? 4)}
              onChange={handleAoQualityChange}
              data-testid="ao-quality-select"
            />
            <Slider
              label="Radius"
              min={0.1}
              max={2.0}
              step={0.1}
              value={schroedingerAoRadius ?? 0.5}
              onChange={setSchroedingerAoRadius}
              showValue
              tooltip="Sampling radius for cone-traced AO"
              data-testid="ao-radius-slider"
            />
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-secondary">Shadow Tint</label>
              <ColorPicker
                value={schroedingerAoColor ?? '#000000'}
                onChange={setSchroedingerAoColor}
                disableAlpha={true}
                className="w-24"
                data-testid="ao-color-picker"
              />
            </div>
          </div>
        </div>
      </ControlGroup>
    </div>
  );
});

LightingControls.displayName = 'LightingControls';
