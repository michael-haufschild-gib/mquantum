/**
 * WebGPU WGSL Shader Compilation Tests
 *
 * Tests that all WebGPU shaders compose correctly and produce valid WGSL code.
 *
 * NOTE: This suite does NOT perform real GPU compilation. Vitest runs with a
 * mocked WebGPU context. Real WebGPU compilation would require a browser environment.
 * These tests verify the string composition produces syntactically correct WGSL.
 *
 * @module tests/rendering/webgpu/wgslCompilation.test
 */

import { describe, expect, it } from 'vitest'

// Import shader composers for each object type
import {
  composeMandelbulbShader,
  composeMandelbulbVertexShader,
} from '@/rendering/webgpu/shaders/mandelbulb/compose'
import {
  composeJuliaShader,
  composeJuliaVertexShader,
} from '@/rendering/webgpu/shaders/julia/compose'
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
} from '@/rendering/webgpu/shaders/schroedinger/compose'
import { composeDensityGridComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/compose'
import {
  composePolytopeTransformComputeShader,
  composePolytopeNormalComputeShader,
} from '@/rendering/webgpu/shaders/polytope/compute/compose'
import {
  composeFaceVertexShaderCompute,
  composeEdgeVertexShaderCompute,
} from '@/rendering/webgpu/shaders/polytope/compose'
import {
  composeBlackHoleShader,
  composeBlackHoleVertexShader,
} from '@/rendering/webgpu/shaders/blackhole/compose'
import {
  composeSkyboxFragmentShader,
  composeSkyboxVertexShader,
} from '@/rendering/webgpu/shaders/skybox/compose'
import {
  composeGroundPlaneFragmentShader,
  composeGroundPlaneVertexShader,
} from '@/rendering/webgpu/shaders/groundplane/compose'

/**
 * Removes comments from WGSL code for syntax checking.
 * This prevents false positives from GLSL terms mentioned in comments.
 * @param code
 */
function removeComments(code: string): string {
  // Remove single-line comments
  let result = code.replace(/\/\/.*$/gm, '')
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  return result
}

/**
 * Verifies that a shader string is valid WGSL syntax.
 * @param wgsl - The WGSL shader code to verify
 * @param isFragment - Whether this is a fragment shader (vs vertex)
 */
function verifyWgsl(wgsl: string, isFragment: boolean = true): void {
  expect(typeof wgsl).toBe('string')
  expect(wgsl.length).toBeGreaterThan(100)

  // Remove comments for syntax checking (GLSL terms may appear in comments)
  const codeWithoutComments = removeComments(wgsl)

  // WGSL syntax checks
  // Must use WGSL function syntax
  expect(wgsl).toMatch(/fn\s+\w+\s*\(/)

  // Must not contain GLSL-specific syntax (check code without comments)
  expect(codeWithoutComments).not.toContain('void main()')
  expect(codeWithoutComments).not.toContain('gl_FragColor')
  expect(codeWithoutComments).not.toMatch(/\bprecision\s+(highp|mediump|lowp)/)
  expect(codeWithoutComments).not.toMatch(/\bvarying\s+(highp|mediump|lowp|vec|mat|float|int)/)
  expect(codeWithoutComments).not.toMatch(/\battribute\s+(highp|mediump|lowp|vec|mat|float|int)/)
  expect(codeWithoutComments).not.toMatch(/\btexture2D\s*\(/)

  // Should have @group/@binding decorators for resources
  if (codeWithoutComments.includes('var<uniform>')) {
    expect(wgsl).toMatch(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)/)
  }

  // Fragment shaders should have @fragment entry point
  if (isFragment) {
    expect(wgsl).toMatch(/@fragment/)
  } else {
    expect(wgsl).toMatch(/@vertex/)
  }
}

/**
 * Verifies WGSL does not have common GLSL→WGSL porting mistakes.
 * Note: Many math functions (mod, clamp, etc.) are the same in both languages.
 * @param wgsl
 */
function verifyNoGlslLeakage(wgsl: string): void {
  // Note: mod() is valid in both GLSL and WGSL, so we don't check for it

  // GLSL atan(y, x) vs WGSL atan2(y, x)
  // Note: WGSL uses atan2, GLSL uses atan(y,x) for two-arg version
  // This check verifies we're using atan2 not atan(a,b) for two-argument calls
  // However, atan(x) with one arg is valid in WGSL
  // Match atan followed by ( and two args separated by comma (but not atan2)
  const atanTwoArgPattern = /\batan\s*\([^,)]+,[^)]+\)/g
  const matches = wgsl.match(atanTwoArgPattern)
  if (matches) {
    // Filter out atan2 calls which are correct
    const wrongAtanCalls = matches.filter((m) => !m.includes('atan2'))
    expect(wrongAtanCalls.length).toBe(0)
  }
}

/**
 * Verifies that a compute shader string is valid WGSL syntax.
 * @param wgsl - The WGSL compute shader code to verify
 */
function verifyWgslCompute(wgsl: string): void {
  expect(typeof wgsl).toBe('string')
  expect(wgsl.length).toBeGreaterThan(100)

  // Remove comments for syntax checking
  const codeWithoutComments = removeComments(wgsl)

  // WGSL syntax checks
  expect(wgsl).toMatch(/fn\s+\w+\s*\(/)

  // Must not contain GLSL-specific syntax
  expect(codeWithoutComments).not.toContain('void main()')
  expect(codeWithoutComments).not.toContain('gl_FragColor')
  expect(codeWithoutComments).not.toMatch(/\bprecision\s+(highp|mediump|lowp)/)
  expect(codeWithoutComments).not.toMatch(/\btexture2D\s*\(/)

  // Should have @group/@binding decorators for resources
  if (codeWithoutComments.includes('var<uniform>')) {
    expect(wgsl).toMatch(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)/)
  }

  // Compute shaders should have @compute entry point
  expect(wgsl).toMatch(/@compute/)

  // Should have @workgroup_size decorator
  expect(wgsl).toMatch(/@workgroup_size\s*\(\s*\d+/)

  // Should have texture_storage_3d for output
  expect(wgsl).toMatch(/texture_storage_3d/)
}

/**
 * Verifies that a storage buffer compute shader is valid WGSL syntax.
 * Unlike verifyWgslCompute, this doesn't require texture_storage_3d.
 * @param wgsl - The WGSL compute shader code to verify
 */
function verifyWgslStorageCompute(wgsl: string): void {
  expect(typeof wgsl).toBe('string')
  expect(wgsl.length).toBeGreaterThan(100)

  // Remove comments for syntax checking
  const codeWithoutComments = removeComments(wgsl)

  // WGSL syntax checks
  expect(wgsl).toMatch(/fn\s+\w+\s*\(/)

  // Must not contain GLSL-specific syntax
  expect(codeWithoutComments).not.toContain('void main()')
  expect(codeWithoutComments).not.toContain('gl_FragColor')
  expect(codeWithoutComments).not.toMatch(/\bprecision\s+(highp|mediump|lowp)/)
  expect(codeWithoutComments).not.toMatch(/\btexture2D\s*\(/)

  // Should have @group/@binding decorators for resources
  if (codeWithoutComments.includes('var<uniform>') || codeWithoutComments.includes('var<storage')) {
    expect(wgsl).toMatch(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)/)
  }

  // Compute shaders should have @compute entry point
  expect(wgsl).toMatch(/@compute/)

  // Should have @workgroup_size decorator
  expect(wgsl).toMatch(/@workgroup_size\s*\(\s*\d+/)

  // Should have storage buffer for input/output
  expect(wgsl).toMatch(/var<storage/)
}

describe('WGSL Shader Compilation - Mandelbulb', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeMandelbulbShader({
        dimension,
        shadows: false,
        temporal: false,
        ambientOcclusion: true,
        sss: false,
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeMandelbulbVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('composes shader with all features enabled', () => {
    const { wgsl, features } = composeMandelbulbShader({
      dimension: 4,
      shadows: true,
      temporal: true,
      ambientOcclusion: true,
      sss: true,
    })

    verifyWgsl(wgsl, true)

    // Feature flags should be reflected (ao is short for ambientOcclusion)
    expect(features.shadows).toBe(true)
    expect(features.temporal).toBe(true)
    expect(features.ao).toBe(true)
    expect(features.sss).toBe(true)
  })
})

describe('WGSL Shader Compilation - Quaternion Julia', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeJuliaShader({
        dimension,
        shadows: false,
        temporal: false,
        ambientOcclusion: true,
        sss: false,
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeJuliaVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })
})

describe('WGSL Shader Compilation - Schrödinger', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeSchroedingerShader({
        dimension,
        shadows: false,
        temporal: true,
        ambientOcclusion: false,
        sss: false,
        quantumMode: 'hydrogen',
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeSchroedingerVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('supports different quantum modes', () => {
    const modes = ['hydrogen', 'harmonicOscillator', 'hydrogenND'] as const

    for (const quantumMode of modes) {
      const { wgsl } = composeSchroedingerShader({
        dimension: 4,
        shadows: false,
        temporal: false,
        ambientOcclusion: false,
        sss: false,
        quantumMode,
      })

      verifyWgsl(wgsl, true)
    }
  })

  it('supports density grid acceleration mode', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      useDensityGrid: true,
    })

    verifyWgsl(wgsl, true)
    expect(features).toContain('Density Grid Compute')
    // Should include the grid sampling functions
    expect(wgsl).toContain('sampleDensityFromGrid')
    expect(wgsl).toContain('densityGridTex')
  })
})

describe('WGSL Shader Compilation - Schrödinger Density Grid Compute', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL compute shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeDensityGridComputeShader({
        dimension,
        quantumMode: 'harmonicOscillator',
      })

      verifyWgslCompute(wgsl)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
      expect(features).toContain('Density Grid Compute')
    })
  }

  it('supports different quantum modes', () => {
    const modes = ['harmonicOscillator', 'hydrogenOrbital', 'hydrogenND'] as const

    for (const quantumMode of modes) {
      const { wgsl } = composeDensityGridComputeShader({
        dimension: 4,
        quantumMode,
      })

      verifyWgslCompute(wgsl)
    }
  })

  it('supports unrolled HO superposition', () => {
    const termCounts = [1, 2, 3, 4, 5, 6, 7, 8] as const

    for (const termCount of termCounts) {
      const { wgsl, features } = composeDensityGridComputeShader({
        dimension: 4,
        quantumMode: 'harmonicOscillator',
        termCount,
      })

      verifyWgslCompute(wgsl)
      expect(features).toContain(`HO ${termCount}-term unrolled`)
    }
  })
})

describe('WGSL Shader Compilation - Polytope Transform Compute', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL compute shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composePolytopeTransformComputeShader({
        dimension,
      })

      verifyWgslStorageCompute(wgsl)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
      expect(features).toContain(`${dimension}D Transform Compute`)
    })
  }

  it('contains required transform structs', () => {
    const { wgsl } = composePolytopeTransformComputeShader({ dimension: 4 })

    // Should have input/output vertex structs
    expect(wgsl).toContain('struct NDVertex')
    expect(wgsl).toContain('struct TransformedVertex')

    // Should have compute params and transform uniforms
    expect(wgsl).toContain('struct ComputeParams')
    expect(wgsl).toContain('struct TransformUniforms')
  })

  it('contains N-D transform function', () => {
    const { wgsl } = composePolytopeTransformComputeShader({ dimension: 4 })

    // Should have the transform function
    expect(wgsl).toContain('fn transformNDCompute')

    // Should have rotation matrix application
    expect(wgsl).toContain('rotationMatrix4D')

    // Should have extra rotation columns for higher dimensions
    expect(wgsl).toContain('extraRotCols')

    // Should have depth row sums for projection
    expect(wgsl).toContain('depthRowSums')
  })

  it('uses storage buffers for input/output', () => {
    const { wgsl } = composePolytopeTransformComputeShader({ dimension: 4 })

    // Should have read-only input storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read>\s+inputVertices/)

    // Should have read-write output storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read_write>\s+outputVertices/)
  })
})

describe('WGSL Shader Compilation - Polytope Normal Compute', () => {
  it('composes WGSL compute shader', () => {
    const { wgsl, features } = composePolytopeNormalComputeShader()

    verifyWgslStorageCompute(wgsl)
    verifyNoGlslLeakage(wgsl)
    expect(features).toBeDefined()
    expect(features).toContain('Face Normal Compute')
  })

  it('composes WGSL compute shader with debug mode', () => {
    const { wgsl, features } = composePolytopeNormalComputeShader({ debug: true })

    verifyWgslStorageCompute(wgsl)
    verifyNoGlslLeakage(wgsl)
    expect(features).toContain('Debug Output')
  })

  it('contains required structs', () => {
    const { wgsl } = composePolytopeNormalComputeShader()

    // Should have compute params struct
    expect(wgsl).toContain('struct NormalComputeParams')

    // Should have input vertex struct
    expect(wgsl).toContain('struct TransformedVertex')

    // Should have triangle indices struct
    expect(wgsl).toContain('struct TriangleIndices')

    // Should have output normal struct
    expect(wgsl).toContain('struct FaceNormal')
  })

  it('contains face normal computation function', () => {
    const { wgsl } = composePolytopeNormalComputeShader()

    // Should have the compute face normal function
    expect(wgsl).toContain('fn computeFaceNormal')

    // Should use cross product for normal calculation
    expect(wgsl).toContain('cross(')

    // Should normalize the result (uses division by length, not normalize function)
    expect(wgsl).toContain('/ normalLen')

    // Should have epsilon check for degenerate triangles
    expect(wgsl).toContain('NORMAL_EPSILON') || expect(wgsl).toContain('0.0001')
  })

  it('uses storage buffers for input/output', () => {
    const { wgsl } = composePolytopeNormalComputeShader()

    // Should have read-only input storage buffer for vertices
    expect(wgsl).toMatch(/var<storage,\s*read>\s+vertices/)

    // Should have read-only input storage buffer for triangles
    expect(wgsl).toMatch(/var<storage,\s*read>\s+triangles/)

    // Should have read-write output storage buffer for normals
    expect(wgsl).toMatch(/var<storage,\s*read_write>\s+normals/)
  })

  it('has correct workgroup size', () => {
    const { wgsl } = composePolytopeNormalComputeShader()

    // Should have workgroup_size of 256
    expect(wgsl).toMatch(/@workgroup_size\s*\(\s*256/)
  })

  it('has bounds checking', () => {
    const { wgsl } = composePolytopeNormalComputeShader()

    // Should check triangle bounds
    expect(wgsl).toContain('params.triangleCount')

    // Should check vertex index bounds
    expect(wgsl).toContain('params.vertexCount')
  })

  it('has fallback normal for degenerate triangles', () => {
    const { wgsl } = composePolytopeNormalComputeShader()

    // Should have fallback normal constant
    expect(wgsl).toContain('FALLBACK_NORMAL')

    // Fallback should be (0, 0, 1)
    expect(wgsl).toMatch(/vec3f\s*\(\s*0\.0\s*,\s*0\.0\s*,\s*1\.0\s*\)/)
  })
})

describe('WGSL Shader Compilation - Polytope Compute-Accelerated Vertex Shaders', () => {
  it('composes face vertex shader for compute mode', () => {
    const wgsl = composeFaceVertexShaderCompute({ dimension: 5 })

    verifyWgsl(wgsl, false) // isFragment = false for vertex shader
    verifyNoGlslLeakage(wgsl)
  })

  it('composes edge vertex shader for compute mode', () => {
    const wgsl = composeEdgeVertexShaderCompute({ dimension: 5 })

    verifyWgsl(wgsl, false) // isFragment = false for vertex shader
    verifyNoGlslLeakage(wgsl)
  })

  it('face vertex shader reads from storage buffers', () => {
    const wgsl = composeFaceVertexShaderCompute({ dimension: 4 })

    // Should read from transformedVertices storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read>\s+transformedVertices/)

    // Should read from faceNormals storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read>\s+faceNormals/)

    // Should have TransformedVertex struct
    expect(wgsl).toContain('struct TransformedVertex')

    // Should have FaceNormal struct
    expect(wgsl).toContain('struct FaceNormal')
  })

  it('face vertex shader calculates face index from vertex index', () => {
    const wgsl = composeFaceVertexShaderCompute({ dimension: 4 })

    // Should calculate faceIndex = vertexIndex / 3
    expect(wgsl).toContain('vertexIndex / 3u')
  })

  it('face vertex shader outputs required varyings', () => {
    const wgsl = composeFaceVertexShaderCompute({ dimension: 4 })

    // Should output worldPosition
    expect(wgsl).toContain('worldPosition: vec3f')

    // Should output viewDir
    expect(wgsl).toContain('viewDir: vec3f')

    // Should output faceDepth (flat interpolated)
    expect(wgsl).toContain('faceDepth: f32')

    // Should output normal (flat interpolated)
    expect(wgsl).toContain('@interpolate(flat)')
    expect(wgsl).toContain('normal: vec3f')
  })

  it('edge vertex shader reads from storage buffers', () => {
    const wgsl = composeEdgeVertexShaderCompute({ dimension: 4 })

    // Should read from transformedVertices storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read>\s+transformedVertices/)

    // Should NOT read from faceNormals (edges don't need normals)
    expect(wgsl).not.toContain('faceNormals')
  })

  it('vertex shaders use correct bind groups', () => {
    const faceWgsl = composeFaceVertexShaderCompute({ dimension: 4 })
    const edgeWgsl = composeEdgeVertexShaderCompute({ dimension: 4 })

    // Group 0: Camera
    expect(faceWgsl).toContain('@group(0) @binding(0)')
    expect(edgeWgsl).toContain('@group(0) @binding(0)')

    // Group 3: Compute buffers
    expect(faceWgsl).toContain('@group(3) @binding(0)')
    expect(faceWgsl).toContain('@group(3) @binding(1)')
    expect(edgeWgsl).toContain('@group(3) @binding(0)')
  })
})

describe('WGSL Shader Compilation - Black Hole', () => {
  it('composes WGSL fragment shader', () => {
    const { wgsl, features } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).toBeDefined()
  })

  it('composes WGSL vertex shader', () => {
    const wgsl = composeBlackHoleVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('includes gravitational lensing uniforms', () => {
    const { wgsl } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    // Should have black hole specific uniforms
    expect(wgsl).toContain('horizonRadius')
    expect(wgsl).toContain('gravityStrength')
  })
})

describe('WGSL Shader Compilation - Skybox', () => {
  const modes = ['aurora', 'nebula', 'crystalline', 'horizon', 'ocean', 'twilight', 'classic'] as const

  for (const mode of modes) {
    it(`composes WGSL fragment shader for ${mode} mode`, () => {
      const { wgsl, features } = composeSkyboxFragmentShader({
        mode,
        effects: { sun: false, vignette: false },
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toContain(`Mode: ${mode}`)
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeSkyboxVertexShader({
      sun: false,
      vignette: false,
    })
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('supports sun and vignette effects', () => {
    const { wgsl, features } = composeSkyboxFragmentShader({
      mode: 'aurora',
      effects: { sun: true, vignette: true },
    })

    verifyWgsl(wgsl, true)
    expect(features).toContain('Sun Glow')
    expect(features).toContain('Vignette')
  })
})

describe('WGSL Shader Compilation - Ground Plane', () => {
  it('composes WGSL fragment shader', () => {
    const { wgsl, features } = composeGroundPlaneFragmentShader({
      shadows: true,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).toBeDefined()
    expect(features.length).toBeGreaterThan(0)
  })

  it('composes WGSL vertex shader', () => {
    const wgsl = composeGroundPlaneVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('supports shadow feature toggle', () => {
    const { wgsl: withShadows, features: featuresWithShadows } = composeGroundPlaneFragmentShader({
      shadows: true,
    })

    const { wgsl: withoutShadows, features: featuresWithoutShadows } = composeGroundPlaneFragmentShader({
      shadows: false,
    })

    // Both should be valid WGSL
    verifyWgsl(withShadows, true)
    verifyWgsl(withoutShadows, true)

    // Features arrays should reflect the configuration
    expect(featuresWithShadows).toContain('Shadow Maps')
    expect(featuresWithoutShadows).not.toContain('Shadow Maps')
  })
})

describe('WGSL Cross-Object Verification', () => {
  it('all object shaders produce unique output', () => {
    const shaders = [
      composeMandelbulbShader({ dimension: 4, shadows: false, temporal: false, ambientOcclusion: false, sss: false }).wgsl,
      composeJuliaShader({ dimension: 4, shadows: false, temporal: false, ambientOcclusion: false, sss: false }).wgsl,
      composeSchroedingerShader({ dimension: 4, shadows: false, temporal: false, ambientOcclusion: false, sss: false, quantumMode: 'hydrogen' }).wgsl,
      composeBlackHoleShader({ dimension: 3, shadows: false, temporal: false, ambientOcclusion: false }).wgsl,
    ]

    // All should be different
    const uniqueShaders = new Set(shaders)
    expect(uniqueShaders.size).toBe(shaders.length)
  })

  it('all vertex shaders are valid', () => {
    const vertexShaders = [
      composeMandelbulbVertexShader(),
      composeJuliaVertexShader(),
      composeSchroedingerVertexShader(),
      composeBlackHoleVertexShader(),
      composeSkyboxVertexShader({ sun: false, vignette: false }),
      composeGroundPlaneVertexShader(),
    ]

    for (const wgsl of vertexShaders) {
      verifyWgsl(wgsl, false)
      verifyNoGlslLeakage(wgsl)
    }
  })
})
