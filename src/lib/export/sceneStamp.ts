import type { QuantumTypeValidation } from '@/lib/geometry/registry'

/** Inputs used to generate compact visual provenance for export overlays. */
export interface SceneStampInput {
  modeName: string
  dimension: number
  representation?: string
  validation?: QuantumTypeValidation
  appName?: string
}

const CONFIDENCE_LABELS = {
  strong: 'strong evidence',
  partial: 'partial evidence',
  fixture: 'fixture evidence',
} as const

function formatDimension(dimension: number): string {
  const safeDimension = Number.isFinite(dimension) ? Math.max(1, Math.round(dimension)) : 1
  return `${safeDimension}D`
}

function formatRepresentation(representation: string | undefined): string | null {
  if (!representation) return null
  if (representation === 'wigner') return 'Wigner'
  return representation.charAt(0).toUpperCase() + representation.slice(1)
}

function formatValidation(validation: QuantumTypeValidation | undefined): string | null {
  if (!validation || validation.levels.length === 0) return null
  return `${validation.levels.join('+')} ${CONFIDENCE_LABELS[validation.confidence]}`
}

/** Build compact visual provenance for image/video text overlays. */
export function buildSceneStamp(input: SceneStampInput): string {
  const parts = [
    input.appName ?? 'mquantum',
    input.modeName.trim() || 'Unknown mode',
    formatDimension(input.dimension),
    formatRepresentation(input.representation),
    formatValidation(input.validation),
  ].filter((part): part is string => Boolean(part))

  return parts.join(' | ')
}
