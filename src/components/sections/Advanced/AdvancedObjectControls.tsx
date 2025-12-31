import { Section } from '@/components/sections/Section';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { ControlGroup } from '@/components/ui/ControlGroup';
import { NumberInput } from '@/components/ui/NumberInput';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { ToggleButton } from '@/components/ui/ToggleButton';
import type { BlackHoleRayBendingMode } from '@/lib/geometry/extended/types';
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore';
import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Object types that show the Advanced Rendering section
const ADVANCED_RENDERING_OBJECT_TYPES = [
  'mandelbulb',
  'quaternion-julia',
  'schroedinger',
  'blackhole',
  'hypercube',
  'simplex',
  'cross-polytope',
  'wythoff-polytope',
  'root-system',
  'clifford-torus',
  'nested-torus',
];

// Note: Quality preset toggles (fast/balanced/quality/ultra) have been removed
// - Schrödinger uses fixed sample counts (64 HQ, 32 fast) in shader
// - Black hole uses Max Steps and Step Size sliders in BlackHoleAdvanced

export const AdvancedObjectControls: React.FC = () => {
  const objectType = useGeometryStore(state => state.objectType);

  // Show for all supported object types (fractals + polytopes)
  if (!ADVANCED_RENDERING_OBJECT_TYPES.includes(objectType)) {
    return null;
  }

  const isPolytope = ['hypercube', 'simplex', 'cross-polytope', 'wythoff-polytope'].includes(objectType);

  return (
    <Section title="Advanced Rendering" defaultOpen={true} data-testid="advanced-object-controls">
      {/* Global Settings (Shared) - for all objects */}
      <SharedAdvancedControls />



      {/* Object-Specific Settings */}
      {objectType === 'schroedinger' && <SchroedingerAdvanced />}
      {objectType === 'blackhole' && <BlackHoleAdvanced />}
      {(objectType === 'mandelbulb' || objectType === 'quaternion-julia') && <FractalRenderQuality />}
      {isPolytope && <PolytopeAdvanced />}
    </Section>
  );
};

const SharedAdvancedControls: React.FC = () => {
  const objectType = useGeometryStore(state => state.objectType);
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    sssEnabled: state.sssEnabled, setSssEnabled: state.setSssEnabled,
    sssIntensity: state.sssIntensity, setSssIntensity: state.setSssIntensity,
    sssColor: state.sssColor, setSssColor: state.setSssColor,
    sssThickness: state.sssThickness, setSssThickness: state.setSssThickness,
    sssJitter: state.sssJitter, setSssJitter: state.setSssJitter,
    fresnelEnabled: state.shaderSettings.surface.fresnelEnabled,
    setSurfaceSettings: state.setSurfaceSettings,
    fresnelIntensity: state.fresnelIntensity, setFresnelIntensity: state.setFresnelIntensity,
  }));
  const {
    sssEnabled, setSssEnabled,
    sssIntensity, setSssIntensity,
    sssColor, setSssColor,
    sssThickness, setSssThickness,
    sssJitter, setSssJitter,
    fresnelEnabled, setSurfaceSettings,
    fresnelIntensity, setFresnelIntensity,
  } = useAppearanceStore(appearanceSelector);

  return (
    <div className="space-y-4 mb-4 pb-4">
      {/* Subsurface Scattering */}
      <ControlGroup
        title="Subsurface Scattering"
        collapsible
        defaultOpen={false}
        rightElement={
          <Switch
            checked={sssEnabled}
            onCheckedChange={setSssEnabled}
            data-testid="global-sss-toggle"
          />
        }
      >
        <Slider
          label="Intensity"
          min={0.0}
          max={2.0}
          step={0.1}
          value={sssIntensity}
          onChange={setSssIntensity}
          showValue
          data-testid="global-sss-intensity"
        />
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--text-secondary)]">SSS Tint</label>
          <ColorPicker
            value={sssColor}
            onChange={(c) => setSssColor(c)}
            disableAlpha={true}
            className="w-24"
          />
        </div>
        <Slider
          label="Thickness"
          min={0.1}
          max={5.0}
          step={0.1}
          value={sssThickness}
          onChange={setSssThickness}
          showValue
          data-testid="global-sss-thickness"
        />
        <Slider
          label="Sample Jitter"
          min={0.0}
          max={1.0}
          step={0.05}
          value={sssJitter}
          onChange={setSssJitter}
          showValue
          data-testid="global-sss-jitter"
        />
      </ControlGroup>

      {/* Fresnel Rim */}
      <ControlGroup
        title="Fresnel Rim"
        collapsible
        defaultOpen={false}
        rightElement={
          <Switch
            checked={fresnelEnabled}
            onCheckedChange={(checked) => setSurfaceSettings({ fresnelEnabled: checked })}
            data-testid="global-fresnel-toggle"
          />
        }
      >
        <Slider
          label="Intensity"
          min={0.0}
          max={1.0}
          step={0.1}
          value={fresnelIntensity}
          onChange={setFresnelIntensity}
          showValue
          data-testid="global-fresnel-intensity"
        />
      </ControlGroup>

      {/* Gravitational Lensing - only available for black hole */}
      {objectType === 'blackhole' && <GravityAdvanced />}
    </div>
  );
};

const SchroedingerAdvanced: React.FC = () => {
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    setDensityGain: state.setSchroedingerDensityGain,
    setPowderScale: state.setSchroedingerPowderScale,
    setScatteringAnisotropy: state.setSchroedingerScatteringAnisotropy,
    setDispersionEnabled: state.setSchroedingerDispersionEnabled,
    setDispersionStrength: state.setSchroedingerDispersionStrength,
    setDispersionDirection: state.setSchroedingerDispersionDirection,
    setDispersionQuality: state.setSchroedingerDispersionQuality,
    // Shadows/AO
    setShadowsEnabled: state.setSchroedingerShadowsEnabled,
    setShadowStrength: state.setSchroedingerShadowStrength,
    setAoEnabled: state.setSchroedingerAoEnabled,
    setAoStrength: state.setSchroedingerAoStrength,
    // Quantum Effects
    setNodalEnabled: state.setSchroedingerNodalEnabled,
    setNodalColor: state.setSchroedingerNodalColor,
    setNodalStrength: state.setSchroedingerNodalStrength,
    setEnergyColorEnabled: state.setSchroedingerEnergyColorEnabled,
    setShimmerEnabled: state.setSchroedingerShimmerEnabled,
    setShimmerStrength: state.setSchroedingerShimmerStrength,
    setIsoEnabled: state.setSchroedingerIsoEnabled,
    setIsoThreshold: state.setSchroedingerIsoThreshold,
    // Erosion
    setErosionStrength: state.setSchroedingerErosionStrength,
    setErosionScale: state.setSchroedingerErosionScale,
    setErosionTurbulence: state.setSchroedingerErosionTurbulence,
    setErosionNoiseType: state.setSchroedingerErosionNoiseType,
    setErosionHQ: state.setSchroedingerErosionHQ,
  }));
  const {
    config,
    setDensityGain,
    setPowderScale,
    setScatteringAnisotropy,
    setDispersionEnabled,
    setDispersionStrength,
    setDispersionDirection,
    setDispersionQuality,
    setShadowsEnabled,
    setShadowStrength,
    setAoEnabled,
    setAoStrength,
    setNodalEnabled,
    setNodalColor,
    setNodalStrength,
    setEnergyColorEnabled,
    setShimmerEnabled,
    setShimmerStrength,
    setIsoEnabled,
    setIsoThreshold,
    setErosionStrength,
    setErosionScale,
    setErosionTurbulence,
    setErosionNoiseType,
    setErosionHQ,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Emission settings from appearance store
  const emissionSelector = useShallow((state: AppearanceSlice) => ({
    faceEmission: state.faceEmission,
    faceEmissionThreshold: state.faceEmissionThreshold,
    faceEmissionColorShift: state.faceEmissionColorShift,
    faceEmissionPulsing: state.faceEmissionPulsing,
    faceRimFalloff: state.faceRimFalloff,
    setFaceEmission: state.setFaceEmission,
    setFaceEmissionThreshold: state.setFaceEmissionThreshold,
    setFaceEmissionColorShift: state.setFaceEmissionColorShift,
    setFaceEmissionPulsing: state.setFaceEmissionPulsing,
    setFaceRimFalloff: state.setFaceRimFalloff,
  }));
  const {
    faceEmission,
    faceEmissionThreshold,
    faceEmissionColorShift,
    faceEmissionPulsing,
    faceRimFalloff,
    setFaceEmission,
    setFaceEmissionThreshold,
    setFaceEmissionColorShift,
    setFaceEmissionPulsing,
    setFaceRimFalloff,
  } = useAppearanceStore(emissionSelector);

  return (
    <div className="space-y-4">
      {/* Emission & Rim */}
      <ControlGroup title="Emission & Rim" collapsible defaultOpen>
        <Slider
          label="Emission Strength"
          min={0}
          max={5}
          step={0.1}
          value={faceEmission}
          onChange={setFaceEmission}
          showValue
          data-testid="schroedinger-emission-strength"
        />
        <Slider
          label="Emission Threshold"
          min={0}
          max={1}
          step={0.05}
          value={faceEmissionThreshold}
          onChange={setFaceEmissionThreshold}
          showValue
          data-testid="schroedinger-emission-threshold"
        />
        <Slider
          label="Color Shift"
          min={-1}
          max={1}
          step={0.1}
          value={faceEmissionColorShift}
          onChange={setFaceEmissionColorShift}
          showValue
          data-testid="schroedinger-emission-color-shift"
        />
        <div className="flex items-center justify-between py-2">
          <label className="text-xs text-text-secondary">Pulsing</label>
          <Switch
            checked={faceEmissionPulsing}
            onCheckedChange={setFaceEmissionPulsing}
            data-testid="schroedinger-emission-pulsing"
          />
        </div>
        <Slider
          label="Rim Falloff"
          min={0}
          max={10}
          step={0.5}
          value={faceRimFalloff}
          onChange={setFaceRimFalloff}
          showValue
          data-testid="schroedinger-rim-falloff"
        />
      </ControlGroup>

      {/* Volume Rendering (includes Volume Effects) */}
      <ControlGroup title="Volume Rendering" collapsible defaultOpen>
        <Slider
          label="Density Gain"
          min={0.1}
          max={5.0}
          step={0.1}
          value={config.densityGain}
          onChange={setDensityGain}
          showValue
          data-testid="schroedinger-density-gain"
        />
        <Slider
          label="Powder Effect"
          min={0.0}
          max={2.0}
          step={0.1}
          value={config.powderScale}
          onChange={setPowderScale}
          showValue
          data-testid="schroedinger-powder-scale"
        />
        <Slider
          label="Anisotropy (Phase)"
          min={-0.9}
          max={0.9}
          step={0.05}
          value={config.scatteringAnisotropy ?? 0.0}
          onChange={setScatteringAnisotropy}
          showValue
          data-testid="schroedinger-anisotropy"
        />

        {/* Volumetric Shadows */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Volumetric Shadows</label>
          <ToggleButton
            pressed={config.shadowsEnabled ?? false}
            onToggle={() => setShadowsEnabled(!(config.shadowsEnabled ?? false))}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle shadows"
          >
            {config.shadowsEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.shadowsEnabled && (
          <Slider
            label="Shadow Strength"
            min={0}
            max={2}
            step={0.1}
            value={config.shadowStrength ?? 1.0}
            onChange={setShadowStrength}
            showValue
          />
        )}

        {/* Volumetric AO */}
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs text-text-secondary">Volumetric AO</label>
          <ToggleButton
            pressed={config.aoEnabled ?? false}
            onToggle={() => setAoEnabled(!(config.aoEnabled ?? false))}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle AO"
          >
            {config.aoEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.aoEnabled && (
          <Slider
            label="AO Strength"
            min={0}
            max={2}
            step={0.1}
            value={config.aoStrength ?? 1.0}
            onChange={setAoStrength}
            showValue
          />
        )}

        {/* Isosurface Mode */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Isosurface Mode</label>
          <ToggleButton
            pressed={config.isoEnabled}
            onToggle={() => setIsoEnabled(!config.isoEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle isosurface mode"
            data-testid="schroedinger-iso-toggle"
          >
            {config.isoEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.isoEnabled && (
          <Slider
            label="Iso Threshold (log)"
            min={-6}
            max={0}
            step={0.1}
            value={config.isoThreshold}
            onChange={setIsoThreshold}
            showValue
            data-testid="schroedinger-iso-threshold"
          />
        )}
        <p className="text-xs text-text-tertiary">
          {config.isoEnabled
            ? 'Sharp surface at constant probability density'
            : 'Volumetric cloud visualization'
          }
        </p>
      </ControlGroup>

      {/* Quantum Effects */}
      <ControlGroup title="Quantum Effects" collapsible defaultOpen>
        {/* Nodal Surfaces */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Nodal Surfaces</label>
            <ToggleButton
              pressed={config.nodalEnabled ?? false}
              onToggle={() => setNodalEnabled(!(config.nodalEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle nodal surfaces"
              data-testid="schroedinger-nodal-toggle"
            >
              {config.nodalEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.nodalEnabled && (
            <div className="ps-2 border-s border-border-default">
              <Slider
                label="Strength"
                min={0.0}
                max={2.0}
                step={0.1}
                value={config.nodalStrength ?? 1.0}
                onChange={setNodalStrength}
                showValue
                data-testid="schroedinger-nodal-strength"
              />
              <div className="flex items-center justify-between mt-1">
                <label className="text-xs text-text-secondary">Color</label>
                <ColorPicker
                  value={config.nodalColor ?? '#00ffff'}
                  onChange={(c) => setNodalColor(c)}
                  disableAlpha={true}
                  className="w-24"
                />
              </div>
            </div>
          )}
        </div>

        {/* Energy Coloring */}
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs text-text-secondary">Energy Coloring</label>
          <ToggleButton
            pressed={config.energyColorEnabled ?? false}
            onToggle={() => setEnergyColorEnabled(!(config.energyColorEnabled ?? false))}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle energy coloring"
            data-testid="schroedinger-energy-toggle"
          >
            {config.energyColorEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>

        {/* Uncertainty Shimmer */}
        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Uncertainty Shimmer</label>
            <ToggleButton
              pressed={config.shimmerEnabled ?? false}
              onToggle={() => setShimmerEnabled(!(config.shimmerEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle shimmer"
              data-testid="schroedinger-shimmer-toggle"
            >
              {config.shimmerEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.shimmerEnabled && (
            <Slider
              label="Strength"
              min={0.0}
              max={1.0}
              step={0.1}
              value={config.shimmerStrength ?? 0.5}
              onChange={setShimmerStrength}
              showValue
              data-testid="schroedinger-shimmer-strength"
            />
          )}
        </div>
      </ControlGroup>

      {/* Artistic - Chromatic Dispersion & Erosion */}
      <ControlGroup title="Artistic" collapsible defaultOpen>
        {/* Chromatic Dispersion */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary font-medium">Chromatic Dispersion</label>
            <ToggleButton
              pressed={config.dispersionEnabled ?? false}
              onToggle={() => setDispersionEnabled(!(config.dispersionEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle dispersion"
              data-testid="schroedinger-dispersion-toggle"
            >
              {config.dispersionEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.dispersionEnabled && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Strength"
                min={0.0}
                max={1.0}
                step={0.05}
                value={config.dispersionStrength ?? 0.2}
                onChange={setDispersionStrength}
                showValue
                data-testid="schroedinger-dispersion-strength"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    label="Direction"
                    options={[
                      { value: '0', label: 'Radial' },
                      { value: '1', label: 'View' },
                    ]}
                    value={String(config.dispersionDirection ?? 0)}
                    onChange={(v) => setDispersionDirection(parseInt(v))}
                    data-testid="schroedinger-dispersion-direction"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    label="Quality"
                    options={[
                      { value: '0', label: 'Fast (Grad)' },
                      { value: '1', label: 'High (Sample)' },
                    ]}
                    value={String(config.dispersionQuality ?? 0)}
                    onChange={(v) => setDispersionQuality(parseInt(v))}
                    data-testid="schroedinger-dispersion-quality"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Edge Erosion */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary font-medium">Edge Erosion</label>
          <Slider
            label="Strength"
            min={0.0}
            max={1.0}
            step={0.05}
            value={config.erosionStrength ?? 0.0}
            onChange={setErosionStrength}
            showValue
            data-testid="schroedinger-erosion-strength"
          />
          {(config.erosionStrength ?? 0) > 0 && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Scale"
                min={0.25}
                max={4.0}
                step={0.25}
                value={config.erosionScale ?? 1.0}
                onChange={setErosionScale}
                showValue
                data-testid="schroedinger-erosion-scale"
              />
              <Slider
                label="Turbulence"
                min={0.0}
                max={1.0}
                step={0.1}
                value={config.erosionTurbulence ?? 0.5}
                onChange={setErosionTurbulence}
                showValue
                data-testid="schroedinger-erosion-turbulence"
              />
              <Select
                label="Noise Type"
                options={[
                  { value: '0', label: 'Worley (Cloudy)' },
                  { value: '1', label: 'Perlin (Smooth)' },
                  { value: '2', label: 'Hybrid (Billowy)' },
                ]}
                value={String(config.erosionNoiseType ?? 0)}
                onChange={(v) => setErosionNoiseType(parseInt(v))}
                data-testid="schroedinger-erosion-type"
              />
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">HQ Mode</label>
                <ToggleButton
                  pressed={config.erosionHQ ?? false}
                  onToggle={() => setErosionHQ(!(config.erosionHQ ?? false))}
                  className="text-xs px-2 py-1 h-auto"
                  data-testid="schroedinger-erosion-hq"
                  ariaLabel="Toggle high quality erosion mode"
                >
                  {config.erosionHQ ? 'ON' : 'OFF'}
                </ToggleButton>
              </div>
            </div>
          )}
        </div>
      </ControlGroup>
    </div>
  );
};

const PolytopeAdvanced: React.FC = () => {
  // All Polytope animations have been moved to the Timeline Animation Drawer.
  // This component is currently empty but retained for future advanced settings.
  return null;
};

/**
 * Fractal Render Quality Controls
 * Controls SDF iterations and surface distance for Mandelbulb and Quaternion Julia fractals.
 * These parameters directly control raymarching quality vs performance.
 */
const FractalRenderQuality: React.FC = () => {
  const objectType = useGeometryStore(state => state.objectType);

  // Mandelbulb selectors
  const mandelbulbSelector = useShallow((state: ExtendedObjectState) => ({
    sdfMaxIterations: state.mandelbulb.sdfMaxIterations,
    sdfSurfaceDistance: state.mandelbulb.sdfSurfaceDistance,
    setSdfMaxIterations: state.setMandelbulbSdfMaxIterations,
    setSdfSurfaceDistance: state.setMandelbulbSdfSurfaceDistance,
  }));

  // Quaternion Julia selectors
  const juliaSelector = useShallow((state: ExtendedObjectState) => ({
    sdfMaxIterations: state.quaternionJulia.sdfMaxIterations,
    sdfSurfaceDistance: state.quaternionJulia.sdfSurfaceDistance,
    setSdfMaxIterations: state.setQuaternionJuliaSdfMaxIterations,
    setSdfSurfaceDistance: state.setQuaternionJuliaSdfSurfaceDistance,
  }));

  const mandelbulbState = useExtendedObjectStore(mandelbulbSelector);
  const juliaState = useExtendedObjectStore(juliaSelector);

  // Select appropriate state based on object type
  const state = objectType === 'mandelbulb' ? mandelbulbState : juliaState;
  const testIdPrefix = objectType === 'mandelbulb' ? 'mandelbulb' : 'julia';

  return (
    <ControlGroup title="Render Quality" collapsible defaultOpen>
      <Slider
        label="SDF Iterations"
        min={5}
        max={100}
        step={1}
        value={state.sdfMaxIterations}
        onChange={state.setSdfMaxIterations}
        showValue
        data-testid={`${testIdPrefix}-sdf-max-iterations`}
      />
      <Slider
        label="Surface Distance"
        min={0.00005}
        max={0.01}
        step={0.00005}
        value={state.sdfSurfaceDistance}
        onChange={state.setSdfSurfaceDistance}
        showValue
        data-testid={`${testIdPrefix}-sdf-surface-distance`}
      />
      <p className="text-xs text-text-tertiary">
        Higher iterations and lower surface distance = better quality but slower
      </p>
    </ControlGroup>
  );
};

/**
 * Black Hole Gravity Controls
 * Only rendered for black hole object type. Gravity is always enabled for black holes.
 * Settings sync with internal black hole lensing parameters.
 * @returns React element for gravity controls
 */
const GravityAdvanced: React.FC = () => {
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
};

const BlackHoleAdvanced: React.FC = () => {
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.blackhole,
    // Visuals (gravity-related moved to global GravityAdvanced)
    setBloomBoost: state.setBlackHoleBloomBoost,
    setDiskTemperature: state.setBlackHoleDiskTemperature,
    setManifoldIntensity: state.setBlackHoleManifoldIntensity,
    // Lensing (non-gravity params only - gravity params in GravityAdvanced)
    setDimensionEmphasis: state.setBlackHoleDimensionEmphasis,
    setRayBendingMode: state.setBlackHoleRayBendingMode,
    setEpsilonMul: state.setBlackHoleEpsilonMul,
    // Manifold Visuals
    setNoiseScale: state.setBlackHoleNoiseScale,
    setNoiseAmount: state.setBlackHoleNoiseAmount,
    // Shell
    setPhotonShellWidth: state.setBlackHolePhotonShellWidth,
    setShellGlowStrength: state.setBlackHoleShellGlowStrength,
    setShellGlowColor: state.setBlackHoleShellGlowColor,
    // Doppler
    setDopplerEnabled: state.setBlackHoleDopplerEnabled,
    setDopplerStrength: state.setBlackHoleDopplerStrength,
    // Rendering
    setMaxSteps: state.setBlackHoleMaxSteps,
    setStepBase: state.setBlackHoleStepBase,
    setEnableAbsorption: state.setBlackHoleEnableAbsorption,
    setAbsorption: state.setBlackHoleAbsorption,
    // Motion blur
    setMotionBlurEnabled: state.setBlackHoleMotionBlurEnabled,
    setMotionBlurStrength: state.setBlackHoleMotionBlurStrength,
  }));
  const {
    config,
    setBloomBoost,
    setDiskTemperature,
    setManifoldIntensity,
    setDimensionEmphasis,
    setRayBendingMode,
    setEpsilonMul,
    setNoiseScale,
    setNoiseAmount,
    setPhotonShellWidth,
    setShellGlowStrength,
    setShellGlowColor,
    setDopplerEnabled,
    setDopplerStrength,
    setMaxSteps,
    setStepBase,
    setEnableAbsorption,
    setAbsorption,
    setMotionBlurEnabled,
    setMotionBlurStrength,
  } = useExtendedObjectStore(extendedObjectSelector);

  return (
    <div className="space-y-4">
      {/* Accretion Disk */}
      <ControlGroup title="Accretion Disk" collapsible defaultOpen>
        <Slider
          label="Intensity"
          min={0}
          max={10.0}
          step={0.1}
          value={config.manifoldIntensity}
          onChange={setManifoldIntensity}
          showValue
        />
        <Slider
          label="Temperature (K)"
          min={1000}
          max={40000}
          step={100}
          value={config.diskTemperature}
          onChange={setDiskTemperature}
          showValue
        />
        <Slider
          label="Bloom Boost"
          min={0}
          max={5.0}
          step={0.1}
          value={config.bloomBoost}
          onChange={setBloomBoost}
          showValue
          data-testid="blackhole-bloom-boost"
        />

        {/* Turbulence */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary font-medium">Turbulence</label>
          <Slider
            label="Noise Amount"
            min={0}
            max={1}
            step={0.05}
            value={config.noiseAmount}
            onChange={setNoiseAmount}
            showValue
          />
          <Slider
            label="Noise Scale"
            min={0.1}
            max={5}
            step={0.1}
            value={config.noiseScale}
            onChange={setNoiseScale}
            showValue
          />
        </div>

        {/* Absorption */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Absorption</label>
          <ToggleButton
            pressed={config.enableAbsorption}
            onToggle={() => setEnableAbsorption(!config.enableAbsorption)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle absorption"
            data-testid="blackhole-absorption-toggle"
          >
            {config.enableAbsorption ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.enableAbsorption && (
          <Slider
            label="Absorption Strength"
            min={0}
            max={5}
            step={0.1}
            value={config.absorption}
            onChange={setAbsorption}
            showValue
            data-testid="blackhole-absorption"
          />
        )}

        {/* Motion Blur */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Motion Blur</label>
          <ToggleButton
            pressed={config.motionBlurEnabled}
            onToggle={() => setMotionBlurEnabled(!config.motionBlurEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle motion blur"
            data-testid="blackhole-motion-blur-toggle"
          >
            {config.motionBlurEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.motionBlurEnabled && (
          <Slider
            label="Blur Strength"
            min={0}
            max={2}
            step={0.1}
            value={config.motionBlurStrength}
            onChange={setMotionBlurStrength}
            showValue
            data-testid="blackhole-motion-blur-strength"
          />
        )}
      </ControlGroup>

      {/* Photon Shell */}
      <ControlGroup title="Photon Shell" collapsible defaultOpen>
        <Slider
          label="Width"
          min={0}
          max={0.3}
          step={0.01}
          value={config.photonShellWidth}
          onChange={setPhotonShellWidth}
          showValue
        />
        <Slider
          label="Glow Strength"
          min={0}
          max={10.0}
          step={0.5}
          value={config.shellGlowStrength}
          onChange={setShellGlowStrength}
          showValue
        />
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Color</label>
          <ColorPicker
            value={config.shellGlowColor}
            onChange={setShellGlowColor}
            disableAlpha={true}
            className="w-24"
          />
        </div>
      </ControlGroup>

      {/* Relativistic Effects */}
      <ControlGroup title="Relativistic Effects" collapsible defaultOpen>
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Doppler Effect</label>
          <ToggleButton
            pressed={config.dopplerEnabled}
            onToggle={() => setDopplerEnabled(!config.dopplerEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle doppler effect"
          >
            {config.dopplerEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.dopplerEnabled && (
          <Slider
            label="Doppler Strength"
            min={0}
            max={2.0}
            step={0.1}
            value={config.dopplerStrength}
            onChange={setDopplerStrength}
            showValue
          />
        )}
      </ControlGroup>

      {/* Rendering */}
      <ControlGroup title="Rendering" collapsible defaultOpen>
        <Slider
          label="Max Steps"
          min={128}
          max={768}
          step={64}
          value={config.maxSteps}
          onChange={setMaxSteps}
          showValue
          data-testid="blackhole-max-steps"
        />
        <Slider
          label="Step Size"
          min={0.02}
          max={0.15}
          step={0.01}
          value={config.stepBase}
          onChange={setStepBase}
          showValue
          data-testid="blackhole-step-size"
        />
        <p className="text-xs text-text-tertiary">
          Lower step size = higher quality, slower. Higher max steps = more detail.
        </p>

        {/* Advanced Lensing */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary font-medium">Advanced Lensing</label>
          <Slider
            label="Dim. Emphasis"
            min={0}
            max={2}
            step={0.1}
            value={config.dimensionEmphasis}
            onChange={setDimensionEmphasis}
            showValue
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                label="Mode"
                options={[
                  { value: 'spiral', label: 'Spiral' },
                  { value: 'orbital', label: 'Orbital' },
                ]}
                value={config.rayBendingMode}
                onChange={(v) => setRayBendingMode(v as BlackHoleRayBendingMode)}
              />
            </div>
            <div className="flex-1">
              <NumberInput
                label="Stability"
                value={config.epsilonMul}
                onChange={setEpsilonMul}
                min={0.0001}
                max={0.5}
                step={0.001}
                precision={4}
              />
            </div>
          </div>
        </div>
      </ControlGroup>

      {/* NOTE: Deferred Lensing / Gravity controls moved to global GravityAdvanced section */}
    </div>
  );
};
