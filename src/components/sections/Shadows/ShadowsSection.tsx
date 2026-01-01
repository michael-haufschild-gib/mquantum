/**
 * Shadows Section Component
 *
 * Centralized shadow controls for all object types:
 * - SDF Fractals (Mandelbulb, Julia): Raymarched soft shadows
 * - Volumetric (Schrödinger): Self-shadowing with volumetric integration
 * - Mesh-based (Polytopes): Three.js shadow maps
 */

import { Section } from '@/components/sections/Section';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { isPolytopeCategory } from '@/lib/geometry/registry/helpers';
import type { LightSource } from '@/rendering/lights/types';
import {
  SHADOW_QUALITY_LABELS,
  SHADOW_QUALITY_OPTIONS,
  SHADOW_QUALITY_TOOLTIPS,
  SHADOW_SOFTNESS_RANGE,
} from '@/rendering/shadows/constants';
import type { ShadowQuality } from '@/rendering/shadows/types';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore';
import React, { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

export interface ShadowsSectionProps {
  defaultOpen?: boolean;
}

/**
 * Shadow quality options for select dropdown
 */
const SHADOW_QUALITY_SELECT_OPTIONS: SelectOption<ShadowQuality>[] =
  SHADOW_QUALITY_OPTIONS.map((quality: ShadowQuality) => ({
    value: quality,
    label: SHADOW_QUALITY_LABELS[quality],
  }));

/**
 * Shadow steps options for Schrödinger
 */
const SHADOW_STEPS_OPTIONS: SelectOption<string>[] = [
  { value: '2', label: '2 steps (Fast)' },
  { value: '4', label: '4 steps (Balanced)' },
  { value: '6', label: '6 steps (Quality)' },
  { value: '8', label: '8 steps (High)' },
];

export const ShadowsSection: React.FC<ShadowsSectionProps> = React.memo(({
  defaultOpen = false,
}) => {
  // Get current object type
  const objectType = useGeometryStore((state) => state.objectType);

  // Get global lighting state
  const lightingSelector = useShallow((state: LightingSlice) => ({
    lights: state.lights,
    shadowEnabled: state.shadowEnabled,
    shadowQuality: state.shadowQuality,
    shadowSoftness: state.shadowSoftness,
    shadowMapBias: state.shadowMapBias,
    shadowMapBlur: state.shadowMapBlur,
    setShadowEnabled: state.setShadowEnabled,
    setShadowQuality: state.setShadowQuality,
    setShadowSoftness: state.setShadowSoftness,
    setShadowMapBias: state.setShadowMapBias,
    setShadowMapBlur: state.setShadowMapBlur,
  }));
  const {
    lights,
    shadowEnabled,
    shadowQuality,
    shadowSoftness,
    shadowMapBias,
    shadowMapBlur,
    setShadowEnabled,
    setShadowQuality,
    setShadowSoftness,
    setShadowMapBias,
    setShadowMapBlur,
  } = useLightingStore(lightingSelector);

  // Get Schrödinger-specific shadow settings
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    schroedingerShadowsEnabled: state.schroedinger.shadowsEnabled,
    schroedingerShadowStrength: state.schroedinger.shadowStrength,
    schroedingerShadowSteps: state.schroedinger.shadowSteps,
    setSchroedingerShadowsEnabled: state.setSchroedingerShadowsEnabled,
    setSchroedingerShadowStrength: state.setSchroedingerShadowStrength,
    setSchroedingerShadowSteps: state.setSchroedingerShadowSteps,
  }));
  const {
    schroedingerShadowsEnabled,
    schroedingerShadowStrength,
    schroedingerShadowSteps,
    setSchroedingerShadowsEnabled,
    setSchroedingerShadowStrength,
    setSchroedingerShadowSteps,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Determine object category - direct checks for clarity
  const isSchroedinger = objectType === 'schroedinger';
  const isPolytope = isPolytopeCategory(objectType);
  const isSdfFractal = objectType === 'mandelbulb' || objectType === 'quaternion-julia';

  // Check if there are any enabled lights (shadows require lights)
  const hasEnabledLights = lights.some((light: LightSource) => light.enabled);

  // For Schrödinger, use its own shadow toggle; for others, use global shadowEnabled
  const effectiveShadowEnabled = isSchroedinger ? schroedingerShadowsEnabled : shadowEnabled;
  const handleShadowToggle = useCallback((enabled: boolean) => {
    if (isSchroedinger) {
      setSchroedingerShadowsEnabled(enabled);
    } else {
      setShadowEnabled(enabled);
    }
  }, [isSchroedinger, setSchroedingerShadowsEnabled, setShadowEnabled]);

  const handleShadowStepsChange = useCallback((val: string) => {
    setSchroedingerShadowSteps(parseInt(val, 10));
  }, [setSchroedingerShadowSteps]);

  // Get shadow type info for description (memoized)
  const shadowTypeInfo = useMemo(() => {
    if (isSchroedinger) {
      return {
        label: 'Self-Shadow (Volumetric)',
        description: 'Light absorption within the probability cloud',
      };
    }
    if (isSdfFractal) {
      return {
        label: 'Self-Shadow (Raymarched)',
        description: 'Parts of the fractal shadow other parts',
      };
    }
    if (isPolytope) {
      return {
        label: 'Environment Shadow',
        description: 'Casts shadows onto walls and floors',
      };
    }
    return {
      label: 'Standard',
      description: '',
    };
  }, [isSchroedinger, isSdfFractal, isPolytope]);

  return (
    <Section title="Shadows" defaultOpen={defaultOpen} data-testid="section-shadows">
      {hasEnabledLights ? (
        <div className="space-y-4">
          {/* Shadow Type Label */}
          <div className="px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-border-default">
            <p className="text-[10px] font-medium text-text-primary">
              {shadowTypeInfo.label}
            </p>
            <p className="text-[10px] text-text-secondary">
              {shadowTypeInfo.description}
            </p>
          </div>

          {/* Main Shadow Toggle */}

              <Switch
                checked={effectiveShadowEnabled}
                onCheckedChange={handleShadowToggle}
                data-testid="shadow-enabled-toggle"
                label="Enable shadows"
              />

          {/* Shadow Settings - conditionally rendered based on shadow enabled */}
          <div
            className={`space-y-4 ${!effectiveShadowEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            aria-disabled={!effectiveShadowEnabled}
          >

            {/* SDF Fractal Controls (Mandelbulb, Julia) */}
            {isSdfFractal && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Select<ShadowQuality>
                      label="Quality"
                      options={SHADOW_QUALITY_SELECT_OPTIONS}
                      value={shadowQuality}
                      onChange={setShadowQuality}
                      data-testid="shadow-quality-select"
                    />
                    <p className="text-[10px] text-text-secondary">
                      {SHADOW_QUALITY_TOOLTIPS[shadowQuality as ShadowQuality]}
                    </p>
                  </div>
                  <Slider
                    label="Softness"
                    min={SHADOW_SOFTNESS_RANGE.min}
                    max={SHADOW_SOFTNESS_RANGE.max}
                    step={SHADOW_SOFTNESS_RANGE.step}
                    value={shadowSoftness}
                    onChange={setShadowSoftness}
                    showValue
                    tooltip="Higher values create softer shadow edges"
                    data-testid="shadow-softness-slider"
                  />
                </div>
            )}

            {/* Schrödinger Volumetric Shadow Controls */}
            {isSchroedinger && (
              <div>
                <p className="text-[10px] text-text-secondary mb-2">
                  Expensive volumetric light integration for realistic cloud-like shadows.
                </p>
                <div className="space-y-3">
                  <Slider
                    label="Strength"
                    min={0}
                    max={2}
                    step={0.1}
                    value={schroedingerShadowStrength}
                    onChange={setSchroedingerShadowStrength}
                    showValue
                    tooltip="Shadow darkness intensity"
                    data-testid="schroedinger-shadow-strength"
                  />
                  <div className="space-y-1">
                    <Select<string>
                      label="Steps"
                      options={SHADOW_STEPS_OPTIONS}
                      value={String(schroedingerShadowSteps)}
                      onChange={handleShadowStepsChange}
                      data-testid="schroedinger-shadow-steps"
                    />
                    <p className="text-[10px] text-text-secondary">
                      More steps = softer shadows, higher GPU cost
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Polytope Shadow Map Controls */}
            {isPolytope && (
              <div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Select<ShadowQuality>
                      label="Resolution"
                      options={SHADOW_QUALITY_SELECT_OPTIONS}
                      value={shadowQuality}
                      onChange={setShadowQuality}
                      data-testid="shadow-quality-select"
                    />
                    <p className="text-[10px] text-text-secondary">
                      Shadow map size: {shadowQuality === 'low' ? '512' : shadowQuality === 'medium' ? '1024' : shadowQuality === 'high' ? '2048' : '4096'}px
                    </p>
                  </div>
                  <Slider
                    label="Bias"
                    min={0}
                    max={0.01}
                    step={0.001}
                    value={shadowMapBias}
                    onChange={setShadowMapBias}
                    showValue
                    tooltip="Adjust to prevent shadow acne artifacts"
                    data-testid="shadow-map-bias"
                  />
                  <Slider
                    label="Softness"
                    min={0}
                    max={10}
                    step={0.5}
                    value={shadowMapBlur}
                    onChange={setShadowMapBlur}
                    showValue
                    tooltip="Higher values create softer shadow edges (PCF blur)"
                    data-testid="shadow-map-blur"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-[var(--bg-hover)] border border-border-subtle border-dashed text-center">
          <p className="text-xs text-text-secondary italic">
            Add lights to enable shadows.
          </p>
        </div>
      )}
    </Section>
  );
});

ShadowsSection.displayName = 'ShadowsSection';
