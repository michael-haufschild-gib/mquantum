/**
 * URL State Serializer
 * Serializes and deserializes scene name or object type params to/from URL.
 */

import { isValidObjectType } from '@/lib/geometry/registry'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import type { ObjectType } from '@/lib/geometry/types'
import { MAX_DIMENSION, MIN_DIMENSION } from '@/stores/geometryStore'

/** Valid quantum modes for URL validation */
const VALID_QUANTUM_MODES: SchroedingerQuantumMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'freeScalarField',
  'tdseDynamics',
]

/**
 * URL-shareable subset of application state.
 * Either a scene name or object type + dimension + quantum mode.
 */
export interface ShareableState {
  dimension: number
  objectType: ObjectType
  quantumMode?: SchroedingerQuantumMode
  /** Scene preset name (case-insensitive lookup, mutually exclusive with other params) */
  scene?: string
}

/**
 * Serializes state to URL search params.
 * @param state - The state to serialize
 * @returns URL search params string
 */
export function serializeState(state: ShareableState): string {
  const params = new URLSearchParams()

  params.set('d', state.dimension.toString())
  params.set('t', state.objectType)
  if (state.quantumMode && state.quantumMode !== 'harmonicOscillator') {
    params.set('qm', state.quantumMode)
  }

  return params.toString()
}

/**
 * Deserializes state from URL search params.
 * @param searchParams - URL search params string
 * @returns Partial state object
 */
export function deserializeState(searchParams: string): Partial<ShareableState> {
  const params = new URLSearchParams(searchParams)
  const state: Partial<ShareableState> = {}

  // Scene parameter (mutually exclusive with other params)
  const sceneParam = params.get('scene')
  if (sceneParam) {
    const trimmed = sceneParam.trim()
    if (trimmed) {
      state.scene = trimmed
      return state
    }
  }

  const dimension = params.get('d')
  if (dimension) {
    const dim = parseInt(dimension, 10)
    if (dim >= MIN_DIMENSION && dim <= MAX_DIMENSION) {
      state.dimension = dim
    }
  }

  const objectType = params.get('t')
  if (objectType && isValidObjectType(objectType)) {
    state.objectType = objectType
  }

  const quantumMode = params.get('qm')
  if (quantumMode && VALID_QUANTUM_MODES.includes(quantumMode as SchroedingerQuantumMode)) {
    state.quantumMode = quantumMode as SchroedingerQuantumMode
  }

  return state
}

/**
 * Generates a shareable URL with current state.
 * @param state - The state to serialize
 * @returns Full shareable URL
 */
export function generateShareUrl(state: ShareableState): string {
  const serialized = serializeState(state)
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return serialized ? `${baseUrl}?${serialized}` : baseUrl
}

/**
 * Parses the current URL to extract state.
 * @returns Partial state object from current URL
 */
export function parseCurrentUrl(): Partial<ShareableState> {
  if (typeof window === 'undefined') {
    return {}
  }
  return deserializeState(window.location.search)
}
