/**
 * Object Type Registry - The Single Source of Truth
 *
 * Central registry defining all object types with their capabilities,
 * constraints, and configurations.
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
 * what features are available.
 */
export const OBJECT_TYPE_REGISTRY: ObjectTypeRegistry = new Map<ObjectType, ObjectTypeEntry>([
  [
    'schroedinger',
    {
      type: 'schroedinger',
      name: 'Schrödinger Slices',
      description: 'Organic volumes from an N-dimensional wavefunction.',
      category: 'fractal',

      dimensions: {
        min: 2,
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
  [
    'pauliSpinor',
    {
      type: 'pauliSpinor',
      name: 'Pauli Spinor',
      description: 'Two-component spinor wavefunction in a magnetic field. Visualizes spin precession and Stern-Gerlach splitting.',
      category: 'fractal',

      dimensions: {
        min: 2,
        max: 11,
        recommended: 3,
        recommendedReason: '3D provides intuitive spin dynamics with magnetic field in physical space',
      },

      rendering: {
        supportsFaces: true,
        supportsEdges: true,
        supportsPoints: false,
        renderMethod: 'raymarch',
        faceDetection: 'none',
        requiresRaymarching: true,
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
                description: 'Slice movement range',
              },
            },
          },
        },
      },

      urlSerialization: {
        typeKey: 'pauliSpinor',
        serializableParams: [],
      },

      ui: {
        controlsComponentKey: 'PauliSpinorControls',
        hasTimelineControls: true,
        qualityPresets: ['draft', 'standard', 'high', 'ultra'],
      },

      configStoreKey: 'pauliSpinor',
    },
  ],
])
