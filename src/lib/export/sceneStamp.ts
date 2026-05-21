/** Inputs used to generate compact visual provenance for export overlays. */
export interface SceneStampInput {
  modeName: string
  dimension: number
  representation?: string
  appName?: string
}

function formatDimension(dimension: number): string {
  const safeDimension = Number.isFinite(dimension) ? Math.max(1, Math.round(dimension)) : 1
  return `${safeDimension}D`
}

function formatRepresentation(representation: string | undefined): string | null {
  if (!representation) return null
  if (representation === 'wigner') return 'Wigner'
  return representation.charAt(0).toUpperCase() + representation.slice(1)
}

/** Build compact visual provenance for image/video text overlays. */
export function buildSceneStamp(input: SceneStampInput): string {
  const parts = [
    input.appName ?? 'mquantum',
    input.modeName.trim() || 'Unknown mode',
    formatDimension(input.dimension),
    formatRepresentation(input.representation),
  ].filter((part): part is string => Boolean(part))

  return parts.join(' | ')
}
