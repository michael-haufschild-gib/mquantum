/**
 * Persisted style preset payload.
 */
export interface SavedStyle {
  id: string
  name: string
  timestamp: number
  data: {
    appearance: Record<string, unknown>
    lighting: Record<string, unknown>
    postProcessing: Record<string, unknown>
    environment: Record<string, unknown>
    pbr: Record<string, unknown>
  }
}

/**
 * Persisted scene preset payload.
 */
export interface SavedScene {
  id: string
  name: string
  timestamp: number
  data: {
    // Style components
    appearance: Record<string, unknown>
    lighting: Record<string, unknown>
    postProcessing: Record<string, unknown>
    environment: Record<string, unknown>
    pbr: Record<string, unknown>

    // Scene specific components
    geometry: Record<string, unknown>
    extended: Record<string, unknown>
    transform: Record<string, unknown>
    rotation: Record<string, unknown> // Stores Map as Object/Array
    animation: Record<string, unknown> // Stores Set as Array
    camera: Record<string, unknown>
    ui: Record<string, unknown>
  }
}
