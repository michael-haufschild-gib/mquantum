/**
 * Object Type Registry - The Single Source of Truth
 *
 * Central registry defining all object types with their capabilities,
 * constraints, and configurations. To add a new object type:
 *
 * 1. Add entry to OBJECT_TYPE_REGISTRY below
 * 2. Add type to ObjectType union in ../types.ts
 * 3. Create controls component
 * 4. Create renderer (if new render method)
 *
 * @see docs/plans/object-type-registry.md for architecture details
 */

import type { ObjectType } from '../types'
import type { ObjectTypeEntry, ObjectTypeRegistry } from './types'

/**
 * The Object Type Registry
 *
 * Contains complete metadata and capabilities for all object types.
 * Used by UI components, renderers, and serializers to determine
 * what features are available for each type.
 */
export const OBJECT_TYPE_REGISTRY: ObjectTypeRegistry = new Map<ObjectType, ObjectTypeEntry>([
  // ============================================================================
  // POLYTOPES
  // ============================================================================

  [
    'hypercube',
    {
      type: 'hypercube',
      name: 'Hypercube',
      description: 'Generalization of a cube to n dimensions (n-cube)',
      category: 'polytope',

      dimensions: {
        min: 3,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'analytical-quad',
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'hypercube',
        serializableParams: ['scale'],
      },

      ui: {
        controlsComponentKey: 'PolytopeSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'polytope',
    },
  ],

  [
    'simplex',
    {
      type: 'simplex',
      name: 'Simplex',
      description: 'Generalization of a tetrahedron to n dimensions (n-simplex)',
      category: 'polytope',

      dimensions: {
        min: 3,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'triangles',
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'simplex',
        serializableParams: ['scale'],
      },

      ui: {
        controlsComponentKey: 'PolytopeSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'polytope',
    },
  ],

  [
    'cross-polytope',
    {
      type: 'cross-polytope',
      name: 'Cross-Polytope',
      description: 'Generalization of an octahedron to n dimensions (n-orthoplex)',
      category: 'polytope',

      dimensions: {
        min: 3,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'triangles',
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'cross-polytope',
        serializableParams: ['scale'],
      },

      ui: {
        controlsComponentKey: 'PolytopeSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'polytope',
    },
  ],

  [
    'wythoff-polytope',
    {
      type: 'wythoff-polytope',
      name: 'Wythoff Polytope',
      description: 'Uniform polytopes via Wythoff kaleidoscopic construction',
      category: 'polytope',

      dimensions: {
        min: 3,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'metadata-or-triangles', // Regular preset has pre-computed faces; others fall back to triangles
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'wythoff-polytope',
        serializableParams: ['symmetryGroup', 'preset', 'scale', 'snub'],
      },

      ui: {
        controlsComponentKey: 'WythoffPolytopeSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'wythoffPolytope',
    },
  ],

  // ============================================================================
  // EXTENDED OBJECTS
  // ============================================================================

  [
    'root-system',
    {
      type: 'root-system',
      name: 'Root System',
      description: 'Root polytopes from Lie algebra (A, D, or E8)',
      category: 'extended',

      dimensions: {
        min: 3,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'metadata', // Pre-computed faces from 3-cycle detection (was: convex-hull)
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'root-system',
        serializableParams: ['rootType', 'scale'],
      },

      ui: {
        controlsComponentKey: 'RootSystemSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'rootSystem',
    },
  ],

  [
    'clifford-torus',
    {
      type: 'clifford-torus',
      name: 'Clifford Torus',
      description: 'Flat torus with independent circles (3D: torus, 4D+: Clifford)',
      category: 'extended',

      dimensions: {
        min: 3,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'grid',
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'clifford-torus',
        serializableParams: ['radius', 'edgeMode', 'mode', 'resolutionU', 'resolutionV'],
      },

      ui: {
        controlsComponentKey: 'CliffordTorusSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'cliffordTorus',
    },
  ],

  [
    'nested-torus',
    {
      type: 'nested-torus',
      name: 'Nested Torus',
      description: 'Coupled tori with Hopf-like structure (4D: Hopf fibration, 5D-11D: n-tori)',
      category: 'extended',

      dimensions: {
        min: 4,
        max: 11,
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: true,
        renderMethod: 'polytope',
        faceDetection: 'grid',
      },

      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'nested-torus',
        serializableParams: ['radius', 'eta', 'resolutionXi1', 'resolutionXi2'],
      },

      ui: {
        controlsComponentKey: 'NestedTorusSettings',
        hasTimelineControls: false,
      },

      configStoreKey: 'nestedTorus',
    },
  ],

  // ============================================================================
  // FRACTALS
  // ============================================================================

  [
    'mandelbulb',
    {
      type: 'mandelbulb',
      name: 'Mandelbulb',
      description: 'Fractal via escape-time iteration (3D: Mandelbulb, 4D+: Mandelbulb)',
      category: 'fractal',

      dimensions: {
        min: 3,
        max: 11,
        recommended: 4,
        recommendedReason: '4D Mandelbulb provides best balance of detail and performance',
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: false,
        renderMethod: 'raymarch',
        faceDetection: 'none',
        requiresRaymarching: true,
        edgesAreFresnelRim: true,
      },

      animation: {
        hasTypeSpecificAnimations: true,
        systems: {
          powerAnimation: {
            name: 'Power Animation',
            description: 'Animates the mandelbulbPower parameter for dramatic morphing',
            enabledByDefault: false,
            enabledKey: 'powerAnimationEnabled',
            params: {
              powerMin: {
                min: 2.0,
                max: 10.0,
                default: 5.0,
                step: 0.5,
                label: 'Min Power',
                description: 'Lower values create more "blobby" shapes',
              },
              powerMax: {
                min: 4.0,
                max: 24.0,
                default: 12.0,
                step: 0.5,
                label: 'Max Power',
                description: 'Higher values create more detailed, spiky shapes',
              },
              powerSpeed: {
                min: 0.01,
                max: 0.2,
                default: 0.03,
                step: 0.01,
                label: 'Speed',
                description: 'Animation speed (lower = slower, more dramatic)',
              },
            },
          },

          alternatePower: {
            name: 'Alternate Power',
            description: 'Uses different power values for even/odd iterations',
            enabledByDefault: false,
            enabledKey: 'alternatePowerEnabled',
            params: {
              alternatePowerValue: {
                min: 2.0,
                max: 16.0,
                default: 4.0,
                step: 0.5,
                label: 'Alt Power',
                description: 'Power value for odd iterations',
              },
              alternatePowerBlend: {
                min: 0.0,
                max: 1.0,
                default: 0.5,
                step: 0.05,
                label: 'Blend',
                description: '0 = base power only, 1 = fully alternate on odd',
              },
            },
          },

          sliceAnimation: {
            name: 'Slice Animation',
            description: 'Animates which 3D cross-section is visible (4D+ only)',
            enabledByDefault: false,
            minDimension: 4,
            enabledKey: 'sliceAnimationEnabled',
            params: {
              sliceSpeed: {
                min: 0.01,
                max: 0.1,
                default: 0.02,
                step: 0.01,
                label: 'Speed',
                description: 'Speed of slice movement',
              },
              sliceAmplitude: {
                min: 0.1,
                max: 1.0,
                default: 0.3,
                step: 0.05,
                label: 'Amplitude',
                description: 'How far the slice moves in each extra dimension',
              },
            },
          },

          phaseShifts: {
            name: 'Phase Shifts',
            description: 'Angular phase animation creating twisting/spiraling morphs',
            enabledByDefault: false,
            enabledKey: 'phaseShiftEnabled',
            params: {
              phaseSpeed: {
                min: 0.01,
                max: 0.2,
                default: 0.03,
                step: 0.01,
                label: 'Speed',
                description: 'How fast the phase angles change',
              },
              phaseAmplitude: {
                min: 0.0,
                max: 0.785, // PI/4
                default: 0.3,
                step: 0.01,
                label: 'Amplitude',
                description: 'Maximum phase shift in radians',
              },
            },
          },
        },
      },

      urlSerialization: {
        typeKey: 'mandelbulb',
        serializableParams: ['maxIterations', 'escapeRadius', 'resolution', 'mandelbulbPower'],
      },

      ui: {
        controlsComponentKey: 'MandelbulbControls',
        hasTimelineControls: true,
        qualityPresets: ['draft', 'standard', 'high', 'ultra'],
      },

      configStoreKey: 'mandelbulb',
    },
  ],

  [
    'quaternion-julia',
    {
      type: 'quaternion-julia',
      name: 'Quaternion Julia',
      description: 'Julia set fractal using quaternion algebra (z = z^n + c)',
      category: 'fractal',

      dimensions: {
        min: 3,
        max: 11,
        recommended: 4,
        recommendedReason: '4D provides authentic quaternion math without approximations',
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: false,
        renderMethod: 'raymarch',
        faceDetection: 'none',
        requiresRaymarching: true,
        edgesAreFresnelRim: true,
      },

      // NOTE: Julia fractals have no type-specific animations.
      // Smooth shape morphing is achieved via 4D+ rotation (handled by the rotation system).
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },

      urlSerialization: {
        typeKey: 'quaternion-julia',
        serializableParams: ['juliaConstant', 'power', 'maxIterations', 'bailoutRadius'],
      },

      ui: {
        controlsComponentKey: 'QuaternionJuliaControls',
        hasTimelineControls: false,
        qualityPresets: ['draft', 'standard', 'high', 'ultra'],
      },

      configStoreKey: 'quaternionJulia',
    },
  ],

  [
    'schroedinger',
    {
      type: 'schroedinger',
      name: 'Schrödinger Slices',
      description: 'Organic volumes from an N-dimensional wavefunction.',
      category: 'fractal',

      dimensions: {
        min: 3,
        max: 11,
        recommended: 4,
        recommendedReason: '4D provides rich quantum interference patterns with good performance',
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: false,
        renderMethod: 'raymarch',
        faceDetection: 'none',
        requiresRaymarching: true,
        edgesAreFresnelRim: true,
        supportsEmission: true,
      },

      animation: {
        hasTypeSpecificAnimations: true,
        systems: {
          sliceAnimation: {
            name: 'Slice Animation',
            description: 'Animate through higher-dimensional slices (4D+ only)',
            enabledByDefault: false,
            minDimension: 4,
            enabledKey: 'sliceAnimationEnabled',
            params: {
              sliceSpeed: {
                min: 0.01,
                max: 0.1,
                default: 0.02,
                step: 0.01,
                label: 'Speed',
                description: 'Speed of slice movement',
              },
              sliceAmplitude: {
                min: 0.1,
                max: 1.0,
                default: 0.3,
                step: 0.05,
                label: 'Amplitude',
                description: 'How far the slice moves in each extra dimension',
              },
            },
          },

          spreadAnimation: {
            name: 'Wavepacket Dispersion',
            description: 'Animates the frequency spread (breathing effect)',
            enabledByDefault: false,
            enabledKey: 'spreadAnimationEnabled',
            params: {
              spreadAnimationSpeed: {
                min: 0.1,
                max: 2.0,
                default: 0.5,
                step: 0.1,
                label: 'Speed',
                description: 'Speed of dispersion breathing',
              },
            },
          },

          flowAnimation: {
            name: 'Animated Flow',
            description: 'Curl noise turbulence flow',
            enabledByDefault: false,
            enabledKey: 'curlEnabled',
            params: {
              curlStrength: {
                min: 0.0,
                max: 1.0,
                default: 0.3,
                step: 0.05,
                label: 'Strength',
              },
              curlSpeed: {
                min: 0.1,
                max: 5.0,
                default: 1.0,
                step: 0.1,
                label: 'Speed',
              },
            },
          },
        },
      },

      urlSerialization: {
        typeKey: 'schroedinger',
        serializableParams: ['presetName', 'seed', 'termCount', 'timeScale', 'sampleCount'],
      },

      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: ['draft', 'standard', 'high', 'ultra'],
      },

      configStoreKey: 'schroedinger',
    },
  ],

  // ============================================================================
  // ASTROPHYSICAL OBJECTS
  // ============================================================================

  [
    'blackhole',
    {
      type: 'blackhole',
      name: 'Black Hole',
      description: 'N-dimensional black hole with gravitational lensing and accretion disk',
      category: 'extended',

      dimensions: {
        min: 3,
        max: 11,
        recommended: 4,
        recommendedReason: '4D provides rich cross-section slicing of higher-D manifold',
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: false,
        renderMethod: 'raymarch',
        faceDetection: 'none',
        requiresRaymarching: true,
        edgesAreFresnelRim: true,
        supportsEmission: false,
      },

      animation: {
        hasTypeSpecificAnimations: true,
        systems: {
          swirlAnimation: {
            name: 'Accretion Swirl',
            description: 'Rotating spiral motion of the accretion disk',
            enabledByDefault: false,
            enabledKey: 'swirlAnimationEnabled',
            params: {
              swirlAnimationSpeed: {
                min: 0.0,
                max: 2.0,
                default: 0.5,
                step: 0.1,
                label: 'Speed',
                description: 'Rotation speed of the accretion disk',
              },
            },
          },

          pulseAnimation: {
            name: 'Manifold Pulse',
            description: 'Breathing/pulsing intensity of the accretion manifold',
            enabledByDefault: false,
            enabledKey: 'pulseEnabled',
            params: {
              pulseSpeed: {
                min: 0.0,
                max: 2.0,
                default: 0.3,
                step: 0.1,
                label: 'Speed',
                description: 'Pulse frequency',
              },
              pulseAmount: {
                min: 0.0,
                max: 1.0,
                default: 0.2,
                step: 0.05,
                label: 'Amount',
                description: 'Intensity variation amplitude',
              },
            },
          },

          sliceAnimation: {
            name: 'Slice Animation',
            description: 'Animate through higher-dimensional slices (4D+ only)',
            enabledByDefault: false,
            minDimension: 4,
            enabledKey: 'sliceAnimationEnabled',
            params: {
              sliceSpeed: {
                min: 0.01,
                max: 0.1,
                default: 0.02,
                step: 0.01,
                label: 'Speed',
                description: 'Speed of slice movement',
              },
              sliceAmplitude: {
                min: 0.1,
                max: 1.0,
                default: 0.3,
                step: 0.05,
                label: 'Amplitude',
                description: 'How far the slice moves in each extra dimension',
              },
            },
          },
        },
      },

      urlSerialization: {
        typeKey: 'blackhole',
        serializableParams: [
          'horizonRadius',
          'gravityStrength',
          'manifoldIntensity',
          'manifoldThickness',
          'visualPreset',
        ],
      },

      ui: {
        controlsComponentKey: 'BlackHoleControls',
        hasTimelineControls: true,
        qualityPresets: ['fast', 'balanced', 'quality', 'ultra'],
      },

      configStoreKey: 'blackhole',
    },
  ],
])

/**
 * Get all object types as an array (for iteration)
 * @returns Array of all registered object types
 */
export function getAllObjectTypes(): ObjectType[] {
  return Array.from(OBJECT_TYPE_REGISTRY.keys())
}

/**
 * Get all registry entries as an array (for iteration)
 * @returns Array of all registry entries
 */
export function getAllRegistryEntries(): ObjectTypeEntry[] {
  return Array.from(OBJECT_TYPE_REGISTRY.values())
}
