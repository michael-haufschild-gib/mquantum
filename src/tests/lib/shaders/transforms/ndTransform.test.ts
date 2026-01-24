import { describe, it, expect } from 'vitest'
import { Matrix4 } from 'three'
import {
  matrixToGPUUniforms,
  generateNDTransformVertexShader,
  generateNDTransformFragmentShader,
  createNDTransformUniforms,
  updateNDTransformUniforms,
} from '@/rendering/shaders/transforms/ndTransform'
import { createIdentityMatrix, createRotationMatrix } from '@/lib/math'
import { fcos, fsin } from '@/lib/math/trig'

describe('ndTransform', () => {
  describe('matrixToGPUUniforms', () => {
    it('should convert 3D identity matrix correctly', () => {
      const matrix = createIdentityMatrix(3)
      const result = matrixToGPUUniforms(matrix, 3)

      expect(result.dimension).toBe(3)
      expect(result.rotationMatrix4D).toBeInstanceOf(Matrix4)

      // Check that it's an identity matrix (with padding for 4th dimension)
      const elements = result.rotationMatrix4D.elements
      expect(elements[0]).toBe(1) // [0,0]
      expect(elements[5]).toBe(1) // [1,1]
      expect(elements[10]).toBe(1) // [2,2]
      expect(elements[15]).toBe(1) // [3,3] padding
    })

    it('should convert 4D identity matrix correctly', () => {
      const matrix = createIdentityMatrix(4)
      const result = matrixToGPUUniforms(matrix, 4)

      expect(result.dimension).toBe(4)

      const elements = result.rotationMatrix4D.elements
      expect(elements[0]).toBe(1)
      expect(elements[5]).toBe(1)
      expect(elements[10]).toBe(1)
      expect(elements[15]).toBe(1)
    })

    it('should convert 4D rotation matrix correctly', () => {
      const matrix = createRotationMatrix(4, 0, 1, Math.PI / 4) // XY rotation
      const result = matrixToGPUUniforms(matrix, 4)

      expect(result.dimension).toBe(4)

      // Use fcos/fsin to match what createRotationMatrix uses (fast trig approximations)
      const cos45 = fcos(Math.PI / 4)
      const sin45 = fsin(Math.PI / 4)

      // Column-major order for Three.js
      const elements = result.rotationMatrix4D.elements
      expect(elements[0]).toBeCloseTo(cos45) // [0,0]
      expect(elements[1]).toBeCloseTo(sin45) // [1,0]
      expect(elements[4]).toBeCloseTo(-sin45) // [0,1]
      expect(elements[5]).toBeCloseTo(cos45) // [1,1]
    })

    it('should handle 5D matrix with extra data', () => {
      const matrix = createIdentityMatrix(5)
      const result = matrixToGPUUniforms(matrix, 5)

      expect(result.dimension).toBe(5)
      expect(result.extraRotationData.length).toBeGreaterThan(0)
    })

    it('should handle 11D matrix (max dimension)', () => {
      const matrix = createIdentityMatrix(11)
      const result = matrixToGPUUniforms(matrix, 11)

      expect(result.dimension).toBe(11)
      expect(result.extraRotationData.length).toBeGreaterThan(0)
    })

    it('should correctly compute extraRotationCols for 5D XV rotation', () => {
      // Create a 5D rotation in the XV plane (indices 0 and 4)
      const angle = Math.PI / 4 // 45 degrees
      const matrix = createRotationMatrix(5, 0, 4, angle)
      const result = matrixToGPUUniforms(matrix, 5)

      // Use fsin to match what createRotationMatrix uses (fast trig approximations)
      const sin45 = fsin(angle)

      // extraRotationCols should contain matrix[row][col] for row=0..3, col=4
      // extraRotationCols[0] = matrix[0][4] = -sin(45)
      // extraRotationCols[1] = matrix[1][4] = 0
      // extraRotationCols[2] = matrix[2][4] = 0
      // extraRotationCols[3] = matrix[3][4] = 0
      expect(result.extraRotationCols[0]).toBeCloseTo(-sin45)
      expect(result.extraRotationCols[1]).toBeCloseTo(0)
      expect(result.extraRotationCols[2]).toBeCloseTo(0)
      expect(result.extraRotationCols[3]).toBeCloseTo(0)
    })

    it('should correctly compute depthRowSums for 5D XV rotation', () => {
      // Create a 5D rotation in the XV plane (indices 0 and 4)
      const angle = Math.PI / 4
      const matrix = createRotationMatrix(5, 0, 4, angle)
      const result = matrixToGPUUniforms(matrix, 5)

      // Use fcos/fsin to match what createRotationMatrix uses (fast trig approximations)
      const cos45 = fcos(angle)
      const sin45 = fsin(angle)

      // depthRowSums[j] = sum of matrix[i][j] for i >= 4
      // For XV rotation, matrix[4][0] = sin(45), matrix[4][4] = cos(45)
      // depthRowSums[0] = matrix[4][0] = sin(45)
      // depthRowSums[4] = matrix[4][4] = cos(45)
      expect(result.depthRowSums[0]).toBeCloseTo(sin45)
      expect(result.depthRowSums[1]).toBeCloseTo(0)
      expect(result.depthRowSums[2]).toBeCloseTo(0)
      expect(result.depthRowSums[3]).toBeCloseTo(0)
      expect(result.depthRowSums[4]).toBeCloseTo(cos45)
    })

    it('should produce correct GPU transformation for 5D XV rotation', () => {
      // Verify: GPU transformation matches CPU for a specific 5D point
      const angle = Math.PI / 4
      const matrix = createRotationMatrix(5, 0, 4, angle)
      const gpuData = matrixToGPUUniforms(matrix, 5)

      // Input point: [1, 0, 0, 0, 1] (x=1, v=1)
      const input = [1, 0, 0, 0, 1]
      // Use fcos/fsin to match what createRotationMatrix uses (fast trig approximations)
      const cos45 = fcos(angle)
      const sin45 = fsin(angle)

      // Expected CPU result:
      // rotated[0] = cos*1 + (-sin)*1 = cos - sin ≈ 0
      // rotated[4] = sin*1 + cos*1 = sin + cos ≈ 1.414
      const expectedX = cos45 * 1 + -sin45 * 1
      const expectedRotated4 = sin45 * 1 + cos45 * 1

      // Simulate GPU calculation:
      // 1. Apply 4x4 matrix to first 4 dims
      const mat4Elements = gpuData.rotationMatrix4D.elements
      // Three.js uses column-major: elements[col*4 + row]
      const rotated4x4_x =
        mat4Elements[0] * input[0]! +
        mat4Elements[4] * input[1]! +
        mat4Elements[8] * input[2]! +
        mat4Elements[12] * input[3]!

      // 2. Add contribution from extra dim (input[4])
      const gpuRotatedX = rotated4x4_x + gpuData.extraRotationCols[0]! * input[4]!

      // 3. Compute depth from depthRowSums
      const gpuDepth = gpuData.depthRowSums[0]! * input[0]! + gpuData.depthRowSums[4]! * input[4]!

      expect(gpuRotatedX).toBeCloseTo(expectedX)
      expect(gpuDepth).toBeCloseTo(expectedRotated4)
    })

    it('should correctly handle 9D rotation in multiple planes', () => {
      // Create a composed 9D rotation in XY and VA8 planes
      const matrix = createIdentityMatrix(9)
      const dim = 9
      const angle = Math.PI / 6 // 30 degrees
      const cos30 = Math.cos(angle)
      const sin30 = Math.sin(angle)

      // Apply XY rotation (indices 0,1) using flat row-major indexing
      matrix[0 * dim + 0] = cos30
      matrix[0 * dim + 1] = -sin30
      matrix[1 * dim + 0] = sin30
      matrix[1 * dim + 1] = cos30

      // Apply VA8 rotation (indices 4,8)
      matrix[4 * dim + 4] = cos30
      matrix[4 * dim + 8] = -sin30
      matrix[8 * dim + 4] = sin30
      matrix[8 * dim + 8] = cos30

      const result = matrixToGPUUniforms(matrix, 9)

      // Verify 4x4 block contains XY rotation
      const mat4 = result.rotationMatrix4D.elements
      expect(mat4[0]).toBeCloseTo(cos30) // [0,0]
      expect(mat4[1]).toBeCloseTo(sin30) // [1,0]
      expect(mat4[4]).toBeCloseTo(-sin30) // [0,1]
      expect(mat4[5]).toBeCloseTo(cos30) // [1,1]

      // Verify extraRotationCols contains VA8 rotation column
      // extraRotationCols for extraIdx=4 (dimension 9, index 8) would be at offset 4*4=16
      // matrix[0][8], matrix[1][8], matrix[2][8], matrix[3][8] should all be 0
      expect(result.extraRotationCols[16]).toBeCloseTo(0)
      expect(result.extraRotationCols[17]).toBeCloseTo(0)

      // depthRowSums[4] should include matrix[4][4] + matrix[8][4] = cos30 + sin30
      // (since both rows 4 and 8 have non-zero values in column 4)
      expect(result.depthRowSums[4]).toBeCloseTo(cos30 + sin30)
    })
  })

  describe('generateNDTransformVertexShader', () => {
    it('should generate valid GLSL code', () => {
      const shader = generateNDTransformVertexShader()

      // Uniforms have 'u' prefix for Three.js convention
      expect(shader).toContain('uniform mat4 uRotationMatrix4D')
      expect(shader).toContain('uniform int uDimension')
      expect(shader).toContain('void main()')
      expect(shader).toContain('gl_Position')
    })

    it('should include extra dimension attributes', () => {
      const shader = generateNDTransformVertexShader()

      // Attributes have 'a' prefix for Three.js convention (using GLSL ES 3.00 'in' keyword)
      expect(shader).toContain('in float aExtraDim0')
      expect(shader).toContain('in float aExtraDim1')
    })

    it('should support custom max dimension', () => {
      const shader = generateNDTransformVertexShader(6)

      expect(shader).toContain('Supports dimensions 3 to 6')
    })
  })

  describe('generateNDTransformFragmentShader', () => {
    it('should generate valid GLSL ES 3.00 code', () => {
      const shader = generateNDTransformFragmentShader()

      expect(shader).toContain('uniform vec3 uColor')
      expect(shader).toContain('uniform float uOpacity')
      expect(shader).toContain('void main()')
      // WebGL2 GLSL ES 3.00 uses layout out declaration instead of gl_FragColor
      expect(shader).toContain('layout(location = 0) out vec4 fragColor')
      expect(shader).toContain('fragColor = vec4(color, uOpacity)')
      expect(shader).not.toContain('gl_FragColor')
    })
  })

  describe('createNDTransformUniforms', () => {
    it('should create all required uniforms', () => {
      const uniforms = createNDTransformUniforms(4)

      expect(uniforms.rotationMatrix4D).toBeDefined()
      expect(uniforms.uDimension).toBeDefined()
      // Scale is now applied AFTER projection (like camera zoom)
      expect(uniforms.uUniformScale).toBeDefined()
      expect(uniforms.uExtraRotationCols).toBeDefined()
      expect(uniforms.uDepthRowSums).toBeDefined()
      expect(uniforms.uProjectionDistance).toBeDefined()
      expect(uniforms.uColor).toBeDefined()
      expect(uniforms.uOpacity).toBeDefined()
    })

    it('should initialize dimension correctly', () => {
      const uniforms = createNDTransformUniforms(5)
      expect(uniforms.uDimension!.value).toBe(5)
    })

    it('should initialize uniform scale to 1 (applied after projection)', () => {
      const uniforms = createNDTransformUniforms(4)
      expect(uniforms.uUniformScale!.value).toBe(1.0)
    })
  })

  describe('updateNDTransformUniforms', () => {
    it('should update rotation matrix', () => {
      const uniforms = createNDTransformUniforms(4)
      const rotationMatrix = createRotationMatrix(4, 0, 1, Math.PI / 2)

      updateNDTransformUniforms(
        uniforms,
        rotationMatrix,
        4,
        1.0, // uniformScale (applied after projection)
        5.0 // projectionDistance
      )

      expect(uniforms.rotationMatrix4D!.value).toBeInstanceOf(Matrix4)
      expect(uniforms.uDimension!.value).toBe(4)
    })

    it('should update uniform scale (applied after projection like camera zoom)', () => {
      const uniforms = createNDTransformUniforms(6)
      const rotationMatrix = createIdentityMatrix(6)

      updateNDTransformUniforms(
        uniforms,
        rotationMatrix,
        6,
        2.5, // uniformScale
        5.0 // projectionDistance
      )

      // Uniform scale is now a single value applied after projection
      expect(uniforms.uUniformScale!.value).toBe(2.5)
    })

    it('should update projection distance', () => {
      const uniforms = createNDTransformUniforms(4)
      const rotationMatrix = createIdentityMatrix(4)

      updateNDTransformUniforms(
        uniforms,
        rotationMatrix,
        4,
        1.0, // uniformScale
        10.0 // projectionDistance
      )

      expect(uniforms.uProjectionDistance!.value).toBe(10.0)
    })
  })
})
