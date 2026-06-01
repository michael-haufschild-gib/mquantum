/** Convert a raw FFT-order index to its fftshifted display index. */
export function fftShiftRawIndexToDisplayIndex(rawIndex: number, rawSize: number): number {
  if (rawSize <= 1) return 0
  return (rawIndex + Math.floor(rawSize / 2)) % rawSize
}

/** Convert an fftshifted display index back to the raw FFT-order index. */
export function fftShiftDisplayIndexToRawIndex(displayIndex: number, rawSize: number): number {
  if (rawSize <= 1) return 0
  return (displayIndex + Math.ceil(rawSize / 2)) % rawSize
}

/** Map a raw k-space lattice index into a fixed-size display-grid coordinate. */
export function mapRawKIndexToOutputCoord(
  rawIndex: number,
  rawSize: number,
  outputSize: number,
  shift: boolean
): number {
  if (rawSize <= 1) return Math.floor(outputSize / 2)
  const displayIndex = shift ? fftShiftRawIndexToDisplayIndex(rawIndex, rawSize) : rawIndex
  if (rawSize <= outputSize) return Math.floor((outputSize - rawSize) / 2) + displayIndex
  return Math.min(
    outputSize - 1,
    Math.max(0, Math.floor(((displayIndex + 0.5) * outputSize) / rawSize))
  )
}

/** Map a display-grid coordinate back to the nearest raw k-space lattice index. */
export function mapOutputCoordToRawKIndex(
  outputCoord: number,
  rawSize: number,
  outputSize: number,
  shift: boolean
): number | null {
  if (rawSize <= 1) {
    return outputCoord === Math.floor(outputSize / 2) ? 0 : null
  }

  let displayIndex: number
  if (rawSize <= outputSize) {
    const offset = Math.floor((outputSize - rawSize) / 2)
    displayIndex = outputCoord - offset
    if (displayIndex < 0 || displayIndex >= rawSize) return null
  } else if (shift) {
    const outputCenter = Math.floor(outputSize / 2)
    const rawCenter = Math.floor(rawSize / 2)
    displayIndex = Math.round((outputCoord - outputCenter) * (rawSize / outputSize) + rawCenter)
    displayIndex = Math.max(0, Math.min(rawSize - 1, displayIndex))
  } else {
    displayIndex =
      outputSize <= 1 ? 0 : Math.round((outputCoord * (rawSize - 1)) / Math.max(1, outputSize - 1))
    displayIndex = Math.max(0, Math.min(rawSize - 1, displayIndex))
  }

  return shift ? fftShiftDisplayIndexToRawIndex(displayIndex, rawSize) : displayIndex
}
