/**
 * Tests for Polytope Shader Composition
 *
 * Tests both geometry-based and screen-space normal shader variants.
 * Screen-space normals use dFdx/dFdy for better performance on high-D polytopes.
 */

import { describe, it, expect } from 'vitest'
import {
  composeFaceVertexShader,
  composeFaceVertexShaderScreenSpace,
  composeFaceFragmentShader,
  composeFaceFragmentShaderScreenSpace,
  composeEdgeVertexShader,
  composeEdgeFragmentShader,
  type PolytopeShaderConfig,
} from '@/rendering/shaders/polytope/compose'
import { SCREEN_SPACE_NORMAL_MIN_DIMENSION } from '@/rendering/shaders/constants'

describe('SCREEN_SPACE_NORMAL_MIN_DIMENSION constant', () => {
  it('should be exported from constants', () => {
    expect(SCREEN_SPACE_NORMAL_MIN_DIMENSION).toBeDefined()
  })

  it('should be a positive integer', () => {
    expect(Number.isInteger(SCREEN_SPACE_NORMAL_MIN_DIMENSION)).toBe(true)
    expect(SCREEN_SPACE_NORMAL_MIN_DIMENSION).toBeGreaterThan(0)
  })
})

describe('composeFaceVertexShader (geometry-based normals)', () => {
  it('should include neighbor attribute declarations', () => {
    const shader = composeFaceVertexShader()

    expect(shader).toContain('aNeighbor1Pos')
    expect(shader).toContain('aNeighbor1Extra0_3')
    expect(shader).toContain('aNeighbor1Extra4_6')
    expect(shader).toContain('aNeighbor2Pos')
    expect(shader).toContain('aNeighbor2Extra0_3')
    expect(shader).toContain('aNeighbor2Extra4_6')
  })

  it('should include transformNeighbor functions', () => {
    const shader = composeFaceVertexShader()

    expect(shader).toContain('transformNeighbor1')
    expect(shader).toContain('transformNeighbor2')
  })

  it('should include computeFaceNormal function', () => {
    const shader = composeFaceVertexShader()

    expect(shader).toContain('computeFaceNormal')
  })

  it('should output vFaceNormal varying', () => {
    const shader = composeFaceVertexShader()

    expect(shader).toContain('flat out vec3 vFaceNormal')
  })

  it('should have main function', () => {
    const shader = composeFaceVertexShader()

    expect(shader).toContain('void main()')
    expect(shader).toContain('gl_Position')
  })
})

describe('composeFaceVertexShaderScreenSpace', () => {
  it('should NOT include neighbor attribute declarations', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    expect(shader).not.toContain('aNeighbor1Pos')
    expect(shader).not.toContain('aNeighbor1Extra0_3')
    expect(shader).not.toContain('aNeighbor2Pos')
  })

  it('should NOT include transformNeighbor functions', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    expect(shader).not.toContain('transformNeighbor1')
    expect(shader).not.toContain('transformNeighbor2')
  })

  it('should NOT include computeFaceNormal', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    // The screen-space version computes normals in fragment shader
    expect(shader).not.toContain('computeFaceNormal')
  })

  it('should NOT output vFaceNormal varying', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    // Normal computed in fragment shader via dFdx/dFdy
    expect(shader).not.toContain('flat out vec3 vFaceNormal')
  })

  it('should output vWorldPosition for dFdx/dFdy', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    expect(shader).toContain('out vec3 vWorldPosition')
  })

  it('should include primary vertex attributes', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    expect(shader).toContain('aExtraDims0_3')
    expect(shader).toContain('aExtraDims4_6')
  })

  it('should have main function', () => {
    const shader = composeFaceVertexShaderScreenSpace()

    expect(shader).toContain('void main()')
    expect(shader).toContain('gl_Position')
  })
})

describe('composeFaceFragmentShader (geometry-based normals)', () => {
  it('should read vFaceNormal from vertex shader', () => {
    const { glsl } = composeFaceFragmentShader()

    expect(glsl).toContain('flat in vec3 vFaceNormal')
    expect(glsl).toContain('normalize(vFaceNormal)')
  })

  it('should NOT use dFdx/dFdy', () => {
    const { glsl } = composeFaceFragmentShader()

    expect(glsl).not.toContain('dFdx(vWorldPosition)')
    expect(glsl).not.toContain('dFdy(vWorldPosition)')
  })

  it('should include lighting modules', () => {
    const { modules } = composeFaceFragmentShader()

    expect(modules).toContain('Multi-Light System')
    expect(modules).toContain('Lighting (GGX)')
  })

  it('should handle shadow toggle', () => {
    const withShadows = composeFaceFragmentShader({ shadows: true })
    const withoutShadows = composeFaceFragmentShader({ shadows: false })

    expect(withShadows.glsl).toContain('#define USE_SHADOWS')
    expect(withoutShadows.glsl).not.toContain('#define USE_SHADOWS')
  })

  it('should handle SSS toggle', () => {
    const config: PolytopeShaderConfig = { sss: true }
    const { glsl, features } = composeFaceFragmentShader(config)

    expect(glsl).toContain('#define USE_SSS')
    expect(features).toContain('SSS')
  })

  it('should handle fresnel toggle', () => {
    const config: PolytopeShaderConfig = { fresnel: true }
    const { glsl, features } = composeFaceFragmentShader(config)

    expect(glsl).toContain('#define USE_FRESNEL')
    expect(features).toContain('Fresnel')
  })

  it('should output to MRT targets', () => {
    const { glsl } = composeFaceFragmentShader()

    expect(glsl).toContain('gColor')
    expect(glsl).toContain('gNormal')
    expect(glsl).toContain('gPosition')
  })
})

describe('composeFaceFragmentShaderScreenSpace', () => {
  it('should NOT read vFaceNormal', () => {
    const { glsl } = composeFaceFragmentShaderScreenSpace()

    expect(glsl).not.toContain('flat in vec3 vFaceNormal')
  })

  it('should use dFdx/dFdy for normal computation', () => {
    const { glsl } = composeFaceFragmentShaderScreenSpace()

    expect(glsl).toContain('dFdx(vWorldPosition)')
    expect(glsl).toContain('dFdy(vWorldPosition)')
    expect(glsl).toContain('cross(dPdx, dPdy)')
  })

  it('should include lighting modules', () => {
    const { modules } = composeFaceFragmentShaderScreenSpace()

    expect(modules).toContain('Multi-Light System')
    expect(modules).toContain('Lighting (GGX)')
  })

  it('should handle shadow toggle', () => {
    const withShadows = composeFaceFragmentShaderScreenSpace({ shadows: true })
    const withoutShadows = composeFaceFragmentShaderScreenSpace({ shadows: false })

    expect(withShadows.glsl).toContain('#define USE_SHADOWS')
    expect(withoutShadows.glsl).not.toContain('#define USE_SHADOWS')
  })

  it('should handle SSS toggle', () => {
    const config: PolytopeShaderConfig = { sss: true }
    const { glsl, features } = composeFaceFragmentShaderScreenSpace(config)

    expect(glsl).toContain('#define USE_SSS')
    expect(features).toContain('SSS')
  })

  it('should output to MRT targets', () => {
    const { glsl } = composeFaceFragmentShaderScreenSpace()

    expect(glsl).toContain('gColor')
    expect(glsl).toContain('gNormal')
    expect(glsl).toContain('gPosition')
  })

  it('should guard against degenerate triangles', () => {
    const { glsl } = composeFaceFragmentShaderScreenSpace()

    // Should have a length check for zero-area triangles
    // Uses tiny epsilon (1e-10) because dFdx/dFdy cross product is naturally small
    expect(glsl).toContain('normalLen > 1e-10')
  })
})

describe('composeEdgeVertexShader', () => {
  it('should include N-D transform', () => {
    const shader = composeEdgeVertexShader()

    expect(shader).toContain('transformND()')
    expect(shader).toContain('uRotationMatrix4D')
  })

  it('should NOT use neighbor data in main function', () => {
    const shader = composeEdgeVertexShader()

    // Edge shader uses full transformNDBlock (includes neighbor declarations for reuse)
    // but the main() function only calls transformND(), not transformNeighbor1/2
    // This is fine - unused attributes are optimized out by the GPU compiler
    const mainFunction = shader.substring(shader.lastIndexOf('void main()'))
    expect(mainFunction).not.toContain('transformNeighbor1')
    expect(mainFunction).not.toContain('transformNeighbor2')
  })
})

describe('composeEdgeFragmentShader', () => {
  it('should output to MRT targets', () => {
    const shader = composeEdgeFragmentShader()

    expect(shader).toContain('gColor')
    expect(shader).toContain('gNormal')
    expect(shader).toContain('gPosition')
  })

  it('should use uniform color', () => {
    const shader = composeEdgeFragmentShader()

    expect(shader).toContain('uniform vec3 uColor')
    expect(shader).toContain('uniform float uOpacity')
  })
})

describe('shader size comparison', () => {
  it('screen-space vertex shader should be smaller', () => {
    const geometryBased = composeFaceVertexShader()
    const screenSpace = composeFaceVertexShaderScreenSpace()

    // Screen-space version should be significantly smaller (no neighbor data)
    expect(screenSpace.length).toBeLessThan(geometryBased.length)
  })
})
