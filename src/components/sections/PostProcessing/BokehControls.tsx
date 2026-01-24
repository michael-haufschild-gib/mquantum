/**
 * BokehControls Component
 *
 * UI controls for managing bokeh (depth of field) post-processing effects.
 * Uses @react-three/postprocessing DepthOfField and Autofocus components.
 *
 * Controls:
 * - Enable/Disable toggle: Turns bokeh effect on/off
 * - Focus Mode: Auto (Center), Auto (Mouse), or Manual
 * - Focus Distance: World units distance to focus point (manual mode only)
 * - Focus Range: Depth of field range in world units
 * - Blur Intensity: Bokeh scale/strength
 * - Focus Speed: Smooth time for autofocus transitions
 * - Show Focus Point: Debug visualization toggle
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name for styling
 *
 * @returns UI controls for bokeh post-processing
 *
 * @see {@link PostProcessing} for the bokeh effect implementation
 * @see {@link usePostProcessingStore} for state management
 * @see docs/prd/bokeh-postprocessing-refactor.md
 */

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { type BokehBlurMethod, type BokehFocusMode } from '@/stores/defaults/visualDefaults'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface BokehControlsProps {
  className?: string
}

/** Focus mode options for the dropdown */
const FOCUS_MODE_OPTIONS = [
  { value: 'auto-center' as const, label: 'Auto (Center)' },
  { value: 'auto-mouse' as const, label: 'Auto (Mouse)' },
  { value: 'manual' as const, label: 'Manual' },
]

/** Blur method options for the dropdown */
const BLUR_METHOD_OPTIONS = [
  { value: 'disc' as const, label: 'Disc (Basic)' },
  { value: 'jittered' as const, label: 'Jittered (Smooth)' },
  { value: 'separable' as const, label: 'Separable (Fast)' },
  { value: 'hexagonal' as const, label: 'Hexagonal (Cinematic)' },
]

/**
 * BokehControls component that provides UI for adjusting bokeh/depth of field settings.
 * @param root0 - Component props
 * @param root0.className - Optional CSS class name
 */
export const BokehControls: React.FC<BokehControlsProps> = React.memo(({ className = '' }) => {
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    // State
    bokehFocusMode: state.bokehFocusMode,
    bokehBlurMethod: state.bokehBlurMethod,
    bokehWorldFocusDistance: state.bokehWorldFocusDistance,
    bokehWorldFocusRange: state.bokehWorldFocusRange,
    bokehScale: state.bokehScale,
    bokehSmoothTime: state.bokehSmoothTime,
    bokehShowDebug: state.bokehShowDebug,
    // Actions
    setBokehFocusMode: state.setBokehFocusMode,
    setBokehBlurMethod: state.setBokehBlurMethod,
    setBokehWorldFocusDistance: state.setBokehWorldFocusDistance,
    setBokehWorldFocusRange: state.setBokehWorldFocusRange,
    setBokehScale: state.setBokehScale,
    setBokehSmoothTime: state.setBokehSmoothTime,
    setBokehShowDebug: state.setBokehShowDebug,
  }))
  const {
    bokehFocusMode,
    bokehBlurMethod,
    bokehWorldFocusDistance,
    bokehWorldFocusRange,
    bokehScale,
    bokehSmoothTime,
    bokehShowDebug,
    setBokehFocusMode,
    setBokehBlurMethod,
    setBokehWorldFocusDistance,
    setBokehWorldFocusRange,
    setBokehScale,
    setBokehSmoothTime,
    setBokehShowDebug,
  } = usePostProcessingStore(postProcessingSelector)

  const isManualMode = bokehFocusMode === 'manual'
  const isAutofocusMode = !isManualMode

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Focus Mode Selector */}
      <Select<BokehFocusMode>
        label="Focus Mode"
        options={FOCUS_MODE_OPTIONS}
        value={bokehFocusMode}
        onChange={setBokehFocusMode}
        data-testid="bokeh-focus-mode"
      />

      {/* Blur Method Selector */}
      <Select<BokehBlurMethod>
        label="Blur Method"
        options={BLUR_METHOD_OPTIONS}
        value={bokehBlurMethod}
        onChange={setBokehBlurMethod}
        data-testid="bokeh-blur-method"
      />

      {/* Focus Distance - only shown in manual mode */}
      {isManualMode && (
        <Slider
          label="Focus Distance"
          min={1}
          max={50}
          step={0.5}
          value={bokehWorldFocusDistance}
          onChange={setBokehWorldFocusDistance}
          showValue
        />
      )}

      {/* Focus Range (depth of field) - wider = more in focus */}
      <Slider
        label="Focus Range"
        min={1}
        max={100}
        step={1}
        value={bokehWorldFocusRange}
        onChange={setBokehWorldFocusRange}
        showValue
      />

      {/* Blur Intensity - how blurry out-of-focus areas get */}
      <Slider
        label="Blur Intensity"
        min={0}
        max={3}
        step={0.1}
        value={bokehScale}
        onChange={setBokehScale}
        showValue
      />

      {/* Focus Speed - only shown in autofocus modes */}
      {isAutofocusMode && (
        <Slider
          label="Focus Speed"
          min={0}
          max={2}
          step={0.05}
          value={bokehSmoothTime}
          onChange={setBokehSmoothTime}
          showValue
        />
      )}

      {/* Debug Visualization Toggle */}
      <Switch
        checked={bokehShowDebug}
        onCheckedChange={setBokehShowDebug}
        label="Show Focus Point"
      />
    </div>
  )
})
