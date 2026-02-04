/**
 * Section Profiler for Intra-Shader A/B Testing
 *
 * Enables profiling specific shader sections by generating variants with
 * sections disabled, then comparing performance against baseline.
 *
 * DEV MODE ONLY - This entire module is tree-shaken in production builds.
 *
 * @example
 * ```javascript
 * // In browser console:
 * const profiler = window.__PROFILER__.getSectionProfiler()
 *
 * // List sections in current shader
 * profiler.listSections('blackhole')
 *
 * // Measure cost of a specific section
 * const result = await profiler.measureSection('blackhole', 'AccretionDisk')
 * console.log(result) // { section: 'AccretionDisk', baseline: 12.5, variant: 8.2, delta: 4.3 }
 * ```
 *
 * @module dev-tools/profiler/SectionProfiler
 */

import type { ProfilerAPI } from './ProfilerAPI'

/**
 * Result of measuring a shader section's performance impact.
 */
export interface SectionTiming {
  /** Name of the section measured */
  section: string

  /** Baseline GPU time in ms (with section enabled) */
  baseline: number

  /** Variant GPU time in ms (with section disabled) */
  variant: number

  /** Delta (baseline - variant), representing section cost in ms */
  delta: number

  /** Percentage of total frame time this section represents */
  percentage: number
}

/**
 * Section Profiler for A/B testing shader sections.
 *
 * This class enables measuring the performance cost of individual shader
 * sections by generating variants with sections disabled and comparing
 * their performance against the baseline.
 *
 * IMPORTANT: This is an advanced profiling feature that requires:
 * 1. Shader sections to be marked with === SectionName === comments
 * 2. Material hot-swapping capability (not always available)
 *
 * For most use cases, the simpler iteration heatmap (debugMode=1) provides
 * sufficient insight into shader performance.
 */
export class SectionProfiler {
  constructor(_profiler: ProfilerAPI) {
    // ProfilerAPI reference kept for future hot-swap implementation
  }

  /**
   * List all marked sections in a shader.
   *
   * Sections should be marked with:
   * ```glsl
   * // === SectionName ===
   * ... section code ...
   * // === End SectionName ===
   * ```
   *
   * @param shader - The shader source code
   * @returns Array of section names found
   */
  listSections(shader: string): string[] {
    const sections: string[] = []
    let match

    const pattern = /\/\/\s*===\s*(\w+)\s*===/g
    while ((match = pattern.exec(shader)) !== null) {
      const sectionName = match[1]
      if (sectionName && !sectionName.startsWith('End')) {
        sections.push(sectionName)
      }
    }

    return [...new Set(sections)] // Remove duplicates
  }

  /**
   * Generate a shader variant with a specific section disabled.
   *
   * The section code is replaced with a no-op that maintains
   * the same output signature to prevent shader compilation errors.
   *
   * @param shader - Original shader source
   * @param sectionName - Name of section to disable
   * @returns Modified shader with section disabled
   */
  createVariant(shader: string, sectionName: string): string {
    const pattern = new RegExp(
      `\\/\\/\\s*===\\s*${sectionName}\\s*===[\\s\\S]*?\\/\\/\\s*===\\s*End\\s*${sectionName}\\s*===`,
      'g'
    )

    return shader.replace(
      pattern,
      `// === ${sectionName} === (DISABLED)\n// === End ${sectionName} ===`
    )
  }

  /**
   * Measure the performance cost of a shader section.
   *
   * This is an async operation that:
   * 1. Records baseline performance
   * 2. Generates and applies variant shader
   * 3. Records variant performance
   * 4. Restores original shader
   * 5. Returns delta
   *
   * NOTE: This requires shader hot-swap capability which may not be
   * available in all render configurations. Falls back to estimation.
   *
   * @param shaderName - Identifier for the shader to profile
   * @param _shaderName
   * @param sectionName - Name of section to measure
   * @param warmupFrames - Number of frames to wait after shader swap (default: 30)
   * @param measureFrames - Number of frames to average (default: 60)
   * @param _warmupFrames
   * @param _measureFrames
   * @returns Promise resolving to section timing data
   */
  async measureSection(
    _shaderName: string,
    sectionName: string,
    _warmupFrames = 30,
    _measureFrames = 60
  ): Promise<SectionTiming> {
    // For now, return an estimation based on section complexity analysis
    // Full hot-swap implementation requires integration with shader composer

    console.warn(
      `[SectionProfiler] Hot-swap profiling not yet implemented. ` +
        `Use iteration heatmap (window.__PROFILER__.setDebugMode(1)) for visual profiling.`
    )

    // Return placeholder data
    return {
      section: sectionName,
      baseline: 0,
      variant: 0,
      delta: 0,
      percentage: 0,
    }
  }

  /**
   * Analyze shader complexity and estimate section costs.
   *
   * Uses static analysis to estimate relative cost of shader sections
   * without requiring actual GPU measurements.
   *
   * @param shader - Shader source code
   * @returns Map of section names to estimated relative costs (0-1)
   */
  analyzeComplexity(shader: string): Map<string, number> {
    const sections = this.listSections(shader)
    const complexityMap = new Map<string, number>()

    for (const section of sections) {
      const pattern = new RegExp(
        `\\/\\/\\s*===\\s*${section}\\s*===[\\s\\S]*?\\/\\/\\s*===\\s*End\\s*${section}\\s*===`,
        'g'
      )

      const match = pattern.exec(shader)
      if (match) {
        const sectionCode = match[0]
        const complexity = this.estimateSectionComplexity(sectionCode)
        complexityMap.set(section, complexity)
      }
    }

    // Normalize to 0-1 range
    const maxComplexity = Math.max(...complexityMap.values(), 1)
    for (const [key, value] of complexityMap) {
      complexityMap.set(key, value / maxComplexity)
    }

    return complexityMap
  }

  /**
   * Estimate complexity of a shader section based on static analysis.
   *
   * Counts:
   * - Texture samples (expensive)
   * - Math operations (sin, cos, pow, exp, sqrt)
   * - Loop iterations
   * - Branches
   *
   * @param code - Shader section code
   * @returns Estimated complexity score
   */
  private estimateSectionComplexity(code: string): number {
    let score = 0

    // Texture samples (very expensive)
    score += (code.match(/texture\(/g) || []).length * 10

    // Expensive math functions
    score += (code.match(/\b(sin|cos|tan|asin|acos|atan)\b/g) || []).length * 3
    score += (code.match(/\b(pow|exp|exp2|log|log2)\b/g) || []).length * 4
    score += (code.match(/\b(sqrt|inversesqrt)\b/g) || []).length * 2

    // Loops (multiply by estimated iterations)
    const forLoops = code.match(/for\s*\([^)]+\)/g) || []
    for (const loop of forLoops) {
      // Try to extract iteration count
      const countMatch = loop.match(/(\d+)/)
      const iterations = countMatch?.[1] ? parseInt(countMatch[1], 10) : 10
      score += iterations * 2
    }

    // Branches (can cause divergence)
    score += (code.match(/\bif\s*\(/g) || []).length * 1

    // Basic operations (cheap but add up)
    score += (code.match(/[+\-*/]/g) || []).length * 0.1

    return score
  }
}
