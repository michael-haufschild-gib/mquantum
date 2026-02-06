/**
 * Object Type Registry - The Single Source of Truth
 *
 * Central registry defining the Schroedinger object type with its capabilities,
 * constraints, and configurations.
 *
 * @see docs/plans/object-type-registry.md for architecture details
 */

import type { ObjectType } from '../types'
import type { ObjectTypeEntry, ObjectTypeRegistry } from './types'

/**
 * The Object Type Registry
 *
 * Contains complete metadata and capabilities for the Schroedinger object type.
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
