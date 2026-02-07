/**
 * Faces Section Component
 *
 * Sidebar section for all face/surface settings organized in tabs:
 * - Colors: Color algorithm selection and configuration
 * - Material: Opacity, diffuse, and specular settings
 * - FX: Fresnel rim effects
 *
 */

import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Slider } from '@/components/ui/Slider'
import { Tabs } from '@/components/ui/Tabs'
import { isRaymarchingFractal } from '@/lib/geometry/registry'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { DEFAULT_FACE_PBR } from '@/stores/defaults/visualDefaults'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore'
import { usePBRStore, type PBRSlice } from '@/stores/pbrStore'
import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ColorAlgorithmSelector } from './ColorAlgorithmSelector'
import { ColorPreview } from './ColorPreview'
import { CosineGradientEditor } from './CosineGradientEditor'
import { DistributionControls } from './DistributionControls'
import { LchPresetSelector } from './LchPresetSelector'
import { PresetSelector } from './PresetSelector'

/** Algorithms that use the cosine palette (preset selector + advanced editor) */
const USES_COSINE_PALETTE = new Set(['cosine', 'normal', 'distance', 'radial', 'multiSource'])

/** Algorithms that use distribution controls (power, cycles, offset) */
const USES_DISTRIBUTION = new Set([
  'monochromatic',
  'analogous',
  'cosine',
  'normal',
  'distance',
  'lch',
  'multiSource',
  'radial',
])

/** Algorithms that use the base/face color (HSL-based) */
const USES_BASE_COLOR = new Set(['monochromatic', 'analogous', 'phase', 'mixed'])

export interface FacesSectionProps {
  defaultOpen?: boolean
}

type FacesTabId = 'colors' | 'material'

export const FacesSection: React.FC<FacesSectionProps> = React.memo(({ defaultOpen = false }) => {
  const [activeTab, setActiveTab] = React.useState<FacesTabId>('colors')

  // Get object type and dimension to check rendering mode
  const { objectType, dimension } = useGeometryStore(
    useShallow((state) => ({
      objectType: state.objectType,
      dimension: state.dimension,
    }))
  )

  // Raymarching objects (schroedinger) are always fully opaque
  const isRaymarchingFractalType = isRaymarchingFractal(objectType, dimension)

  // Check if isosurface mode is active (PBR material only applies to isosurface, not volumetric)
  const isoEnabled = useExtendedObjectStore(
    (state: ExtendedObjectState) => state.schroedinger?.isoEnabled ?? false
  )

  // Appearance settings
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    colorAlgorithm: state.colorAlgorithm,
    faceColor: state.faceColor,
    setFaceColor: state.setFaceColor,
    shaderSettings: state.shaderSettings,
    setSurfaceSettings: state.setSurfaceSettings,
    lchLightness: state.lchLightness,
    setLchLightness: state.setLchLightness,
    lchChroma: state.lchChroma,
    setLchChroma: state.setLchChroma,
    shaderType: state.shaderType,
  }))
  const {
    colorAlgorithm,
    faceColor,
    setFaceColor,
    shaderSettings,
    setSurfaceSettings,
    lchLightness,
    setLchLightness,
    lchChroma,
    setLchChroma,
    shaderType,
  } = useAppearanceStore(appearanceSelector)

  // Lighting settings
  const lightingSelector = useShallow((state: LightingSlice) => ({
    lightEnabled: state.lightEnabled,
  }))
  const { lightEnabled } = useLightingStore(lightingSelector)

  // PBR settings for faces (from dedicated PBR store)
  const pbrSelector = useShallow((state: PBRSlice) => ({
    roughness: state.face.roughness,
    metallic: state.face.metallic,
    specularIntensity: state.face.specularIntensity,
    specularColor: state.face.specularColor,
    setRoughness: state.setFaceRoughness,
    setMetallic: state.setFaceMetallic,
    setSpecularIntensity: state.setFaceSpecularIntensity,
    setSpecularColor: state.setFaceSpecularColor,
  }))
  const {
    roughness,
    metallic,
    specularIntensity,
    specularColor,
    setRoughness,
    setMetallic,
    setSpecularIntensity,
    setSpecularColor,
  } = usePBRStore(pbrSelector)

  const surfaceSettings = shaderSettings.surface

  // Check if lighting controls should be shown
  const showLightingControls = shaderType === 'surface' && lightEnabled

  const handleTabChange = useCallback((id: string) => {
    setActiveTab(id as FacesTabId)
  }, [])

  const handleFaceOpacityChange = useCallback(
    (value: number) => {
      setSurfaceSettings({ faceOpacity: value })
    },
    [setSurfaceSettings]
  )

  // Material tab only available in isosurface mode (PBR has no effect on volumetric clouds)
  const showMaterialTab = isoEnabled

  // Reset to colors tab if material tab disappears while selected
  React.useEffect(() => {
    if (!showMaterialTab && activeTab === 'material') {
      setActiveTab('colors')
    }
  }, [showMaterialTab, activeTab])

  const tabs = useMemo(
    () => [
      {
        id: 'colors' as const,
        label: 'Colors',
        content: (
          <ColorsTabContent
            colorAlgorithm={colorAlgorithm}
            faceColor={faceColor}
            setFaceColor={setFaceColor}
            lchLightness={lchLightness}
            setLchLightness={setLchLightness}
            lchChroma={lchChroma}
            setLchChroma={setLchChroma}
          />
        ),
      },
      ...(showMaterialTab
        ? [
            {
              id: 'material' as const,
              label: 'Material',
              content: (
                <MaterialTabContent
                  faceOpacity={surfaceSettings.faceOpacity}
                  setFaceOpacity={handleFaceOpacityChange}
                  showLightingControls={showLightingControls}
                  specularColor={specularColor}
                  setSpecularColor={setSpecularColor}
                  specularIntensity={specularIntensity}
                  setSpecularIntensity={setSpecularIntensity}
                  roughness={roughness}
                  setRoughness={setRoughness}
                  metallic={metallic}
                  setMetallic={setMetallic}
                  hideOpacity={false}
                />
              ),
            },
          ]
        : []),
    ],
    [
      colorAlgorithm,
      faceColor,
      setFaceColor,
      lchLightness,
      setLchLightness,
      lchChroma,
      setLchChroma,
      showMaterialTab,
      surfaceSettings.faceOpacity,
      handleFaceOpacityChange,
      showLightingControls,
      specularColor,
      setSpecularColor,
      specularIntensity,
      setSpecularIntensity,
      roughness,
      setRoughness,
      metallic,
      setMetallic,
    ]
  )

  return (
    <Section title="Faces" defaultOpen={defaultOpen} data-testid="section-faces">
      <div className="transition-opacity duration-300">
        <Tabs
          tabs={tabs}
          value={activeTab}
          onChange={handleTabChange}
          tabListClassName="mb-4"
          data-testid="faces-tabs"
        />
      </div>
    </Section>
  )
})

FacesSection.displayName = 'FacesSection'

// =============================================================================
// Colors Tab Content
// =============================================================================

interface ColorsTabContentProps {
  colorAlgorithm: string
  faceColor: string
  setFaceColor: (color: string) => void
  lchLightness: number
  setLchLightness: (value: number) => void
  lchChroma: number
  setLchChroma: (value: number) => void
}

const ColorsTabContent: React.FC<ColorsTabContentProps> = React.memo(
  ({
    colorAlgorithm,
    faceColor,
    setFaceColor,
    lchLightness,
    setLchLightness,
    lchChroma,
    setLchChroma,
  }) => {
    return (
      <div className="space-y-4">
        {/* Color Algorithm Selection */}
        <ColorAlgorithmSelector />

        {/* Live Preview */}
        <ColorPreview />

        {/* Base color picker (HSL-based algorithms) */}
        {USES_BASE_COLOR.has(colorAlgorithm) && (
          <ColorPicker
            label="Base Color"
            value={faceColor}
            onChange={setFaceColor}
            disableAlpha={true}
          />
        )}

        {/* Cosine palette controls (preset + advanced editor) */}
        {USES_COSINE_PALETTE.has(colorAlgorithm) && (
          <>
            <PresetSelector />
            <CosineGradientEditor />
          </>
        )}

        {/* LCH perceptual color controls */}
        {colorAlgorithm === 'lch' && (
          <>
            <LchPresetSelector />
            <Slider
              label="Lightness"
              min={0.1}
              max={1}
              step={0.01}
              value={lchLightness}
              onChange={setLchLightness}
              showValue
            />
            <Slider
              label="Chroma"
              min={0}
              max={0.4}
              step={0.01}
              value={lchChroma}
              onChange={setLchChroma}
              showValue
            />
          </>
        )}

        {/* Multi-source weight editor */}
        {colorAlgorithm === 'multiSource' && <MultiSourceWeightsEditor />}

        {/* Distribution controls (power, cycles, offset) */}
        {USES_DISTRIBUTION.has(colorAlgorithm) && <DistributionControls />}
      </div>
    )
  }
)

ColorsTabContent.displayName = 'ColorsTabContent'

// =============================================================================
// Material Tab Content
// =============================================================================

interface MaterialTabContentProps {
  faceOpacity: number
  setFaceOpacity: (value: number) => void
  showLightingControls: boolean
  specularColor: string
  setSpecularColor: (color: string) => void
  specularIntensity: number
  setSpecularIntensity: (value: number) => void
  roughness: number
  setRoughness: (value: number) => void
  metallic: number
  setMetallic: (value: number) => void
  // Hide opacity controls for raymarching fractals (always fully opaque)
  hideOpacity?: boolean
}

const MaterialTabContent: React.FC<MaterialTabContentProps> = React.memo(
  ({
    faceOpacity,
    setFaceOpacity,
    showLightingControls,
    specularColor,
    setSpecularColor,
    specularIntensity,
    setSpecularIntensity,
    roughness,
    setRoughness,
    metallic,
    setMetallic,
    hideOpacity = false,
  }) => {
    const handleResetSpecularColor = useCallback(() => {
      setSpecularColor(DEFAULT_FACE_PBR.specularColor)
    }, [setSpecularColor])

    return (
      <div className="space-y-4">
        {/* Face Opacity - Hidden for raymarching fractals (always fully opaque) */}
        {!hideOpacity && (
          <Slider
            label="Opacity"
            min={0}
            max={1}
            step={0.1}
            value={faceOpacity}
            onChange={setFaceOpacity}
            showValue
            data-testid="slider-face-opacity"
          />
        )}

        {/* PBR Material - Only when lighting is enabled */}
        {showLightingControls && (
          <div>
            {/* Metallic */}
            <Slider
              label="Metallic"
              min={0}
              max={1}
              step={0.05}
              value={metallic}
              onChange={setMetallic}
              showValue
              tooltip="0 = dielectric (plastic, wood), 1 = metal (gold, chrome)"
              data-testid="slider-metallic"
            />

            {/* Roughness (GGX PBR) */}
            <Slider
              label="Roughness"
              min={0}
              max={1}
              step={0.05}
              value={roughness}
              onChange={setRoughness}
              showValue
              tooltip="Surface roughness (0 = mirror, 1 = matte)"
              data-testid="slider-roughness"
            />

            <div className="h-px bg-[var(--bg-hover)] my-2" />

            {/* Specular Intensity */}
            <Slider
              label="Specular Intensity"
              min={0}
              max={2}
              step={0.1}
              value={specularIntensity}
              onChange={setSpecularIntensity}
              showValue
              tooltip="Artistic multiplier for specular highlights"
            />

            {/* Specular Color */}
            <div className="flex items-center justify-between">
              <ColorPicker
                label="Specular Color"
                value={specularColor}
                onChange={setSpecularColor}
                disableAlpha={true}
              />
              {specularColor !== DEFAULT_FACE_PBR.specularColor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetSpecularColor}
                  ariaLabel="Reset to default"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        )}

        {!showLightingControls && (
          <div className="p-4 rounded-lg bg-[var(--bg-hover)] border border-border-subtle border-dashed text-center">
            <p className="text-xs text-text-secondary italic">
              Enable lighting in the Visual section to access PBR material settings.
            </p>
          </div>
        )}
      </div>
    )
  }
)

MaterialTabContent.displayName = 'MaterialTabContent'

// =============================================================================
// Multi-Source Weights Editor
// =============================================================================

/**
 * Multi-Source Weights Editor for multiSource algorithm
 * @returns The weights editor component
 */
const MultiSourceWeightsEditor: React.FC = React.memo(() => {
  const { multiSourceWeights, setMultiSourceWeights } = useAppearanceStore(
    useShallow((state) => ({
      multiSourceWeights: state.multiSourceWeights,
      setMultiSourceWeights: state.setMultiSourceWeights,
    }))
  )

  const handleDepthChange = useCallback(
    (value: number) => {
      setMultiSourceWeights({ depth: value })
    },
    [setMultiSourceWeights]
  )

  const handleOrbitTrapChange = useCallback(
    (value: number) => {
      setMultiSourceWeights({ orbitTrap: value })
    },
    [setMultiSourceWeights]
  )

  const handleNormalChange = useCallback(
    (value: number) => {
      setMultiSourceWeights({ normal: value })
    },
    [setMultiSourceWeights]
  )

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary">Source Weights</div>

      <Slider
        label="Depth"
        min={0}
        max={1}
        step={0.1}
        value={multiSourceWeights.depth}
        onChange={handleDepthChange}
        showValue
        tooltip="Weight for depth/iteration-based coloring"
      />

      <Slider
        label="Orbit Trap"
        min={0}
        max={1}
        step={0.1}
        value={multiSourceWeights.orbitTrap}
        onChange={handleOrbitTrapChange}
        showValue
        tooltip="Weight for orbit trap coloring (fractals)"
      />

      <Slider
        label="Normal"
        min={0}
        max={1}
        step={0.1}
        value={multiSourceWeights.normal}
        onChange={handleNormalChange}
        showValue
        tooltip="Weight for normal direction-based coloring"
      />
    </div>
  )
})

MultiSourceWeightsEditor.displayName = 'MultiSourceWeightsEditor'
