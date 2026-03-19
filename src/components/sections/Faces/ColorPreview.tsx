/**
 * Color Preview Component
 *
 * Canvas-based preview showing the current color gradient.
 * Updates in real-time as palette settings change.
 *
 * Note: The preview shows colors as they would appear across a linear gradient.
 * Actual rendering on 3D surfaces uses orbit trap values (non-linear) and
 * surface normals, so exact visual match is not possible for all algorithms.
 */

import React, { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import { renderColorGradient } from './colorPreviewGradient'

/** Props for the color gradient preview strip. */
export interface ColorPreviewProps {
  className?: string
  width?: number
  height?: number
}

export const ColorPreview: React.FC<ColorPreviewProps> = React.memo(
  ({ className = '', width = 200, height = 24 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const appearanceSelector = useShallow((state: AppearanceSlice) => ({
      colorAlgorithm: state.colorAlgorithm,
      cosineCoefficients: state.cosineCoefficients,
      distribution: state.distribution,
      lchLightness: state.lchLightness,
      lchChroma: state.lchChroma,
      faceColor: state.faceColor,
      domainColoring: state.domainColoring,
      phaseDiverging: state.phaseDiverging,
      divergingPsi: state.divergingPsi,
    }))
    const {
      colorAlgorithm,
      cosineCoefficients,
      distribution,
      lchLightness,
      lchChroma,
      faceColor,
      domainColoring,
      phaseDiverging,
      divergingPsi,
    } = useAppearanceStore(appearanceSelector)

    const { pauliSpinUpColor, pauliSpinDownColor } = useExtendedObjectStore(
      useShallow((s) => ({
        pauliSpinUpColor: s.pauliSpinor?.spinUpColor ?? DEFAULT_PAULI_CONFIG.spinUpColor,
        pauliSpinDownColor: s.pauliSpinor?.spinDownColor ?? DEFAULT_PAULI_CONFIG.spinDownColor,
      }))
    )

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      renderColorGradient(ctx, canvas.width, canvas.height, {
        colorAlgorithm,
        cosineCoefficients,
        distribution,
        lchLightness,
        lchChroma,
        faceColor,
        domainColoring,
        phaseDiverging,
        divergingPsi,
        pauliSpinUpColor,
        pauliSpinDownColor,
      })
    }, [
      colorAlgorithm,
      cosineCoefficients,
      distribution,
      lchLightness,
      lchChroma,
      faceColor,
      domainColoring,
      phaseDiverging,
      divergingPsi,
      pauliSpinUpColor,
      pauliSpinDownColor,
    ])

    return (
      <div className={`${className}`}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full rounded border border-panel-border"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    )
  }
)

ColorPreview.displayName = 'ColorPreview'
