import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

/**
 *
 */
export function packQuantumBackreaction(
  floatView: Float32Array,
  intView: Int32Array,
  schroedinger: Partial<SchroedingerConfig> | undefined
): void {
  const enabled = schroedinger?.quantumBackreactionLensingEnabled ?? false
  intView[I.quantumBackreactionLensingEnabled] = enabled ? 1 : 0
  floatView[I.quantumBackreactionLensingStrength] = enabled
    ? clamp(schroedinger?.quantumBackreactionLensingStrength ?? 1.0, 0.0, 3.0)
    : 0.0
  floatView[I.quantumBackreactionCausticGain] = enabled
    ? clamp(schroedinger?.quantumBackreactionCausticGain ?? 0.6, 0.0, 2.0)
    : 0.0
  floatView[I.quantumBackreactionSoftening] = enabled
    ? clamp(schroedinger?.quantumBackreactionSoftening ?? 0.45, 0.05, 2.0)
    : 0.0
}
