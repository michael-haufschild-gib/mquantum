/**
 * Pauli Spin Color Pickers
 *
 * Spin-up / spin-down color pickers shown in the Colors tab
 * when a Pauli spin color algorithm is active.
 *
 * @module components/sections/Faces/PauliSpinColorPickers
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ColorPicker } from '@/components/ui/ColorPicker'
import { hexToSrgbTuple, rgbToHex } from '@/lib/colors/colorUtils'
import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

/** Convert 0-1 RGB tuple to hex string for ColorPicker. */
function tupleToHex(c: [number, number, number]): string {
  return rgbToHex(Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255))
}

/**
 * Spin-up and spin-down color pickers for Pauli spinor visualization.
 *
 * Reads and writes colors to `extendedObjectStore.pauliSpinor`.
 * Changes are reflected in `ColorPreview` automatically since it
 * subscribes to the same store fields.
 *
 * @returns Color picker pair for spin-up and spin-down channels
 */
export const PauliSpinColorPickers: React.FC = React.memo(() => {
  const { spinUpColor, spinDownColor, setPauliSpinUpColor, setPauliSpinDownColor } =
    useExtendedObjectStore(
      useShallow((s) => ({
        spinUpColor: s.pauliSpinor?.spinUpColor ?? DEFAULT_PAULI_CONFIG.spinUpColor,
        spinDownColor: s.pauliSpinor?.spinDownColor ?? DEFAULT_PAULI_CONFIG.spinDownColor,
        setPauliSpinUpColor: s.setPauliSpinUpColor,
        setPauliSpinDownColor: s.setPauliSpinDownColor,
      }))
    )

  const handleSpinUpColor = useCallback(
    (hex: string) => setPauliSpinUpColor(hexToSrgbTuple(hex)),
    [setPauliSpinUpColor]
  )

  const handleSpinDownColor = useCallback(
    (hex: string) => setPauliSpinDownColor(hexToSrgbTuple(hex)),
    [setPauliSpinDownColor]
  )

  return (
    <div className="grid grid-cols-2 gap-3">
      <ColorPicker
        label="Spin Up"
        tooltip="Color representing the spin-up (+z) component of the Pauli spinor."
        value={tupleToHex(spinUpColor)}
        onChange={handleSpinUpColor}
        disableAlpha
      />
      <ColorPicker
        label="Spin Down"
        tooltip="Color representing the spin-down (-z) component of the Pauli spinor."
        value={tupleToHex(spinDownColor)}
        onChange={handleSpinDownColor}
        disableAlpha
      />
    </div>
  )
})

PauliSpinColorPickers.displayName = 'PauliSpinColorPickers'
