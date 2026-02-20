import {
  DEFAULT_SCHROEDINGER_CONFIG,
  type FreeScalarConfig,
  type SchroedingerConfig,
  type TdseConfig,
  RAYMARCH_QUALITY_TO_SAMPLES,
  type RaymarchQuality,
  SCHROEDINGER_QUALITY_PRESETS,
  SchroedingerColorMode,
  SchroedingerPresetName,
  HydrogenNDPresetName,
} from '@/lib/geometry/extended/types'
import { SCHROEDINGER_PALETTE_DEFINITIONS } from '@/lib/geometry/extended/schroedinger/palettes'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { getHydrogenNDPreset } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { StateCreator } from 'zustand'
import { useGeometryStore } from '@/stores/geometryStore'
import { ExtendedObjectSlice, SchroedingerSlice } from './types'

export const createSchroedingerSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  SchroedingerSlice
> = (set, get) => {
  /**
   * Wrapped setter that auto-increments schroedingerVersion when schroedinger state changes.
   * This avoids manually adding version increment to 80+ individual setters.
   * @param updater
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      // If updating schroedinger, also bump version
      if ('schroedinger' in update) {
        return { ...update, schroedingerVersion: state.schroedingerVersion + 1 }
      }
      return update
    })
  }

  // === Setter Factories ===
  // Reduce boilerplate for common setter patterns

  /**
   * Factory for simple value setters (no validation)
   * @param key
   */
  const valueSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K) =>
    (value: (typeof DEFAULT_SCHROEDINGER_CONFIG)[K]) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: value },
      }))
    }

  /**
   * Factory for clamped numeric setters
   * @param key
   * @param min
   * @param max
   */
  const clampedSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K, min: number, max: number) =>
    (value: number) => {
      const clamped = Math.max(min, Math.min(max, value))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: clamped },
      }))
    }

  const normalizePlaneNormal = (normal: [number, number, number]): [number, number, number] => {
    const [x, y, z] = normal
    const length = Math.hypot(x, y, z)
    if (!Number.isFinite(length) || length < 1e-6) {
      return [0, 0, 1]
    }
    return [x / length, y / length, z / length]
  }

  /**
   * Compute the CFL stability limit for the lattice Klein-Gordon field.
   * For a leapfrog integrator the maximum eigenfrequency is:
   *   omega_max^2 = m^2 + sum_i (2/a_i)^2
   * and the stability condition is dt * omega_max < 2, giving:
   *   dt_max = 2 / sqrt(m^2 + sum_i (2/a_i)^2)
   * @param spacing - Lattice spacing per dimension [ax, ay, az]
   * @param latticeDim - Active spatial dimensions (1, 2, or 3)
   * @param mass - Klein-Gordon mass parameter
   */
  const computeCflLimit = (spacing: number[], latticeDim: number, mass: number): number => {
    let sumInvA2 = 0
    for (let i = 0; i < latticeDim; i++) {
      const a = spacing[i]!
      const twoOverA = 2 / a
      sumInvA2 += twoOverA * twoOverA
    }
    const omegaMax = Math.sqrt(mass * mass + sumInvA2)
    return 2 / omegaMax
  }

  /** Maximum total lattice sites for memory budget (~8MB for phi+pi buffers) */
  const MAX_TOTAL_SITES = 1048576

  /**
   * Compute default per-dimension grid size for a given dimensionality.
   * Ensures total sites stays within MAX_TOTAL_SITES budget.
   * @param d - Number of spatial dimensions
   */
  const defaultGridPerDim = (d: number): number => {
    const raw = Math.round(Math.pow(MAX_TOTAL_SITES, 1 / d))
    // Round down to nearest power-of-2 so exact vacuum always has a valid grid size
    const pow2 = 2 ** Math.floor(Math.log2(Math.max(2, raw)))
    return Math.max(2, Math.min(128, pow2))
  }

  /**
   * Resize free scalar arrays to match a new latticeDim, preserving existing values
   * where possible and filling new dimensions with defaults.
   */
  const resizeFreeScalarArrays = (
    prev: FreeScalarConfig,
    newDim: number
  ): Partial<FreeScalarConfig> => {
    const gridDefault = defaultGridPerDim(newDim)
    const needsPow2 = prev.initialCondition === 'vacuumNoise'
    const snapToPow2 = (v: number): number => {
      const log2 = Math.round(Math.log2(v))
      return Math.max(2, Math.min(gridDefault, 2 ** log2))
    }
    const gridSize = Array.from({ length: newDim }, (_, i) => {
      const raw = i < prev.gridSize.length ? Math.min(prev.gridSize[i]!, gridDefault) : gridDefault
      return needsPow2 ? snapToPow2(raw) : raw
    })
    const spacing = Array.from({ length: newDim }, (_, i) =>
      i < prev.spacing.length ? prev.spacing[i]! : 0.1
    )
    const packetCenter = Array.from({ length: newDim }, (_, i) =>
      i < prev.packetCenter.length ? prev.packetCenter[i]! : 0
    )
    const modeK = Array.from({ length: newDim }, (_, i) =>
      i < prev.modeK.length ? prev.modeK[i]! : 0
    )
    const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
      i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
    )
    return { latticeDim: newDim, gridSize, spacing, packetCenter, modeK, slicePositions }
  }

  /** Maximum total TDSE lattice sites — FFT needs power-of-2 per axis */
  const TDSE_MAX_TOTAL_SITES = 262144 // 64^3

  /**
   * Compute default per-dimension grid size for a given TDSE dimensionality.
   * TDSE requires power-of-2 per axis for FFT. Ensures total sites within budget.
   */
  const defaultTdseGridPerDim = (d: number): number => {
    const raw = Math.round(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / d))
    const pow2 = 2 ** Math.floor(Math.log2(Math.max(4, raw)))
    return Math.max(4, Math.min(128, pow2))
  }

  /**
   * Resize TDSE arrays to match a new latticeDim, preserving existing values
   * where possible and filling new dimensions with defaults.
   */
  const resizeTdseArrays = (
    prev: TdseConfig,
    newDim: number
  ): Partial<TdseConfig> => {
    const gridDefault = defaultTdseGridPerDim(newDim)
    const snapToPow2 = (v: number): number => {
      const log2 = Math.round(Math.log2(Math.max(4, v)))
      return Math.max(4, Math.min(gridDefault, 2 ** log2))
    }
    const gridSize = Array.from({ length: newDim }, (_, i) => {
      const raw = i < prev.gridSize.length ? Math.min(prev.gridSize[i]!, gridDefault) : gridDefault
      return snapToPow2(raw)
    })
    const spacing = Array.from({ length: newDim }, (_, i) =>
      i < prev.spacing.length ? prev.spacing[i]! : 0.1
    )
    const packetCenter = Array.from({ length: newDim }, (_, i) =>
      i < prev.packetCenter.length ? prev.packetCenter[i]! : 0
    )
    const packetMomentum = Array.from({ length: newDim }, (_, i) =>
      i < prev.packetMomentum.length ? prev.packetMomentum[i]! : 0
    )
    const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
      i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
    )
    return { latticeDim: newDim, gridSize, spacing, packetCenter, packetMomentum, slicePositions }
  }

  /**
   * Clamp dt to be within [0.001, min(0.1, CFL limit * safety factor)].
   * Uses a 0.9 safety factor to stay well within the stable region.
   * @param dt - Requested time step
   * @param spacing - Lattice spacing
   * @param latticeDim - Active dimensions
   * @param mass - Klein-Gordon mass parameter
   */
  const clampDtWithCfl = (dt: number, spacing: number[], latticeDim: number, mass: number): number => {
    const cflLimit = computeCflLimit(spacing, latticeDim, mass)
    const maxDt = Math.min(0.1, cflLimit * 0.9)
    return Math.max(0.001, Math.min(maxDt, dt))
  }

  const axisToNormal = (axis: 'x' | 'y' | 'z'): [number, number, number] => {
    if (axis === 'x') return [1, 0, 0]
    if (axis === 'y') return [0, 1, 0]
    return [0, 0, 1]
  }

  return {
    schroedinger: { ...DEFAULT_SCHROEDINGER_CONFIG },

    // === Geometry Settings ===
    setSchroedingerScale: (scale) => {
      const clampedScale = Math.max(0.1, Math.min(2.0, scale))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, scale: clampedScale },
      }))
    },

    // === Quality Settings ===
    setSchroedingerQualityPreset: (preset) => {
      const settings = SCHROEDINGER_QUALITY_PRESETS[preset]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          qualityPreset: preset,
          resolution: settings.resolution,
        },
      }))
    },

    setSchroedingerResolution: (value) => {
      const validResolutions = [16, 24, 32, 48, 64, 96, 128]
      const closest = validResolutions.reduce((prev, curr) =>
        Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
      )
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, resolution: closest },
      }))
    },

    // === Visualization Axes ===
    setSchroedingerVisualizationAxes: (axes) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, visualizationAxes: axes },
      }))
    },

    setSchroedingerVisualizationAxis: (index, dimIndex) => {
      const clampedDimIndex = Math.max(0, Math.min(10, Math.floor(dimIndex)))
      const current = [...get().schroedinger.visualizationAxes] as [number, number, number]
      current[index] = clampedDimIndex
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, visualizationAxes: current },
      }))
    },

    // === Slice Parameters ===
    setSchroedingerParameterValue: (dimIndex, value) => {
      const values = [...get().schroedinger.parameterValues]
      if (dimIndex < 0 || dimIndex >= values.length) {
        if (import.meta.env.DEV) {
          console.warn(
            `setSchroedingerParameterValue: Invalid dimension index ${dimIndex} (valid range: 0-${values.length - 1})`
          )
        }
        return
      }
      const clampedValue = Math.max(-2.0, Math.min(2.0, value))
      values[dimIndex] = clampedValue
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: values },
      }))
    },

    setSchroedingerParameterValues: (values) => {
      const clampedValues = values.map((v) => Math.max(-2.0, Math.min(2.0, v)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: clampedValues },
      }))
    },

    resetSchroedingerParameters: () => {
      const len = get().schroedinger.parameterValues.length
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: new Array(len).fill(0) },
      }))
    },

    // === Navigation ===
    setSchroedingerCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, center },
      }))
    },

    setSchroedingerExtent: (extent) => {
      const clampedExtent = Math.max(0.001, Math.min(10.0, extent))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extent: clampedExtent },
      }))
    },

    fitSchroedingerToView: () => {
      const centerLen = get().schroedinger.center.length
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          center: new Array(centerLen).fill(0),
          extent: 2.5,
        },
      }))
    },

    // === Color Settings ===
    setSchroedingerColorMode: valueSetter('colorMode'),

    setSchroedingerPalette: (palette) => {
      const definitions = SCHROEDINGER_PALETTE_DEFINITIONS[palette]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          palette,
          cosineParams: definitions ? definitions : state.schroedinger.cosineParams,
        },
      }))
    },

    setSchroedingerCustomPalette: valueSetter('customPalette'),
    setSchroedingerInvertColors: valueSetter('invertColors'),

    // === Rendering Style ===
    setSchroedingerRenderStyle: valueSetter('renderStyle'),

    // === Quantum State Configuration ===
    setSchroedingerPresetName: (name: SchroedingerPresetName) => {
      // If selecting a named preset, apply its parameters to the state
      // This keeps the UI sliders in sync with the visual preset
      let updates = {}
      if (name !== 'custom') {
        const preset = SCHROEDINGER_NAMED_PRESETS[name]
        if (preset) {
          updates = {
            seed: preset.seed,
            termCount: preset.termCount,
            maxQuantumNumber: preset.maxN,
            frequencySpread: preset.frequencySpread,
          }
        }
      }

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          presetName: name,
          ...updates,
        },
      }))
    },

    setSchroedingerSeed: (seed) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, seed: Math.floor(seed), presetName: 'custom' },
      }))
    },

    randomizeSchroedingerSeed: () => {
      const newSeed = Math.floor(Math.random() * 1000000)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, seed: newSeed, presetName: 'custom' },
      }))
    },

    setSchroedingerTermCount: (count) => {
      const clampedCount = Math.max(1, Math.min(8, Math.floor(count)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, termCount: clampedCount, presetName: 'custom' },
      }))
    },

    setSchroedingerMaxQuantumNumber: (maxN) => {
      const clampedMaxN = Math.max(2, Math.min(6, Math.floor(maxN)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          maxQuantumNumber: clampedMaxN,
          presetName: 'custom',
        },
      }))
    },

    setSchroedingerFrequencySpread: (spread) => {
      const clampedSpread = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          frequencySpread: clampedSpread,
          presetName: 'custom',
        },
      }))
    },

    // === Quantum Mode Selection ===
    setSchroedingerQuantumMode: (mode) => {
      setWithVersion((state) => {
        const updates: Partial<SchroedingerConfig> = { quantumMode: mode }
        if (mode === 'freeScalarField') {
          // Free scalar field doesn't support Wigner or momentum representation
          if (state.schroedinger.representation !== 'position') {
            updates.representation = 'position'
          }
          // Cross-section calls evalPsi() (HO wavefunction), not the actual scalar field
          if (state.schroedinger.crossSectionEnabled) {
            updates.crossSectionEnabled = false
          }
          // Sync latticeDim to current global dimension and resize arrays
          const dim = useGeometryStore.getState().dimension
          const prev = state.schroedinger.freeScalar
          if (prev.latticeDim !== dim) {
            const resized = resizeFreeScalarArrays(prev, dim)
            const newSpacing = resized.spacing ?? prev.spacing
            const newDt = clampDtWithCfl(prev.dt, newSpacing, dim, prev.mass)
            updates.freeScalar = { ...prev, ...resized, dt: newDt, needsReset: true }
          }
        }
        if (mode === 'tdseDynamics') {
          // TDSE doesn't support Wigner or momentum representation
          if (state.schroedinger.representation !== 'position') {
            updates.representation = 'position'
          }
          // Cross-section uses analytic wavefunctions, not TDSE grid
          if (state.schroedinger.crossSectionEnabled) {
            updates.crossSectionEnabled = false
          }
          // Sync latticeDim to current global dimension and resize arrays
          const dim = useGeometryStore.getState().dimension
          const prev = state.schroedinger.tdse
          if (prev.latticeDim !== dim) {
            const resized = resizeTdseArrays(prev, dim)
            updates.tdse = { ...prev, ...resized, needsReset: true }
          }
        }
        return { schroedinger: { ...state.schroedinger, ...updates } }
      })
    },
    setSchroedingerRepresentation: valueSetter('representation'),
    setSchroedingerMomentumDisplayUnits: valueSetter('momentumDisplayUnits'),
    setSchroedingerMomentumScale: clampedSetter('momentumScale', 0.1, 4.0),
    setSchroedingerMomentumHbar: clampedSetter('momentumHbar', 0.01, 10.0),

    setSchroedingerPrincipalQuantumNumber: (n: number) => {
      const clamped = Math.max(1, Math.min(7, Math.floor(n)))
      const currentL = get().schroedinger.azimuthalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber

      // Enforce l < n constraint
      const newL = Math.min(currentL, clamped - 1)
      // Enforce |m| <= l constraint
      const newM = Math.max(-newL, Math.min(newL, currentM))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          principalQuantumNumber: clamped,
          azimuthalQuantumNumber: newL,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerAzimuthalQuantumNumber: (l: number) => {
      const currentN = get().schroedinger.principalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber

      // Enforce l < n and l >= 0 constraints
      const clamped = Math.max(0, Math.min(currentN - 1, Math.floor(l)))
      // Enforce |m| <= l constraint
      const newM = Math.max(-clamped, Math.min(clamped, currentM))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          azimuthalQuantumNumber: clamped,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerMagneticQuantumNumber: (m: number) => {
      const currentL = get().schroedinger.azimuthalQuantumNumber
      // Enforce |m| <= l constraint
      const clamped = Math.max(-currentL, Math.min(currentL, Math.floor(m)))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          magneticQuantumNumber: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerUseRealOrbitals: (useRealOrbitals) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          useRealOrbitals,
          hydrogenNDPreset: 'custom',
        },
      }))
    },
    setSchroedingerBohrRadiusScale: (bohrRadiusScale) => {
      const clamped = Math.max(0.5, Math.min(3.0, bohrRadiusScale))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bohrRadiusScale: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    // === Hydrogen ND Configuration ===
    setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => {
      // For 'custom', only update the preset name - preserve existing values
      if (preset === 'custom') {
        set((state) => ({
          schroedinger: {
            ...state.schroedinger,
            hydrogenNDPreset: preset,
          },
        }))
        return
      }

      // For named presets, apply all preset values
      const presetData = getHydrogenNDPreset(preset)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          hydrogenNDPreset: preset,
          // Update 3D hydrogen quantum numbers
          principalQuantumNumber: presetData.n,
          azimuthalQuantumNumber: presetData.l,
          magneticQuantumNumber: presetData.m,
          useRealOrbitals: presetData.useReal,
          bohrRadiusScale: presetData.bohrRadiusScale,
          // Update extra dimension configuration
          extraDimQuantumNumbers: [...presetData.extraDimN],
          extraDimOmega: [...presetData.extraDimOmega],
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumber: (dimIndex: number, n: number) => {
      const numbers = [...get().schroedinger.extraDimQuantumNumbers]
      if (dimIndex < 0 || dimIndex >= 8) return
      numbers[dimIndex] = Math.max(0, Math.min(6, Math.floor(n)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: numbers,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumbers: (numbers: number[]) => {
      const clamped = numbers.slice(0, 8).map((n) => Math.max(0, Math.min(6, Math.floor(n))))
      while (clamped.length < 8) clamped.push(0)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => {
      const omegas = [...get().schroedinger.extraDimOmega]
      if (dimIndex < 0 || dimIndex >= 8) return
      omegas[dimIndex] = Math.max(0.1, Math.min(2.0, omega))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: omegas },
      }))
    },

    setSchroedingerExtraDimOmegaAll: (omegas: number[]) => {
      const clamped = omegas.slice(0, 8).map((o) => Math.max(0.1, Math.min(2.0, o)))
      while (clamped.length < 8) clamped.push(1.0)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: clamped },
      }))
    },

    setSchroedingerExtraDimFrequencySpread: (spread: number) => {
      const clamped = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimFrequencySpread: clamped },
      }))
    },

    // === Volume Rendering Parameters ===
    setSchroedingerTimeScale: clampedSetter('timeScale', 0.1, 2.0),
    setSchroedingerFieldScale: clampedSetter('fieldScale', 0.5, 2.0),
    setSchroedingerDensityGain: clampedSetter('densityGain', 0.1, 5.0),
    setSchroedingerDensityContrast: clampedSetter('densityContrast', 1.0, 4.0),
    setSchroedingerPowderScale: clampedSetter('powderScale', 0.0, 2.0),
    setSchroedingerSampleCount: clampedSetter('sampleCount', 16, 128),
    setSchroedingerEmissionIntensity: clampedSetter('emissionIntensity', 0.0, 5.0),
    setSchroedingerEmissionThreshold: clampedSetter('emissionThreshold', 0.0, 1.0),
    setSchroedingerEmissionColorShift: clampedSetter('emissionColorShift', -1.0, 1.0),
    setSchroedingerScatteringAnisotropy: clampedSetter('scatteringAnisotropy', -0.9, 0.9),
    setSchroedingerRoughness: clampedSetter('roughness', 0.0, 1.0),
    setSchroedingerFogIntegrationEnabled: valueSetter('fogIntegrationEnabled'),
    setSchroedingerFogContribution: clampedSetter('fogContribution', 0.0, 2.0),
    setSchroedingerInternalFogDensity: clampedSetter('internalFogDensity', 0.0, 1.0),

    setSchroedingerRaymarchQuality: (quality: RaymarchQuality) => {
      // Update both raymarchQuality and sampleCount for consistency.
      // Note: The mesh reads raymarchQuality directly via RAYMARCH_QUALITY_TO_SAMPLES mapping.
      // sampleCount is kept in sync for backward compatibility with any code that reads it directly.
      const sampleCount = RAYMARCH_QUALITY_TO_SAMPLES[quality]
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, raymarchQuality: quality, sampleCount },
      }))
    },

    // === SSS (Subsurface Scattering) ===
    setSchroedingerSssEnabled: valueSetter('sssEnabled'),
    setSchroedingerSssIntensity: clampedSetter('sssIntensity', 0.0, 2.0),
    setSchroedingerSssColor: valueSetter('sssColor'),
    setSchroedingerSssThickness: clampedSetter('sssThickness', 0.1, 5.0),
    setSchroedingerSssJitter: clampedSetter('sssJitter', 0.0, 1.0),

    // === Nodal Surfaces ===
    setSchroedingerNodalEnabled: valueSetter('nodalEnabled'),
    setSchroedingerNodalColor: valueSetter('nodalColor'),
    setSchroedingerNodalStrength: clampedSetter('nodalStrength', 0.0, 2.0),
    setSchroedingerNodalDefinition: valueSetter('nodalDefinition'),
    setSchroedingerNodalTolerance: clampedSetter('nodalTolerance', 0.00001, 0.5),
    setSchroedingerNodalFamilyFilter: valueSetter('nodalFamilyFilter'),
    setSchroedingerNodalRenderMode: valueSetter('nodalRenderMode'),
    setSchroedingerNodalLobeColoringEnabled: valueSetter('nodalLobeColoringEnabled'),
    setSchroedingerNodalColorReal: valueSetter('nodalColorReal'),
    setSchroedingerNodalColorImag: valueSetter('nodalColorImag'),
    setSchroedingerNodalColorPositive: valueSetter('nodalColorPositive'),
    setSchroedingerNodalColorNegative: valueSetter('nodalColorNegative'),

    // === Visual Effects ===
    setSchroedingerUncertaintyBoundaryEnabled: valueSetter('uncertaintyBoundaryEnabled'),
    setSchroedingerUncertaintyBoundaryStrength: clampedSetter(
      'uncertaintyBoundaryStrength',
      0.0,
      1.0
    ),
    setSchroedingerUncertaintyConfidenceMass: clampedSetter('uncertaintyConfidenceMass', 0.5, 0.99),
    setSchroedingerUncertaintyBoundaryWidth: clampedSetter('uncertaintyBoundaryWidth', 0.05, 1.0),
    setSchroedingerPhaseMaterialityEnabled: valueSetter('phaseMaterialityEnabled'),
    setSchroedingerPhaseMaterialityStrength: clampedSetter('phaseMaterialityStrength', 0.0, 1.0),
    setSchroedingerInterferenceEnabled: valueSetter('interferenceEnabled'),
    setSchroedingerInterferenceAmp: clampedSetter('interferenceAmp', 0.0, 1.0),
    setSchroedingerInterferenceFreq: clampedSetter('interferenceFreq', 1.0, 50.0),
    setSchroedingerInterferenceSpeed: clampedSetter('interferenceSpeed', 0.0, 10.0),
    // Physical Probability Current (j-field)
    setSchroedingerProbabilityCurrentEnabled: valueSetter('probabilityCurrentEnabled'),
    setSchroedingerProbabilityCurrentStyle: valueSetter('probabilityCurrentStyle'),
    setSchroedingerProbabilityCurrentPlacement: valueSetter('probabilityCurrentPlacement'),
    setSchroedingerProbabilityCurrentColorMode: valueSetter('probabilityCurrentColorMode'),
    setSchroedingerProbabilityCurrentScale: clampedSetter('probabilityCurrentScale', 0.0, 5.0),
    setSchroedingerProbabilityCurrentSpeed: clampedSetter('probabilityCurrentSpeed', 0.0, 10.0),
    setSchroedingerProbabilityCurrentDensityThreshold: clampedSetter(
      'probabilityCurrentDensityThreshold',
      0.0,
      1.0
    ),
    setSchroedingerProbabilityCurrentMagnitudeThreshold: clampedSetter(
      'probabilityCurrentMagnitudeThreshold',
      0.0,
      10.0
    ),
    setSchroedingerProbabilityCurrentLineDensity: clampedSetter(
      'probabilityCurrentLineDensity',
      1.0,
      64.0
    ),
    setSchroedingerProbabilityCurrentStepSize: clampedSetter(
      'probabilityCurrentStepSize',
      0.005,
      0.2
    ),
    setSchroedingerProbabilityCurrentSteps: (steps: number) => {
      const clamped = Math.max(4, Math.min(64, Math.floor(steps)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, probabilityCurrentSteps: clamped },
      }))
    },
    setSchroedingerProbabilityCurrentOpacity: clampedSetter('probabilityCurrentOpacity', 0.0, 1.0),
    // Probability Current Flow
    setSchroedingerProbabilityFlowEnabled: valueSetter('probabilityFlowEnabled'),
    setSchroedingerProbabilityFlowSpeed: clampedSetter('probabilityFlowSpeed', 0.1, 5.0),
    setSchroedingerProbabilityFlowStrength: clampedSetter('probabilityFlowStrength', 0.0, 1.0),
    // Radial Probability Overlay (hydrogen)
    setSchroedingerRadialProbabilityEnabled: valueSetter('radialProbabilityEnabled'),
    setSchroedingerRadialProbabilityOpacity: clampedSetter('radialProbabilityOpacity', 0.0, 1.0),
    setSchroedingerRadialProbabilityColor: valueSetter('radialProbabilityColor'),
    setSchroedingerIsoEnabled: valueSetter('isoEnabled'),
    setSchroedingerIsoThreshold: clampedSetter('isoThreshold', -6, 0),

    // === 2D Cross-Section Slice ===
    setSchroedingerCrossSectionEnabled: valueSetter('crossSectionEnabled'),
    setSchroedingerCrossSectionCompositeMode: valueSetter('crossSectionCompositeMode'),
    setSchroedingerCrossSectionScalar: valueSetter('crossSectionScalar'),
    setSchroedingerCrossSectionPlaneMode: valueSetter('crossSectionPlaneMode'),
    setSchroedingerCrossSectionAxis: (axis) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionAxis: axis,
          crossSectionPlaneMode: 'axisAligned',
          crossSectionPlaneNormal: axisToNormal(axis),
        },
      }))
    },
    setSchroedingerCrossSectionPlaneNormal: (normal) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionPlaneNormal: normalizePlaneNormal(normal),
          crossSectionPlaneMode: 'free',
        },
      }))
    },
    setSchroedingerCrossSectionPlaneOffset: clampedSetter('crossSectionPlaneOffset', -1.0, 1.0),
    setSchroedingerCrossSectionOpacity: clampedSetter('crossSectionOpacity', 0.0, 1.0),
    setSchroedingerCrossSectionThickness: clampedSetter('crossSectionThickness', 0.0, 0.2),
    setSchroedingerCrossSectionPlaneColor: valueSetter('crossSectionPlaneColor'),
    setSchroedingerCrossSectionAutoWindow: valueSetter('crossSectionAutoWindow'),
    setSchroedingerCrossSectionWindowMin: (minValue) => {
      setWithVersion((state) => {
        const clampedMin = Math.max(-10.0, Math.min(10.0, minValue))
        const clampedMax = Math.max(state.schroedinger.crossSectionWindowMax, clampedMin + 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            crossSectionWindowMin: clampedMin,
            crossSectionWindowMax: clampedMax,
          },
        }
      })
    },
    setSchroedingerCrossSectionWindowMax: (maxValue) => {
      setWithVersion((state) => {
        const clampedMax = Math.max(-10.0, Math.min(10.0, maxValue))
        const clampedMin = Math.min(state.schroedinger.crossSectionWindowMin, clampedMax - 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            crossSectionWindowMin: clampedMin,
            crossSectionWindowMax: Math.max(clampedMax, clampedMin + 1e-4),
          },
        }
      })
    },

    // === Slice Animation (4D+ only) ===
    setSchroedingerSliceAnimationEnabled: valueSetter('sliceAnimationEnabled'),
    setSchroedingerSliceSpeed: clampedSetter('sliceSpeed', 0.01, 0.1),
    setSchroedingerSliceAmplitude: clampedSetter('sliceAmplitude', 0.1, 1.0),

    // === Phase Animation (Hydrogen ND only) ===
    setSchroedingerPhaseAnimationEnabled: valueSetter('phaseAnimationEnabled'),

    // === Wigner Phase-Space Visualization ===
    setSchroedingerWignerDimensionIndex: (index: number) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wignerDimensionIndex: Math.max(0, Math.min(index, 10)),
        },
      }))
    },
    setSchroedingerWignerAutoRange: valueSetter('wignerAutoRange'),
    setSchroedingerWignerXRange: clampedSetter('wignerXRange', 1.0, 30.0),
    setSchroedingerWignerPRange: clampedSetter('wignerPRange', 1.0, 30.0),
    setSchroedingerWignerCrossTermsEnabled: valueSetter('wignerCrossTermsEnabled'),
    setSchroedingerWignerQuadPoints: (points: number) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wignerQuadPoints: Math.max(8, Math.min(Math.round(points), 64)),
        },
      }))
    },
    setSchroedingerWignerClassicalOverlay: valueSetter('wignerClassicalOverlay'),

    setSchroedingerWignerCacheResolution: (resolution: number) => {
      const clamped = Math.max(128, Math.min(1024, Math.round(resolution)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, wignerCacheResolution: clamped },
      }))
    },

    // === Second Quantization Educational Layer ===
    setSchroedingerSqLayerEnabled: valueSetter('sqLayerEnabled'),
    setSchroedingerSqLayerMode: valueSetter('sqLayerMode'),
    setSchroedingerSqLayerSelectedModeIndex: clampedSetter('sqLayerSelectedModeIndex', 0, 10),
    setSchroedingerSqLayerFockQuantumNumber: clampedSetter('sqLayerFockQuantumNumber', 0, 10),
    setSchroedingerSqLayerShowOccupation: valueSetter('sqLayerShowOccupation'),
    setSchroedingerSqLayerShowUncertainty: valueSetter('sqLayerShowUncertainty'),
    setSchroedingerSqLayerCoherentAlphaRe: clampedSetter('sqLayerCoherentAlphaRe', -5, 5),
    setSchroedingerSqLayerCoherentAlphaIm: clampedSetter('sqLayerCoherentAlphaIm', -5, 5),
    setSchroedingerSqLayerSqueezeR: clampedSetter('sqLayerSqueezeR', 0, 3),
    setSchroedingerSqLayerSqueezeTheta: clampedSetter('sqLayerSqueezeTheta', 0, 2 * Math.PI),

    // === Free Scalar Field ===
    setFreeScalarLatticeDim: (dim) => {
      const clamped = Math.max(1, Math.min(11, Math.floor(dim)))
      setWithVersion((state) => {
        const prev = state.schroedinger.freeScalar
        const resized = resizeFreeScalarArrays(prev, clamped)
        const newSpacing = resized.spacing ?? prev.spacing
        const newDt = clampDtWithCfl(prev.dt, newSpacing, clamped, prev.mass)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...prev, ...resized, dt: newDt, needsReset: true },
          },
        }
      })
    },
    setFreeScalarGridSize: (size) => {
      setWithVersion((state) => {
        const { latticeDim, initialCondition } = state.schroedinger.freeScalar
        const needsPow2 = initialCondition === 'vacuumNoise'
        const maxPerDim = defaultGridPerDim(latticeDim)
        const snap = (v: number, min: number, max: number) => {
          const clamped = Math.max(min, Math.min(max, Math.round(v)))
          if (!needsPow2) return clamped
          const log2 = Math.round(Math.log2(clamped))
          return Math.max(min, Math.min(max, 2 ** log2))
        }
        const clamped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : 1
          return i < latticeDim ? snap(s, 2, maxPerDim) : 1
        })
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...state.schroedinger.freeScalar, gridSize: clamped, needsReset: true },
          },
        }
      })
    },
    setFreeScalarSpacing: (spacing) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const clamped = Array.from({ length: fs.latticeDim }, (_, i) =>
          Math.max(0.01, Math.min(1.0, i < spacing.length ? spacing[i]! : 0.1))
        )
        const newDt = clampDtWithCfl(fs.dt, clamped, fs.latticeDim, fs.mass)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, spacing: clamped, dt: newDt, needsReset: true },
          },
        }
      })
    },
    setFreeScalarMass: (mass) => {
      const clamped = Math.max(0.0, Math.min(10.0, mass))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Re-clamp dt to respect CFL limit with new mass
        const newDt = clampDtWithCfl(fs.dt, fs.spacing, fs.latticeDim, clamped)
        // Vacuum noise spectrum depends on mass — trigger re-initialization.
        // Preserve any pending reset from another setter (e.g. setFreeScalarLatticeDim).
        const needsReset = fs.needsReset || fs.initialCondition === 'vacuumNoise'
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, mass: clamped, dt: newDt, needsReset },
          },
        }
      })
    },
    setFreeScalarDt: (dt) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const clamped = clampDtWithCfl(dt, fs.spacing, fs.latticeDim, fs.mass)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, dt: clamped },
          },
        }
      })
    },
    setFreeScalarStepsPerFrame: (steps) => {
      const clamped = Math.max(1, Math.min(16, Math.floor(steps)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, stepsPerFrame: clamped },
        },
      }))
    },
    setFreeScalarInitialCondition: (condition) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        let gridSize = fs.gridSize

        // Snap grid sizes to power-of-2 when switching to vacuumNoise
        if (condition === 'vacuumNoise') {
          const maxPerDim = defaultGridPerDim(fs.latticeDim)
          gridSize = gridSize.map((s) => {
            const clamped = Math.max(2, Math.min(maxPerDim, s))
            const log2 = Math.round(Math.log2(clamped))
            return Math.max(2, Math.min(maxPerDim, 2 ** log2))
          })
        }

        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, initialCondition: condition, gridSize, needsReset: true },
          },
        }
      })
    },
    setFreeScalarFieldView: (view) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, fieldView: view },
        },
      }))
    },

    setFreeScalarPacketCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, packetCenter: center, needsReset: true },
        },
      }))
    },
    setFreeScalarPacketWidth: (width) => {
      const clamped = Math.max(0.01, Math.min(5.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, packetWidth: clamped, needsReset: true },
        },
      }))
    },
    setFreeScalarPacketAmplitude: (amplitude) => {
      const clamped = Math.max(0.01, Math.min(10.0, amplitude))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, packetAmplitude: clamped, needsReset: true },
        },
      }))
    },
    setFreeScalarModeK: (k) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, modeK: k, needsReset: true },
        },
      }))
    },
    setFreeScalarAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, autoScale },
        },
      }))
    },

    setFreeScalarVacuumSeed: (seed) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, vacuumSeed: Math.round(seed), needsReset: true },
        },
      }))
    },
    resetFreeScalarField: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: true },
        },
      }))
    },
    setFreeScalarSlicePosition: (dimIndex, value) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const slicePositions = [...fs.slicePositions]
        if (dimIndex >= 0 && dimIndex < slicePositions.length) {
          const halfExtent = (fs.gridSize[dimIndex + 3] ?? 1) * (fs.spacing[dimIndex + 3] ?? 0.1) * 0.5
          slicePositions[dimIndex] = Math.max(-halfExtent, Math.min(halfExtent, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, slicePositions },
          },
        }
      })
    },

    clearFreeScalarNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: false },
        },
      }))
    },

    // === k-Space Visualization Display Transforms ===
    setFreeScalarKSpaceDisplayMode: (mode) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, displayMode: mode },
          },
        },
      }))
    },
    setFreeScalarKSpaceFftShift: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, fftShiftEnabled: enabled },
          },
        },
      }))
    },
    setFreeScalarKSpaceExposureMode: (mode) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, exposureMode: mode },
          },
        },
      }))
    },
    setFreeScalarKSpaceLowPercentile: (value) => {
      setWithVersion((state) => {
        const viz = state.schroedinger.freeScalar.kSpaceViz
        const clamped = Math.max(0, Math.min(viz.highPercentile - 0.5, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...state.schroedinger.freeScalar,
              kSpaceViz: { ...viz, lowPercentile: clamped },
            },
          },
        }
      })
    },
    setFreeScalarKSpaceHighPercentile: (value) => {
      setWithVersion((state) => {
        const viz = state.schroedinger.freeScalar.kSpaceViz
        const clamped = Math.max(viz.lowPercentile + 0.5, Math.min(100, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...state.schroedinger.freeScalar,
              kSpaceViz: { ...viz, highPercentile: clamped },
            },
          },
        }
      })
    },
    setFreeScalarKSpaceGamma: (value) => {
      const clamped = Math.max(0.1, Math.min(3.0, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, gamma: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningEnabled: enabled },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningRadius: (value) => {
      const clamped = Math.max(1, Math.min(5, Math.round(value)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningRadius: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningSigma: (value) => {
      const clamped = Math.max(0.5, Math.min(3.0, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningSigma: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceRadialBinCount: (value) => {
      const clamped = Math.max(16, Math.min(128, Math.round(value)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, radialBinCount: clamped },
          },
        },
      }))
    },

    // === TDSE (Time-Dependent Schroedinger Equation) ===
    setTdseLatticeDim: (dim) => {
      const clamped = Math.max(1, Math.min(11, Math.floor(dim)))
      setWithVersion((state) => {
        const prev = state.schroedinger.tdse
        const resized = resizeTdseArrays(prev, clamped)
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...prev, ...resized, needsReset: true },
          },
        }
      })
    },
    setTdseGridSize: (size) => {
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.tdse
        const maxPerDim = defaultTdseGridPerDim(latticeDim)
        const clamped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : 4
          const val = Math.max(4, Math.min(maxPerDim, Math.round(s)))
          // Snap to power-of-2 for FFT
          const log2 = Math.round(Math.log2(val))
          return Math.max(4, Math.min(maxPerDim, 2 ** log2))
        })
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...state.schroedinger.tdse, gridSize: clamped, needsReset: true },
          },
        }
      })
    },
    setTdseSpacing: (spacing) => {
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const clamped = Array.from({ length: td.latticeDim }, (_, i) =>
          Math.max(0.01, Math.min(1.0, i < spacing.length ? spacing[i]! : 0.1))
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, spacing: clamped, needsReset: true },
          },
        }
      })
    },
    setTdseMass: (mass) => {
      const clamped = Math.max(0.01, Math.min(100.0, mass))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, mass: clamped, needsReset: true },
        },
      }))
    },
    setTdseHbar: (hbar) => {
      const clamped = Math.max(0.01, Math.min(10.0, hbar))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, hbar: clamped, needsReset: true },
        },
      }))
    },
    setTdseDt: (dt) => {
      const clamped = Math.max(0.0001, Math.min(0.1, dt))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, dt: clamped },
        },
      }))
    },
    setTdseStepsPerFrame: (steps) => {
      const clamped = Math.max(1, Math.min(16, Math.floor(steps)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stepsPerFrame: clamped },
        },
      }))
    },
    setTdseInitialCondition: (condition) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, initialCondition: condition, needsReset: true },
        },
      }))
    },
    setTdsePacketCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetCenter: center, needsReset: true },
        },
      }))
    },
    setTdsePacketWidth: (width) => {
      const clamped = Math.max(0.01, Math.min(5.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetWidth: clamped, needsReset: true },
        },
      }))
    },
    setTdsePacketAmplitude: (amplitude) => {
      const clamped = Math.max(0.01, Math.min(10.0, amplitude))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetAmplitude: clamped, needsReset: true },
        },
      }))
    },
    setTdsePacketMomentum: (momentum) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetMomentum: momentum, needsReset: true },
        },
      }))
    },
    setTdsePotentialType: (type) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, potentialType: type, needsReset: true },
        },
      }))
    },
    setTdseBarrierHeight: (height) => {
      const clamped = Math.max(0.0, Math.min(100.0, height))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, barrierHeight: clamped, needsReset: true },
        },
      }))
    },
    setTdseBarrierWidth: (width) => {
      const clamped = Math.max(0.01, Math.min(5.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, barrierWidth: clamped, needsReset: true },
        },
      }))
    },
    setTdseBarrierCenter: (center) => {
      const clamped = Math.max(-10.0, Math.min(10.0, center))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, barrierCenter: clamped, needsReset: true },
        },
      }))
    },
    setTdseWellDepth: (depth) => {
      const clamped = Math.max(0.0, Math.min(100.0, depth))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wellDepth: clamped, needsReset: true },
        },
      }))
    },
    setTdseWellWidth: (width) => {
      const clamped = Math.max(0.01, Math.min(10.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wellWidth: clamped, needsReset: true },
        },
      }))
    },
    setTdseHarmonicOmega: (omega) => {
      const clamped = Math.max(0.01, Math.min(100.0, omega))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, harmonicOmega: clamped, needsReset: true },
        },
      }))
    },
    setTdseStepHeight: (height) => {
      const clamped = Math.max(0.0, Math.min(100.0, height))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stepHeight: clamped, needsReset: true },
        },
      }))
    },
    setTdseDriveEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, driveEnabled: enabled },
        },
      }))
    },
    setTdseDriveWaveform: (waveform) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, driveWaveform: waveform },
        },
      }))
    },
    setTdseDriveFrequency: (frequency) => {
      const clamped = Math.max(0.01, Math.min(100.0, frequency))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, driveFrequency: clamped },
        },
      }))
    },
    setTdseDriveAmplitude: (amplitude) => {
      const clamped = Math.max(0.0, Math.min(100.0, amplitude))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, driveAmplitude: clamped },
        },
      }))
    },
    setTdseAbsorberEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, absorberEnabled: enabled },
        },
      }))
    },
    setTdseAbsorberWidth: (width) => {
      const clamped = Math.max(0.05, Math.min(0.3, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, absorberWidth: clamped },
        },
      }))
    },
    setTdseAbsorberStrength: (strength) => {
      const clamped = Math.max(0.0, Math.min(50.0, strength))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, absorberStrength: clamped },
        },
      }))
    },
    setTdseFieldView: (view) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, fieldView: view },
        },
      }))
    },
    setTdseAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, autoScale },
        },
      }))
    },
    setTdseDiagnosticsEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, diagnosticsEnabled: enabled },
        },
      }))
    },
    setTdseDiagnosticsInterval: (interval) => {
      const clamped = Math.max(1, Math.min(60, Math.floor(interval)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, diagnosticsInterval: clamped },
        },
      }))
    },
    setTdseSlicePosition: (dimIndex, value) => {
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const slicePositions = [...td.slicePositions]
        if (dimIndex >= 0 && dimIndex < slicePositions.length) {
          const halfExtent = (td.gridSize[dimIndex + 3] ?? 1) * (td.spacing[dimIndex + 3] ?? 0.1) * 0.5
          slicePositions[dimIndex] = Math.max(-halfExtent, Math.min(halfExtent, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, slicePositions },
          },
        }
      })
    },
    resetTdseField: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, needsReset: true },
        },
      }))
    },
    clearTdseNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, needsReset: false },
        },
      }))
    },

    // === Config Operations ===
    setSchroedingerConfig: (config) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, ...config },
      }))
    },

    initializeSchroedingerForDimension: (dimension) => {
      const paramCount = Math.max(0, dimension - 3)

      // Default color mode for quantum visualization
      const colorMode: SchroedingerColorMode = 'mixed'

      // Extent: standard volume size
      const extent = 2.0

      // Center at origin for all dimensions
      const center = new Array(dimension).fill(0)

      // Scale densityGain with dimension to compensate for
      // product of Hermite polynomials at slice positions.
      // Higher dimensions need more gain to remain visible.
      // Base gain of 2.0 works well for 3D-4D, scale up for higher.
      // 2D needs less gain since there's no volumetric integration loss.
      const baseDensityGain = dimension === 2 ? 1.0 : 2.0
      const dimensionBoost = dimension > 4 ? 1.0 + (dimension - 4) * 0.4 : 1.0
      const densityGain = Math.min(baseDensityGain * dimensionBoost, 5.0) // Clamp to max

      // For 2D hydrogen mode: auto-adjust quantum numbers to ensure visibility.
      // The 2D view is a z=0 cross-section, so orbitals with cos(θ) dependence
      // (e.g. pz: l=1,m=0) are exactly zero at z=0. Default to l=0 (s orbital)
      // which is spherically symmetric and always visible.
      const hydrogenUpdate: Record<string, number> = {}
      if (dimension === 2) {
        const current = get().schroedinger
        if (current.quantumMode === 'hydrogenND') {
          const currentL = current.azimuthalQuantumNumber
          const currentM = current.magneticQuantumNumber
          // If current orbital would be invisible at z=0 (m=0 with l>0 → cos(θ)^l factor)
          // Specifically: Y_l^0 ∝ P_l(cosθ), and P_l(0) = 0 for odd l.
          // For even l>0 with m=0, there IS some density at θ=π/2 but it can be weak.
          // Safest fix: if m=0 and l>0, switch to m=1 (real orbital → px/dxy etc.)
          if (currentM === 0 && currentL > 0) {
            hydrogenUpdate.magneticQuantumNumber = 1
          }
        }
      }

      // Sync free scalar latticeDim to global dimension when in free scalar mode
      const currentState = get().schroedinger
      let freeScalarUpdate: Partial<FreeScalarConfig> | undefined
      if (currentState.quantumMode === 'freeScalarField') {
        const prev = currentState.freeScalar
        if (prev.latticeDim !== dimension) {
          const resized = resizeFreeScalarArrays(prev, dimension)
          const newSpacing = resized.spacing ?? prev.spacing
          const newDt = clampDtWithCfl(prev.dt, newSpacing, dimension, prev.mass)
          freeScalarUpdate = { ...resized, dt: newDt, needsReset: true }
        }
      }

      // Sync TDSE latticeDim to global dimension when in TDSE mode
      let tdseUpdate: Partial<TdseConfig> | undefined
      if (currentState.quantumMode === 'tdseDynamics') {
        const prev = currentState.tdse
        if (prev.latticeDim !== dimension) {
          tdseUpdate = { ...resizeTdseArrays(prev, dimension), needsReset: true }
        }
      }

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          parameterValues: new Array(paramCount).fill(0),
          center,
          visualizationAxes: [0, 1, 2],
          colorMode,
          extent,
          densityGain,
          // Clamp SQ layer mode index to valid dimension range
          sqLayerSelectedModeIndex: Math.min(
            state.schroedinger.sqLayerSelectedModeIndex,
            Math.max(0, dimension - 1)
          ),
          ...hydrogenUpdate,
          ...(freeScalarUpdate
            ? { freeScalar: { ...state.schroedinger.freeScalar, ...freeScalarUpdate } }
            : {}),
          ...(tdseUpdate
            ? { tdse: { ...state.schroedinger.tdse, ...tdseUpdate } }
            : {}),
        },
      }))
    },

    getSchroedingerConfig: () => {
      return { ...get().schroedinger }
    },
  }
}
