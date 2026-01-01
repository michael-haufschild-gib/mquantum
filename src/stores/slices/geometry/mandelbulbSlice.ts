import {
  DEFAULT_MANDELBROT_CONFIG,
  MANDELBROT_QUALITY_PRESETS,
  MandelbulbColorMode,
} from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, MandelbulbSlice } from './types'

export const createMandelbulbSlice: StateCreator<ExtendedObjectSlice, [], [], MandelbulbSlice> = (
  set,
  get
) => {
  /**
   * Wrapped setter that auto-increments mandelbulbVersion on any mandelbulb change.
   * This avoids manually adding version increment to 40+ individual setters.
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      if ('mandelbulb' in update) {
        return { ...update, mandelbulbVersion: state.mandelbulbVersion + 1 }
      }
      return update
    })
  }

  return {
  mandelbulb: { ...DEFAULT_MANDELBROT_CONFIG },

  setMandelbulbMaxIterations: (value) => {
    const clampedValue = Math.max(10, Math.min(500, Math.floor(value)))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, maxIterations: clampedValue },
    }))
  },

  setMandelbulbEscapeRadius: (value) => {
    // Extended range to 16 for higher-dimensional Mandelbulb stability
    const clampedValue = Math.max(2.0, Math.min(16.0, value))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, escapeRadius: clampedValue },
    }))
  },

  setMandelbulbQualityPreset: (preset) => {
    const settings = MANDELBROT_QUALITY_PRESETS[preset]
    setWithVersion((state) => ({
      mandelbulb: {
        ...state.mandelbulb,
        qualityPreset: preset,
        maxIterations: settings.maxIterations,
        resolution: settings.resolution,
      },
    }))
  },

  setMandelbulbResolution: (value) => {
    // Valid resolutions: 16, 24, 32, 48, 64, 96, 128
    const validResolutions = [16, 24, 32, 48, 64, 96, 128]
    const closest = validResolutions.reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    )
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, resolution: closest },
    }))
  },

  setMandelbulbVisualizationAxes: (axes) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, visualizationAxes: axes },
    }))
  },

  setMandelbulbVisualizationAxis: (index, dimIndex) => {
    // Validate dimIndex to valid range [0, MAX_DIMENSION-1]
    // MAX_DIMENSION is 11, so valid indices are 0-10 (representing X through 11th axis)
    const clampedDimIndex = Math.max(0, Math.min(10, Math.floor(dimIndex)))
    const current = [...get().mandelbulb.visualizationAxes] as [number, number, number]
    current[index] = clampedDimIndex
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, visualizationAxes: current },
    }))
  },

  setMandelbulbParameterValue: (dimIndex, value) => {
    const values = [...get().mandelbulb.parameterValues]
    // Validate dimIndex to prevent sparse arrays or out-of-bounds access
    if (dimIndex < 0 || dimIndex >= values.length) {
      if (import.meta.env.DEV) {
        console.warn(
          `setMandelbulbParameterValue: Invalid dimension index ${dimIndex} (valid range: 0-${values.length - 1})`
        )
      }
      return
    }
    // Clamp to reasonable range for Mandelbulb exploration
    const clampedValue = Math.max(-2.0, Math.min(2.0, value))
    values[dimIndex] = clampedValue
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, parameterValues: values },
    }))
  },

  setMandelbulbParameterValues: (values) => {
    const clampedValues = values.map((v) => Math.max(-2.0, Math.min(2.0, v)))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, parameterValues: clampedValues },
    }))
  },

  resetMandelbulbParameters: () => {
    const len = get().mandelbulb.parameterValues.length
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, parameterValues: new Array(len).fill(0) },
    }))
  },

  setMandelbulbCenter: (center) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, center },
    }))
  },

  setMandelbulbExtent: (extent) => {
    const clampedExtent = Math.max(0.001, Math.min(10.0, extent))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, extent: clampedExtent },
    }))
  },

  fitMandelbulbToView: () => {
    const centerLen = get().mandelbulb.center.length
    setWithVersion((state) => ({
      mandelbulb: {
        ...state.mandelbulb,
        center: new Array(centerLen).fill(0),
        extent: 2.5,
      },
    }))
  },

  setMandelbulbColorMode: (mode) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, colorMode: mode },
    }))
  },

  setMandelbulbPalette: (palette) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, palette },
    }))
  },

  setMandelbulbCustomPalette: (palette) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, customPalette: palette },
    }))
  },

  setMandelbulbInvertColors: (invert) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, invertColors: invert },
    }))
  },

  setMandelbulbInteriorColor: (color) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, interiorColor: color },
    }))
  },

  setMandelbulbPaletteCycles: (cycles) => {
    const clampedCycles = Math.max(1, Math.min(20, Math.floor(cycles)))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, paletteCycles: clampedCycles },
    }))
  },

  setMandelbulbRenderStyle: (style) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, renderStyle: style },
    }))
  },

  setMandelbulbPointSize: (size) => {
    const clampedSize = Math.max(1, Math.min(20, size))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, pointSize: clampedSize },
    }))
  },

  setMandelbulbBoundaryThreshold: (threshold) => {
    // Clamp values to [0, 1] and ensure min <= max
    const [min, max] = threshold
    const clampedMin = Math.max(0, Math.min(1, min))
    const clampedMax = Math.max(clampedMin, Math.min(1, max))
    setWithVersion((state) => ({
      mandelbulb: {
        ...state.mandelbulb,
        boundaryThreshold: [clampedMin, clampedMax],
      },
    }))
  },

  setMandelbulbMandelbulbPower: (power) => {
    // Clamp power to reasonable range (2-16)
    const clampedPower = Math.max(2, Math.min(16, Math.floor(power)))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, mandelbulbPower: clampedPower },
    }))
  },

  setMandelbulbConfig: (config) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, ...config },
    }))
  },

  initializeMandelbulbForDimension: (dimension) => {
    const paramCount = Math.max(0, dimension - 3)

    // Use boundaryOnly mode to show the fractal surface
    const colorMode: MandelbulbColorMode = 'boundaryOnly'

    // Dimension-specific defaults from mandelbulb guide:
    // - 3D: Mandelbulb with spherical coordinates
    // - 4D+: Mandelbulb with hyperspherical coordinates

    // Escape radius (bailout): Higher dimensions need larger values for stability
    let escapeRadius: number
    if (dimension >= 9) {
      escapeRadius = 12.0 // 9D-11D: highest bailout for stability
    } else if (dimension >= 7) {
      escapeRadius = 10.0 // 7D-8D: high bailout
    } else if (dimension >= 4) {
      escapeRadius = 8.0 // 4D-6D: moderate bailout
    } else {
      escapeRadius = 4.0 // 3D: standard bailout
    }

    // Max iterations: Performance-aware defaults for raymarching
    // Higher dimensions need more conservative values due to computational cost
    let maxIterations: number
    if (dimension >= 9) {
      maxIterations = 35 // 9D-11D: very conservative
    } else if (dimension >= 7) {
      maxIterations = 40 // 7D-8D: conservative
    } else if (dimension >= 4) {
      maxIterations = 50 // 4D-6D: moderate
    } else {
      maxIterations = 80 // 3D Mandelbulb: good quality
    }

    // Power: 8 for Mandelbulb/Mandelbulb
    const power = 8

    // Extent: Guide suggests [-2,2] for 4D+, smaller for 3D Mandelbulb
    // 3D Mandelbulb: lives roughly within |x|,|y|,|z| < 1.2, so extent 1.5 is good
    // 4D+ Mandelbulb: extent 2.0 for exploration
    const extent = dimension === 3 ? 1.5 : 2.0

    // Center at origin for all dimensions
    const center = new Array(dimension).fill(0)

    setWithVersion((state) => ({
      mandelbulb: {
        ...state.mandelbulb,
        parameterValues: new Array(paramCount).fill(0),
        center,
        visualizationAxes: [0, 1, 2],
        colorMode,
        extent,
        scale: 1.0,
        escapeRadius,
        mandelbulbPower: power,
        maxIterations,
      },
    }))
  },

  getMandelbulbConfig: () => {
    return { ...get().mandelbulb }
  },

  setMandelbulbScale: (scale) => {
    // Range 0.1 to 10.0
    const clampedScale = Math.max(0.1, Math.min(10.0, scale))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, scale: clampedScale },
    }))
  },

  // --- Power Animation Actions (Mandelbulb-specific) ---
  setMandelbulbPowerAnimationEnabled: (enabled) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, powerAnimationEnabled: enabled },
    }))
  },

  setMandelbulbPowerMin: (min) => {
    // Range 2.0 to 16.0 (expanded for more variety)
    const clampedMin = Math.max(2.0, Math.min(16.0, min))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, powerMin: clampedMin },
    }))
  },

  setMandelbulbPowerMax: (max) => {
    // Range 3.0 to 24.0 (expanded for more variety)
    const clampedMax = Math.max(3.0, Math.min(24.0, max))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, powerMax: clampedMax },
    }))
  },

  setMandelbulbPowerSpeed: (speed) => {
    // Range 0.01 to 0.2 (very slow for organic wandering)
    const clampedSpeed = Math.max(0.01, Math.min(0.2, speed))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, powerSpeed: clampedSpeed },
    }))
  },

  // --- Alternate Power Actions (Technique B variant) ---
  setMandelbulbAlternatePowerEnabled: (enabled) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, alternatePowerEnabled: enabled },
    }))
  },

  setMandelbulbAlternatePowerValue: (power) => {
    // Range 2.0 to 16.0
    const clampedPower = Math.max(2.0, Math.min(16.0, power))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, alternatePowerValue: clampedPower },
    }))
  },

  setMandelbulbAlternatePowerBlend: (blend) => {
    // Range 0.0 to 1.0
    const clampedBlend = Math.max(0.0, Math.min(1.0, blend))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, alternatePowerBlend: clampedBlend },
    }))
  },

  // --- Slice Animation Actions (4D+ only) ---
  setMandelbulbSliceAnimationEnabled: (enabled) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sliceAnimationEnabled: enabled },
    }))
  },

  setMandelbulbSliceSpeed: (speed) => {
    // Range 0.01 to 0.1
    const clampedSpeed = Math.max(0.01, Math.min(0.1, speed))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sliceSpeed: clampedSpeed },
    }))
  },

  setMandelbulbSliceAmplitude: (amplitude) => {
    // Range 0.1 to 1.0
    const clampedAmplitude = Math.max(0.1, Math.min(1.0, amplitude))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sliceAmplitude: clampedAmplitude },
    }))
  },

  // --- Angular Phase Shifts Actions ---
  setMandelbulbPhaseShiftEnabled: (enabled) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, phaseShiftEnabled: enabled },
    }))
  },

  setMandelbulbPhaseSpeed: (speed) => {
    // Range 0.01 to 0.2
    const clampedSpeed = Math.max(0.01, Math.min(0.2, speed))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, phaseSpeed: clampedSpeed },
    }))
  },

  setMandelbulbPhaseAmplitude: (amplitude) => {
    // Range 0.0 to PI/4 (~0.785)
    const clampedAmplitude = Math.max(0.0, Math.min(Math.PI / 4, amplitude))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, phaseAmplitude: clampedAmplitude },
    }))
  },

  // --- Advanced Rendering Actions ---
  setMandelbulbRoughness: (value) => {
    const clamped = Math.max(0.0, Math.min(1.0, value))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, roughness: clamped },
    }))
  },

  setMandelbulbSssEnabled: (value) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sssEnabled: value },
    }))
  },

  setMandelbulbSssIntensity: (value) => {
    const clamped = Math.max(0.0, Math.min(2.0, value))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sssIntensity: clamped },
    }))
  },

  setMandelbulbSssColor: (value) => {
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sssColor: value },
    }))
  },

  setMandelbulbSssThickness: (value) => {
    const clamped = Math.max(0.1, Math.min(5.0, value))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sssThickness: clamped },
    }))
  },

  // --- SDF Render Quality Actions ---
  setMandelbulbSdfMaxIterations: (value) => {
    // Range 5-100, clamped to integer
    const clamped = Math.max(5, Math.min(100, Math.floor(value)))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sdfMaxIterations: clamped },
    }))
  },

  setMandelbulbSdfSurfaceDistance: (value) => {
    // Range 0.00005-0.01
    const clamped = Math.max(0.00005, Math.min(0.01, value))
    setWithVersion((state) => ({
      mandelbulb: { ...state.mandelbulb, sdfSurfaceDistance: clamped },
    }))
  },
}}
