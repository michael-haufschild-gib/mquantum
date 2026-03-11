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

import { getCosinePaletteColorTS, applyDistributionTS } from '@/rendering/shaders/palette'
import { rgbToHex } from '@/lib/colors/colorUtils'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 *
 */
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

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Helper: Convert hex color to HSL
      const hexToHsl = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        if (!result) return [0, 0, 0.5]
        const r = parseInt(result[1]!, 16) / 255
        const g = parseInt(result[2]!, 16) / 255
        const b = parseInt(result[3]!, 16) / 255
        const max = Math.max(r, g, b),
          min = Math.min(r, g, b)
        const l = (max + min) / 2
        if (max === min) return [0, 0, l]
        const d = max - min
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        let h = 0
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        else if (max === g) h = ((b - r) / d + 2) / 6
        else h = ((r - g) / d + 4) / 6
        return [h, s, l]
      }

      // Helper: Convert hex color to RGB
      const hexToRgb = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        if (!result) return [0.85, 0.85, 0.85]
        return [
          parseInt(result[1]!, 16) / 255,
          parseInt(result[2]!, 16) / 255,
          parseInt(result[3]!, 16) / 255,
        ]
      }

      // Helper: Convert HSL to RGB
      const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
        const c = (1 - Math.abs(2 * l - 1)) * s
        const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
        const m = l - c / 2
        let r = 0,
          g = 0,
          b = 0
        if (h < 1 / 6) {
          r = c
          g = x
        } else if (h < 2 / 6) {
          r = x
          g = c
        } else if (h < 3 / 6) {
          g = c
          b = x
        } else if (h < 4 / 6) {
          g = x
          b = c
        } else if (h < 5 / 6) {
          r = x
          b = c
        } else {
          r = c
          b = x
        }
        return [r + m, g + m, b + m]
      }

      // Helper: Oklab to linear sRGB (matches shader implementation)
      const oklabToLinearSrgb = (L: number, a: number, b_: number): [number, number, number] => {
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b_
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b_
        const s_ = L - 0.0894841775 * a - 1.291485548 * b_

        const l = l_ * l_ * l_
        const m = m_ * m_ * m_
        const s = s_ * s_ * s_

        return [
          +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ]
      }

      // Draw gradient preview based on algorithm
      for (let x = 0; x < canvas.width; x++) {
        const t = x / canvas.width
        let r: number, g: number, b: number

        if (colorAlgorithm === 'lch') {
          // LCH preview using proper Oklab conversion (matches shader exactly)
          const distributedT = applyDistributionTS(
            t,
            distribution.power,
            distribution.cycles,
            distribution.offset
          )
          const hue = distributedT * 6.28318
          const a_oklab = lchChroma * Math.cos(hue)
          const b_oklab = lchChroma * Math.sin(hue)
          ;[r, g, b] = oklabToLinearSrgb(lchLightness, a_oklab, b_oklab)
        } else if (colorAlgorithm === 'phase') {
          // Phase: hue shift around base color (t = wavefunction phase 0..1)
          // Matches shader: hue = fract(baseHSL.x + (phaseNorm - 0.5) * 0.4)
          const [baseHue] = hexToHsl(faceColor)
          const hueShift = (t - 0.5) * 0.4
          const hue = (((baseHue + hueShift) % 1) + 1) % 1
          ;[r, g, b] = hslToRgb(hue, 0.75, 0.35)
        } else if (colorAlgorithm === 'mixed') {
          // Mixed: phase hue + density-dependent lightness/saturation
          // Matches shader: hue varies with phase, lightness = 0.15 + 0.35 * density
          const [baseHue] = hexToHsl(faceColor)
          const hueShift = (t - 0.5) * 0.4
          const hue = (((baseHue + hueShift) % 1) + 1) % 1
          const lightness = 0.15 + 0.35 * t
          const saturation = 0.7 + 0.25 * t
          ;[r, g, b] = hslToRgb(hue, saturation, lightness)
        } else if (colorAlgorithm === 'phaseCyclicUniform') {
          // Perceptually uniform cyclic phase map (phase-only, no density coupling).
          const phaseNorm = ((t % 1) + 1) % 1
          const angle = phaseNorm * Math.PI * 2
          const L = 0.72
          const C = 0.11
          const a_oklab = C * Math.cos(angle)
          const b_oklab = C * Math.sin(angle)
          ;[r, g, b] = oklabToLinearSrgb(L, a_oklab, b_oklab)
        } else if (colorAlgorithm === 'phaseDiverging') {
          // Signed diverging map: negative phase sign -> blue, positive -> red, nodal lines -> neutral.
          const signCarrier = Math.cos(t * Math.PI * 2)
          const signStrength = Math.abs(signCarrier)
          const neutral = hexToRgb(phaseDiverging.neutralColor)
          const positiveWing = hexToRgb(phaseDiverging.positiveColor)
          const negativeWing = hexToRgb(phaseDiverging.negativeColor)
          const wing = signCarrier >= 0 ? positiveWing : negativeWing
          const magnitude = 0.2 + 0.8 * t
          r = (neutral[0] * (1 - signStrength) + wing[0] * signStrength) * magnitude
          g = (neutral[1] * (1 - signStrength) + wing[1] * signStrength) * magnitude
          b = (neutral[2] * (1 - signStrength) + wing[2] * signStrength) * magnitude
        } else if (colorAlgorithm === 'diverging') {
          // Zero-centered diverging map for signed Re/Im(psi) component.
          const signCarrier =
            divergingPsi.component === 'imag' ? Math.sin(t * Math.PI * 2) : Math.cos(t * Math.PI * 2)
          const signStrength = Math.abs(signCarrier)
          const neutral = hexToRgb(divergingPsi.neutralColor)
          const positiveWing = hexToRgb(divergingPsi.positiveColor)
          const negativeWing = hexToRgb(divergingPsi.negativeColor)
          const wing = signCarrier >= 0 ? positiveWing : negativeWing
          const intensityFloor = Math.max(0, Math.min(1, divergingPsi.intensityFloor))
          const intensity = intensityFloor + (1 - intensityFloor) * signStrength
          r = (neutral[0] * (1 - signStrength) + wing[0] * signStrength) * intensity
          g = (neutral[1] * (1 - signStrength) + wing[1] * signStrength) * intensity
          b = (neutral[2] * (1 - signStrength) + wing[2] * signStrength) * intensity
        } else if (colorAlgorithm === 'domainColoringPsi') {
          // Domain coloring: hue = arg(psi), lightness = log-modulus.
          // Mode 0 (log|psi|^2): modulusValue = t  -> full [0,1] range
          // Mode 1 (log|psi|):   modulusValue = 0.5 + 0.5*t -> brighter [0.5,1] range
          const modulusValue =
            domainColoring.modulusMode === 'logPsiAbs' ? 0.5 + 0.5 * t : t
          const phaseNorm = t
          const lightness = Math.max(0, Math.min(1, 0.08 + 0.82 * modulusValue))
          ;[r, g, b] = hslToRgb(phaseNorm, 0.85, lightness)

          if (domainColoring.contoursEnabled) {
            const contourDensity = Math.max(1, domainColoring.contourDensity)
            const contourWidth = Math.max(0.005, Math.min(0.25, domainColoring.contourWidth))
            const contourStrength = Math.max(0, Math.min(1, domainColoring.contourStrength))
            const logModulus =
              domainColoring.modulusMode === 'logPsiAbs'
                ? -4 + 4 * t
                : -8 + 8 * t
            const contourPhase = ((logModulus * contourDensity) % 1 + 1) % 1
            const lineDistance = Math.min(contourPhase, 1 - contourPhase)
            const edgeWidth = Math.max(0.001, contourWidth * 0.5)
            const lineMask =
              lineDistance <= edgeWidth ? 1 : Math.max(0, 1 - (lineDistance - edgeWidth) / edgeWidth)
            const darken = 1 - contourStrength * lineMask * 0.85
            r *= darken
            g *= darken
            b *= darken
          }
        } else if (colorAlgorithm === 'relativePhase') {
          // Relative phase map: hue = arg(conj(psi_ref) * psi), lightness = |psi|^2.
          // Preview uses t as both normalized relative phase and normalized density.
          const phaseNorm = t
          const rhoNorm = t
          ;[r, g, b] = hslToRgb(phaseNorm, 0.85, rhoNorm)
        } else if (colorAlgorithm === 'blackbody') {
          // Blackbody: Tanner Helland approximation (matches shader)
          // temp = normalized * 12000 → 0..12000 K
          const temp = t * 12000
          if (temp < 500) {
            r = 0
            g = 0
            b = 0
          } else {
            const tk = temp / 100
            // Red
            if (tk <= 66) {
              r = 1.0
            } else {
              r = 329.698727446 * Math.pow(tk - 60, -0.1332047592) / 255
            }
            // Green
            if (tk <= 66) {
              g = (99.4708025861 * Math.log(tk) - 161.1195681661) / 255
            } else {
              g = 288.1221695283 * Math.pow(tk - 60, -0.0755148492) / 255
            }
            // Blue
            if (tk >= 66) {
              b = 1.0
            } else if (tk <= 19) {
              b = 0
            } else {
              b = (138.5177312231 * Math.log(tk - 10) - 305.0447927307) / 255
            }
            r = Math.min(1, Math.max(0, r))
            g = Math.min(1, Math.max(0, g))
            b = Math.min(1, Math.max(0, b))
          }
        } else if (colorAlgorithm === 'radialDistance') {
          // Radial Distance (spectral): mirror WGSL algo 11 in emission.wgsl.ts.
          // Shader uses: hue = 0.8 * distanceNorm, saturation=1.0, lightness=0.5.
          const distanceNorm = Math.max(0, Math.min(1, t))
          const hue = 0.8 * distanceNorm
          ;[r, g, b] = hslToRgb(hue, 1.0, 0.5)
        } else if (colorAlgorithm === 'hamiltonianDecomposition') {
          // K(red)/G(green)/V(blue) energy fractions
          const fK = t * t
          const fG = Math.sin(t * Math.PI) * 0.8
          const fV = (1 - t) * (1 - t)
          const brightness = Math.max(0, Math.min(1, t * 1.5))
          r = fK * brightness
          g = fG * brightness
          b = fV * brightness
        } else if (colorAlgorithm === 'modeCharacter') {
          // HSL hue sweep (0..0.8) matching shader charHue range
          const saturation = Math.min(1, t * 10)
          const brightness = Math.min(1, Math.sqrt(t) * 2)
          ;[r, g, b] = hslToRgb(t * 0.8, saturation, brightness * 0.5)
        } else if (colorAlgorithm === 'energyFlux') {
          // Full hue wheel (directional color) with magnitude brightness
          const brightness = Math.max(0, Math.min(1, Math.log(t + 1e-6) / 4 + 1))
          ;[r, g, b] = hslToRgb(t, 0.8, Math.max(0.2, 0.6 * brightness))
        } else if (colorAlgorithm === 'kSpaceOccupation') {
          // Viridis-like: deep blue → teal → yellow (matches WGSL algo 15)
          const hue = 0.7 + (0.12 - 0.7) * t // 0.7 → 0.12
          const sat = 0.6 + (0.95 - 0.6) * Math.min(1, Math.max(0, (t - 0) / 0.5))
          const lit = 0.08 + (0.55 - 0.08) * t
          ;[r, g, b] = hslToRgb(hue, sat, lit)
        } else if (colorAlgorithm === 'viridis' || colorAlgorithm === 'densityContours') {
          // Viridis 5-stop piecewise linear (matches WGSL algo 19/21)
          if (t < 0.25) {
            const u = t / 0.25
            r = 0.267 + (0.282 - 0.267) * u; g = 0.004 + (0.140 - 0.004) * u; b = 0.329 + (0.457 - 0.329) * u
          } else if (t < 0.5) {
            const u = (t - 0.25) / 0.25
            r = 0.282 + (0.127 - 0.282) * u; g = 0.140 + (0.566 - 0.140) * u; b = 0.457 + (0.550 - 0.457) * u
          } else if (t < 0.75) {
            const u = (t - 0.5) / 0.25
            r = 0.127 + (0.741 - 0.127) * u; g = 0.566 + (0.873 - 0.566) * u; b = 0.550 + (0.150 - 0.550) * u
          } else {
            const u = (t - 0.75) / 0.25
            r = 0.741 + (0.993 - 0.741) * u; g = 0.873 + (0.906 - 0.873) * u; b = 0.150 + (0.144 - 0.150) * u
          }
          // Contour overlay for densityContours
          if (colorAlgorithm === 'densityContours') {
            const contourT = (t * 10) % 1
            const lineDistance = Math.min(contourT, 1 - contourT)
            const lineMask = lineDistance < 0.06 ? 1 - lineDistance / 0.06 : 0
            const darken = 1 - 0.7 * lineMask
            r *= darken; g *= darken; b *= darken
          }
        } else if (colorAlgorithm === 'inferno') {
          // Inferno 5-stop piecewise linear (matches WGSL algo 20)
          if (t < 0.25) {
            const u = t / 0.25
            r = 0.001 + (0.258 - 0.001) * u; g = 0.000 + (0.039 - 0.000) * u; b = 0.014 + (0.406 - 0.014) * u
          } else if (t < 0.5) {
            const u = (t - 0.25) / 0.25
            r = 0.258 + (0.865 - 0.258) * u; g = 0.039 + (0.138 - 0.039) * u; b = 0.406 + (0.082 - 0.406) * u
          } else if (t < 0.75) {
            const u = (t - 0.5) / 0.25
            r = 0.865 + (0.987 - 0.865) * u; g = 0.138 + (0.645 - 0.138) * u; b = 0.082 + (0.040 - 0.082) * u
          } else {
            const u = (t - 0.75) / 0.25
            r = 0.987 + (0.988 - 0.987) * u; g = 0.645 + (0.998 - 0.645) * u; b = 0.040 + (0.645 - 0.040) * u
          }
        } else if (colorAlgorithm === 'particleAntiparticle') {
          // Upper/Lower spinor: particle (blue-cyan) → antiparticle (red-magenta)
          // Matches shader: pColor = (0.1, 0.55, 0.95), aColor = (0.95, 0.15, 0.45)
          const particleDensity = 1 - t
          const antiparticleDensity = t
          r = 0.1 * particleDensity + 0.95 * antiparticleDensity
          g = 0.55 * particleDensity + 0.15 * antiparticleDensity
          b = 0.95 * particleDensity + 0.45 * antiparticleDensity
        } else if (colorAlgorithm === 'phaseDensity') {
          // Phase-density composite: hue sweeps through phase, brightness = density
          // Preview: t drives both phase (hue) and density (brightness) together
          const phaseNorm = t
          const brightness = t
          const saturation = 0.3 + 0.65 * brightness
          const lightness = brightness * 0.55
          ;[r, g, b] = hslToRgb(phaseNorm, saturation, lightness)
        } else {
          // Cosine palette (multiSource, radial)
          // Shows the underlying palette that will be sampled by position/density.
          const color = getCosinePaletteColorTS(
            t,
            cosineCoefficients.a,
            cosineCoefficients.b,
            cosineCoefficients.c,
            cosineCoefficients.d,
            distribution.power,
            distribution.cycles,
            distribution.offset
          )
          r = color.r
          g = color.g
          b = color.b
        }

        // Clamp and convert to 8-bit
        const r8 = Math.round(Math.max(0, Math.min(1, r)) * 255)
        const g8 = Math.round(Math.max(0, Math.min(1, g)) * 255)
        const b8 = Math.round(Math.max(0, Math.min(1, b)) * 255)

        ctx.fillStyle = rgbToHex(r8, g8, b8)
        ctx.fillRect(x, 0, 1, canvas.height)
      }
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
