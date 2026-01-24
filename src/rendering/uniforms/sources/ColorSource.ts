/**
 * Color Uniform Source
 *
 * Provides color algorithm uniforms for the palette system.
 * Tracks cosine coefficients, distribution settings, and LCH parameters.
 *
 * @module rendering/uniforms/sources/ColorSource
 */

import { Vector3 } from 'three'

import {
  COLOR_ALGORITHM_TO_INT,
  type ColorAlgorithm,
  type CosineCoefficients,
  type DistributionSettings,
  type MultiSourceWeights,
} from '@/rendering/shaders/palette'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { BaseUniformSource, type IUniform, type UniformUpdateState } from '../UniformSource'

/**
 * Configuration for ColorSource.
 */
export interface ColorSourceConfig {
  /** Color algorithm selection */
  colorAlgorithm: ColorAlgorithm
  /** Cosine gradient coefficients */
  cosineCoefficients: CosineCoefficients
  /** Distribution settings (power, cycles, offset) */
  distribution: DistributionSettings
  /** Multi-source blend weights */
  multiSourceWeights: MultiSourceWeights
  /** LCH lightness (0.1-1) */
  lchLightness: number
  /** LCH chroma (0-0.4) */
  lchChroma: number
}

/**
 * Color uniform source for the palette system.
 *
 * Manages color-related uniforms:
 * - uColorAlgorithm: Which coloring algorithm to use
 * - uCosineA/B/C/D: Cosine gradient coefficients
 * - uDistPower/Cycles/Offset: Distribution function parameters
 * - uLchLightness/Chroma: LCH color space parameters
 * - uMultiSourceWeights: Blend weights for multi-source mode
 *
 * @example
 * ```typescript
 * const colorSource = new ColorSource();
 *
 * // Update from color store state
 * colorSource.updateFromStore({
 *   colorAlgorithm: 'cosine',
 *   cosineCoefficients: { a: [0.5, 0.5, 0.5], ... },
 *   ...
 * });
 *
 * // Apply to material
 * colorSource.applyToMaterial(material);
 * ```
 */
export class ColorSource extends BaseUniformSource {
  readonly id = 'color'

  private colorUniforms = {
    uColorAlgorithm: { value: 0 },
    uCosineA: { value: new Vector3(0.5, 0.5, 0.5) },
    uCosineB: { value: new Vector3(0.5, 0.5, 0.5) },
    uCosineC: { value: new Vector3(1.0, 1.0, 1.0) },
    uCosineD: { value: new Vector3(0.0, 0.33, 0.67) },
    uDistPower: { value: 1.0 },
    uDistCycles: { value: 1.0 },
    uDistOffset: { value: 0.0 },
    uLchLightness: { value: 0.65 },
    uLchChroma: { value: 0.15 },
    uMultiSourceWeights: { value: new Vector3(0.5, 0.3, 0.2) },
  }

  // Cached values for change detection
  private cachedAlgorithm: ColorAlgorithm = 'monochromatic'
  private cachedCosine: CosineCoefficients | null = null
  private cachedDistribution: DistributionSettings | null = null
  private cachedMultiSource: MultiSourceWeights | null = null
  private cachedLchLightness = 0.65
  private cachedLchChroma = 0.15

  /**
   * Update from store state.
   *
   * @param config - Color configuration from store
   */
  updateFromStore(config: ColorSourceConfig): void {
    let changed = false

    // Color algorithm
    if (this.cachedAlgorithm !== config.colorAlgorithm) {
      this.colorUniforms.uColorAlgorithm.value = COLOR_ALGORITHM_TO_INT[config.colorAlgorithm]
      this.cachedAlgorithm = config.colorAlgorithm
      changed = true
    }

    // Cosine coefficients
    if (!this.cachedCosine || !this.cosineEquals(this.cachedCosine, config.cosineCoefficients)) {
      this.colorUniforms.uCosineA.value.fromArray(config.cosineCoefficients.a)
      this.colorUniforms.uCosineB.value.fromArray(config.cosineCoefficients.b)
      this.colorUniforms.uCosineC.value.fromArray(config.cosineCoefficients.c)
      this.colorUniforms.uCosineD.value.fromArray(config.cosineCoefficients.d)
      this.cachedCosine = { ...config.cosineCoefficients }
      changed = true
    }

    // Distribution settings
    if (
      !this.cachedDistribution ||
      !this.distributionEquals(this.cachedDistribution, config.distribution)
    ) {
      this.colorUniforms.uDistPower.value = config.distribution.power
      this.colorUniforms.uDistCycles.value = config.distribution.cycles
      this.colorUniforms.uDistOffset.value = config.distribution.offset
      this.cachedDistribution = { ...config.distribution }
      changed = true
    }

    // Multi-source weights
    if (
      !this.cachedMultiSource ||
      !this.multiSourceEquals(this.cachedMultiSource, config.multiSourceWeights)
    ) {
      this.colorUniforms.uMultiSourceWeights.value.set(
        config.multiSourceWeights.depth,
        config.multiSourceWeights.orbitTrap,
        config.multiSourceWeights.normal
      )
      this.cachedMultiSource = { ...config.multiSourceWeights }
      changed = true
    }

    // LCH parameters
    if (Math.abs(this.cachedLchLightness - config.lchLightness) > 0.001) {
      this.colorUniforms.uLchLightness.value = config.lchLightness
      this.cachedLchLightness = config.lchLightness
      changed = true
    }

    if (Math.abs(this.cachedLchChroma - config.lchChroma) > 0.001) {
      this.colorUniforms.uLchChroma.value = config.lchChroma
      this.cachedLchChroma = config.lchChroma
      changed = true
    }

    if (changed) {
      this.incrementVersion()
    }
  }

  /**
   * Get all color uniforms.
   * @returns Record of color uniforms
   */
  getUniforms(): Record<string, IUniform> {
    return this.colorUniforms as unknown as Record<string, IUniform>
  }

  /**
   * Frame update - automatically pulls from appearanceStore.
   * @param _state
   */
  update(_state: UniformUpdateState): void {
    const appearanceState = useAppearanceStore.getState()

    this.updateFromStore({
      colorAlgorithm: appearanceState.colorAlgorithm,
      cosineCoefficients: appearanceState.cosineCoefficients,
      distribution: appearanceState.distribution,
      multiSourceWeights: appearanceState.multiSourceWeights,
      lchLightness: appearanceState.lchLightness,
      lchChroma: appearanceState.lchChroma,
    })
  }

  /**
   * Get current color algorithm.
   * @returns Current color algorithm
   */
  getColorAlgorithm(): ColorAlgorithm {
    return this.cachedAlgorithm
  }

  /**
   * Compare cosine coefficients for equality.
   * @param a - First coefficient set
   * @param b - Second coefficient set
   * @returns True if equal
   */
  private cosineEquals(a: CosineCoefficients, b: CosineCoefficients): boolean {
    return (
      a.a[0] === b.a[0] &&
      a.a[1] === b.a[1] &&
      a.a[2] === b.a[2] &&
      a.b[0] === b.b[0] &&
      a.b[1] === b.b[1] &&
      a.b[2] === b.b[2] &&
      a.c[0] === b.c[0] &&
      a.c[1] === b.c[1] &&
      a.c[2] === b.c[2] &&
      a.d[0] === b.d[0] &&
      a.d[1] === b.d[1] &&
      a.d[2] === b.d[2]
    )
  }

  /**
   * Compare distribution settings for equality.
   * @param a - First settings
   * @param b - Second settings
   * @returns True if equal
   */
  private distributionEquals(a: DistributionSettings, b: DistributionSettings): boolean {
    return (
      Math.abs(a.power - b.power) < 0.001 &&
      Math.abs(a.cycles - b.cycles) < 0.001 &&
      Math.abs(a.offset - b.offset) < 0.001
    )
  }

  /**
   * Compare multi-source weights for equality.
   * @param a - First weights
   * @param b - Second weights
   * @returns True if equal
   */
  private multiSourceEquals(a: MultiSourceWeights, b: MultiSourceWeights): boolean {
    return (
      Math.abs(a.depth - b.depth) < 0.001 &&
      Math.abs(a.orbitTrap - b.orbitTrap) < 0.001 &&
      Math.abs(a.normal - b.normal) < 0.001
    )
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.colorUniforms.uColorAlgorithm.value = 0
    this.colorUniforms.uCosineA.value.set(0.5, 0.5, 0.5)
    this.colorUniforms.uCosineB.value.set(0.5, 0.5, 0.5)
    this.colorUniforms.uCosineC.value.set(1.0, 1.0, 1.0)
    this.colorUniforms.uCosineD.value.set(0.0, 0.33, 0.67)
    this.colorUniforms.uDistPower.value = 1.0
    this.colorUniforms.uDistCycles.value = 1.0
    this.colorUniforms.uDistOffset.value = 0.0
    this.colorUniforms.uLchLightness.value = 0.65
    this.colorUniforms.uLchChroma.value = 0.15
    this.colorUniforms.uMultiSourceWeights.value.set(0.5, 0.3, 0.2)

    this.cachedAlgorithm = 'monochromatic'
    this.cachedCosine = null
    this.cachedDistribution = null
    this.cachedMultiSource = null
    this.cachedLchLightness = 0.65
    this.cachedLchChroma = 0.15
    this._version = 0
  }
}
