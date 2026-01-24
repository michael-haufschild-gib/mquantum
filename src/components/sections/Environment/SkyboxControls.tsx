/**
 * Skybox Controls - Main orchestration component
 *
 * Combines:
 * - Skybox selection grid (all modes)
 * - Shared classic controls (texture-based skyboxes)
 * - Shared procedural controls (all procedural modes)
 * - Mode-specific controls (Starfield, Aurora, Horizon)
 */
import { SkyboxSelection } from '@/stores/defaults/visualDefaults'
import { useEnvironmentStore, type EnvironmentStore } from '@/stores/environmentStore'
import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AuroraControls } from './skybox/AuroraControls'
import { HorizonControls } from './skybox/HorizonControls'
import { OceanControls } from './skybox/OceanControls'
import { SkyboxSharedClassicControls } from './skybox/SkyboxSharedClassicControls'
import { SkyboxSharedProceduralControls } from './skybox/SkyboxSharedProceduralControls'

// Import thumbnails
import spaceBlueThumb from '@/assets/skyboxes/space_blue/thumbnail.png'
import spaceLightBlueThumb from '@/assets/skyboxes/space_lightblue/thumbnail.png'
import spaceRedThumb from '@/assets/skyboxes/space_red/thumbnail.png'

interface SkyboxOption {
  id: SkyboxSelection
  name: string
  thumbnail: string | null
  gradientClass: string | null
  description: string
  type: 'none' | 'classic' | 'procedural'
}

const ALL_SKYBOX_OPTIONS: SkyboxOption[] = [
  // No skybox
  {
    id: 'none',
    name: 'None',
    thumbnail: null,
    gradientClass: 'bg-black',
    description: 'No skybox',
    type: 'none',
  },
  // Classic textures
  {
    id: 'space_blue',
    name: 'Deep Space',
    thumbnail: spaceBlueThumb,
    gradientClass: null,
    description: 'Cold, deep space environment',
    type: 'classic',
  },
  {
    id: 'space_lightblue',
    name: 'Nebula',
    thumbnail: spaceLightBlueThumb,
    gradientClass: null,
    description: 'Bright nebula with stars',
    type: 'classic',
  },
  {
    id: 'space_red',
    name: 'Red Giant',
    thumbnail: spaceRedThumb,
    gradientClass: null,
    description: 'Warm, intense red space',
    type: 'classic',
  },
  // Original procedural
  {
    id: 'procedural_aurora',
    name: 'Aurora',
    thumbnail: null,
    gradientClass: 'bg-gradient-to-b from-cyan-400 via-emerald-600 to-slate-900',
    description: 'Northern lights effect',
    type: 'procedural',
  },
  {
    id: 'procedural_nebula',
    name: 'Cosmic Nebula',
    thumbnail: null,
    gradientClass: 'bg-gradient-to-br from-purple-500 via-fuchsia-600 to-slate-900',
    description: 'Volumetric clouds',
    type: 'procedural',
  },
  // Premium procedural skyboxes
  {
    id: 'procedural_crystalline',
    name: 'Crystalline',
    thumbnail: null,
    gradientClass:
      'bg-[conic-gradient(from_45deg,_#0ea5e9_0%,_#8b5cf6_25%,_#ec4899_50%,_#0ea5e9_75%,_#8b5cf6_100%)]',
    description: 'Geometric Voronoi patterns with iridescence',
    type: 'procedural',
  },
  {
    id: 'procedural_horizon',
    name: 'Horizon',
    thumbnail: null,
    gradientClass: 'bg-gradient-to-b from-slate-900 via-slate-700 to-slate-400',
    description: 'Cinematic studio gradient',
    type: 'procedural',
  },
  {
    id: 'procedural_ocean',
    name: 'Deep Ocean',
    thumbnail: null,
    gradientClass: 'bg-gradient-to-b from-cyan-300 via-blue-600 to-slate-900',
    description: 'Underwater atmosphere with caustics',
    type: 'procedural',
  },
  {
    id: 'procedural_twilight',
    name: 'Twilight',
    thumbnail: null,
    gradientClass: 'bg-gradient-to-b from-amber-400 via-rose-500 to-indigo-900',
    description: 'Sunset gradient with atmosphere',
    type: 'procedural',
  },
]

export const SkyboxControls: React.FC = React.memo(() => {
  const environmentSelector = useShallow((state: EnvironmentStore) => ({
    skyboxSelection: state.skyboxSelection,
    skyboxIntensity: state.skyboxIntensity,
    skyboxAnimationMode: state.skyboxAnimationMode,
    skyboxAnimationSpeed: state.skyboxAnimationSpeed,
    skyboxHighQuality: state.skyboxHighQuality,
    proceduralSettings: state.proceduralSettings,
    setSkyboxSelection: state.setSkyboxSelection,
    setSkyboxIntensity: state.setSkyboxIntensity,
    setSkyboxAnimationMode: state.setSkyboxAnimationMode,
    setSkyboxAnimationSpeed: state.setSkyboxAnimationSpeed,
    setSkyboxHighQuality: state.setSkyboxHighQuality,
    setProceduralSettings: state.setProceduralSettings,
  }))
  const {
    skyboxSelection,
    skyboxIntensity,
    skyboxAnimationMode,
    skyboxAnimationSpeed,
    skyboxHighQuality,
    proceduralSettings,
    setSkyboxSelection,
    setSkyboxIntensity,
    setSkyboxAnimationMode,
    setSkyboxAnimationSpeed,
    setSkyboxHighQuality,
    setProceduralSettings,
  } = useEnvironmentStore(environmentSelector)

  const selectedOption = useMemo(
    () => ALL_SKYBOX_OPTIONS.find((opt) => opt.id === skyboxSelection),
    [skyboxSelection]
  )
  const isClassicMode = selectedOption?.type === 'classic'
  const isProceduralMode = selectedOption?.type === 'procedural'
  const isAuroraMode = skyboxSelection === 'procedural_aurora'
  const isCrystallineMode = skyboxSelection === 'procedural_crystalline'
  const isTwilightMode = skyboxSelection === 'procedural_twilight'
  const isHorizonMode = skyboxSelection === 'procedural_horizon'
  const isOceanMode = skyboxSelection === 'procedural_ocean'
  const hasControls = skyboxSelection !== 'none'
  // Aurora, crystalline, and twilight don't use complexity
  const hideComplexity = isAuroraMode || isCrystallineMode || isTwilightMode

  const handleSkyboxSelect = useCallback(
    (id: SkyboxSelection) => {
      setSkyboxSelection(id)
    },
    [setSkyboxSelection]
  )

  return (
    <div className="space-y-6">
      {/* Unified thumbnail grid */}
      <div className="grid grid-cols-3 gap-3">
        {ALL_SKYBOX_OPTIONS.map((option) => {
          const isSelected = skyboxSelection === option.id
          return (
            <button
              key={option.id}
              data-testid={`skybox-option-${option.id}`}
              onClick={() => handleSkyboxSelect(option.id)}
              className={`
                group relative aspect-square rounded-xl overflow-hidden border-2 transition-[transform,border-color] duration-200 ease-out
                hover:scale-105 hover:shadow-lg
                ${
                  isSelected
                    ? 'border-accent-primary ring-1 ring-accent-primary/50 shadow-md'
                    : 'border-panel-border hover:border-text-primary/30'
                }
              `}
              title={option.description}
            >
              {/* Thumbnail content - either image or gradient */}
              {option.thumbnail ? (
                <img
                  src={option.thumbnail}
                  alt={option.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div
                  className={`w-full h-full ${option.gradientClass} transition-transform duration-500 group-hover:scale-110`}
                />
              )}

              {/* Label overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-1 bg-[var(--bg-overlay)] text-center backdrop-blur-sm">
                <span className="text-[10px] font-medium text-white block">{option.name}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Mode-specific controls */}
      {hasControls && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-5">
          {/* Classic Mode Controls */}
          {isClassicMode && (
            <SkyboxSharedClassicControls
              skyboxIntensity={skyboxIntensity}
              skyboxAnimationMode={skyboxAnimationMode}
              skyboxAnimationSpeed={skyboxAnimationSpeed}
              skyboxHighQuality={skyboxHighQuality}
              proceduralSettings={proceduralSettings}
              setSkyboxIntensity={setSkyboxIntensity}
              setSkyboxAnimationMode={setSkyboxAnimationMode}
              setSkyboxAnimationSpeed={setSkyboxAnimationSpeed}
              setSkyboxHighQuality={setSkyboxHighQuality}
              setProceduralSettings={setProceduralSettings}
            />
          )}

          {/* Procedural Mode Controls */}
          {isProceduralMode && (
            <>
              <SkyboxSharedProceduralControls
                proceduralSettings={proceduralSettings}
                skyboxIntensity={skyboxIntensity}
                setProceduralSettings={setProceduralSettings}
                setSkyboxIntensity={setSkyboxIntensity}
                hideComplexity={hideComplexity}
              />

              {/* Mode-specific controls */}
              {isAuroraMode && (
                <AuroraControls
                  proceduralSettings={proceduralSettings}
                  setProceduralSettings={setProceduralSettings}
                />
              )}

              {isHorizonMode && (
                <HorizonControls
                  proceduralSettings={proceduralSettings}
                  setProceduralSettings={setProceduralSettings}
                />
              )}

              {isOceanMode && (
                <OceanControls
                  proceduralSettings={proceduralSettings}
                  setProceduralSettings={setProceduralSettings}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
})

SkyboxControls.displayName = 'SkyboxControls'
