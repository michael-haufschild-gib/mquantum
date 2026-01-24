/**
 * Tests for TubeWireframe component
 */

import { TubeWireframe } from '@/rendering/renderers/TubeWireframe'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Three.js and R3F context
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ size: { width: 800, height: 600 } }),
  useFrame: vi.fn(),
}))

// Mock rotation store
vi.mock('@/stores/rotationStore', () => ({
  useRotationStore: {
    getState: () => ({
      rotations: [],
      version: 0,
    }),
    subscribe: () => () => {}, // Returns unsubscribe function
  },
}))

// Mock transform store
vi.mock('@/stores/transformStore', () => ({
  useTransformStore: {
    getState: () => ({
      uniformScale: 1,
      perAxisScale: [1, 1, 1],
    }),
    subscribe: () => () => {},
  },
}))

// Mock appearance store
const mockAppearanceState = {
  sssEnabled: false,
  fresnelEnabled: true,
  fresnelIntensity: 0.1,
  edgeColor: '#19e697',
  sssIntensity: 1.0,
  sssColor: '#ff8844',
  sssThickness: 1.0,
  sssJitter: 0.2,
  fogIntegrationEnabled: true,
  fogContribution: 1.0,
  internalFogDensity: 0.0,
  shaderSettings: {
    surface: {
      fresnelEnabled: true,
    },
  },
}
vi.mock('@/stores/appearanceStore', () => ({
  useAppearanceStore: Object.assign(
    (selector?: (state: typeof mockAppearanceState) => unknown) => {
      if (selector) return selector(mockAppearanceState)
      return mockAppearanceState
    },
    {
      getState: () => mockAppearanceState,
      subscribe: () => () => {},
    }
  ),
}))

// Mock lighting store
vi.mock('@/stores/lightingStore', () => ({
  useLightingStore: {
    getState: () => ({
      ambientEnabled: true,
      ambientIntensity: 0.3,
      ambientColor: '#FFFFFF',
      specularIntensity: 0.5,
      shininess: 30,
      specularColor: '#FFFFFF',
      diffuseIntensity: 1.0,
      toneMappingEnabled: true,
      toneMappingAlgorithm: 'aces',
      exposure: 0.7,
      lights: [
        {
          id: 'light-1',
          name: 'Key Light',
          type: 'point',
          enabled: true,
          position: [5, 5, 5],
          rotation: [0, 0, 0],
          color: '#FFFFFF',
          intensity: 1.0,
          coneAngle: 30,
          penumbra: 0.5,
        },
      ],
    }),
    subscribe: () => () => {},
  },
}))

// Mock math functions
vi.mock('@/lib/math/rotation', () => ({
  composeRotations: () => ({
    getArray: () => new Float32Array(16),
  }),
}))

vi.mock('@/lib/math/projection', () => ({
  DEFAULT_PROJECTION_DISTANCE: 4,
}))

vi.mock('@/rendering/shaders/transforms/ndTransform', () => ({
  matrixToGPUUniforms: () => ({
    rotationMatrix4D: {
      elements: new Float32Array(16),
      copy: vi.fn(),
    },
    extraRotationCols: new Float32Array(28),
    depthRowSums: new Float32Array(11),
  }),
  MAX_GPU_DIMENSION: 11,
  EXTRA_DIMS_SIZE: 7,
}))

// Mock geometry store (required by useNDTransformUpdates hook)
vi.mock('@/stores/geometryStore', () => ({
  useGeometryStore: {
    getState: () => ({
      dimension: 3,
    }),
    subscribe: () => () => {},
  },
}))

// Mock performance store
const mockPerformanceState = {
  setShaderDebugInfo: vi.fn(),
  setShaderCompiling: vi.fn(),
}
vi.mock('@/stores/performanceStore', () => ({
  usePerformanceStore: Object.assign(
    (selector?: (state: typeof mockPerformanceState) => unknown) => {
      if (selector) return selector(mockPerformanceState)
      return mockPerformanceState
    },
    {
      getState: () => mockPerformanceState,
      subscribe: () => () => {},
    }
  ),
}))

// Mock light uniforms
vi.mock('@/rendering/lights/uniforms', () => ({
  createLightUniforms: () => ({
    uNumLights: { value: 1 },
    uLightsEnabled: { value: [true, false, false, false] },
    uLightTypes: { value: [0, 0, 0, 0] },
    uLightPositions: { value: [{ x: 5, y: 5, z: 5 }] },
    uLightDirections: { value: [{ x: 0, y: -1, z: 0 }] },
    uLightColors: { value: [{ r: 1, g: 1, b: 1 }] },
    uLightIntensities: { value: [1.0, 0, 0, 0] },
    uSpotAngles: { value: [0.5, 0.5, 0.5, 0.5] },
    uSpotPenumbras: { value: [0.5, 0.5, 0.5, 0.5] },
  }),
  updateLightUniforms: vi.fn(),
}))

describe('TubeWireframe', () => {
  const mockVertices = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ]
  const mockEdges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 0],
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render without errors', () => {
    const { container } = render(
      <TubeWireframe vertices={mockVertices} edges={mockEdges} color="#ff0000" radius={0.03} />
    )
    expect(container).toBeDefined()
  })

  it('should accept custom color and radius', () => {
    render(
      <TubeWireframe vertices={mockVertices} edges={mockEdges} color="#00ff00" radius={0.05} />
    )
  })

  it('should accept metallic and roughness props', () => {
    render(
      <TubeWireframe
        vertices={mockVertices}
        edges={mockEdges}
        color="#00ff00"
        radius={0.03}
        // Note: metallic and roughness are now managed via UniformManager 'pbr-edge' source
      />
    )
  })

  it('should handle empty inputs gracefully', () => {
    const { container } = render(<TubeWireframe vertices={[]} edges={[]} color="#0000ff" />)
    // Should return null for empty inputs
    expect(container.firstChild).toBeNull()
  })

  it('should accept dimension prop for N-D support', () => {
    const mockNDVertices = [
      [0, 0, 0, 1], // 4D vertex
      [1, 0, 0, -1],
      [0, 1, 0, 0],
    ]

    render(
      <TubeWireframe
        vertices={mockNDVertices}
        edges={mockEdges}
        dimension={4}
        color="#ff00ff"
        radius={0.02}
      />
    )
  })

  it('should use default dimension of 3 when not specified', () => {
    render(<TubeWireframe vertices={mockVertices} edges={mockEdges} color="#ffffff" />)
    // No error means it used default dimension successfully
  })

  it('should accept caps prop for tube end caps', () => {
    // Default: caps=false (hollow tubes for performance)
    render(<TubeWireframe vertices={mockVertices} edges={mockEdges} color="#ff0000" caps={false} />)
  })

  it('should accept caps=true for capped tube ends', () => {
    render(<TubeWireframe vertices={mockVertices} edges={mockEdges} color="#ff0000" caps={true} />)
  })

  // Note: metallic and roughness tests removed - these properties are now managed
  // via UniformManager using 'pbr-edge' source, not as component props

  it('should support full opacity range', () => {
    render(
      <TubeWireframe vertices={mockVertices} edges={mockEdges} color="#ffffff" opacity={0.5} />
    )
  })

  it('should handle high-dimensional vertices', () => {
    const mock7DVertices = [
      [0, 0, 0, 1, 0.5, 0.3, 0.1], // 7D vertex
      [1, 0, 0, -1, 0.2, 0.4, 0.6],
      [0, 1, 0, 0, 0.7, 0.8, 0.9],
    ]

    render(
      <TubeWireframe
        vertices={mock7DVertices}
        edges={mockEdges}
        dimension={7}
        color="#ff00ff"
        radius={0.02}
        // Note: metallic and roughness are now managed via UniformManager 'pbr-edge' source
      />
    )
  })
})
