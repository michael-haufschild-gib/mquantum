/**
 * URL-param appliers for the dedicated-renderer analytic modes
 * (Coherence Horizon `ch_*`, Riemann Zeta `rz_*`, Hilbert–Pólya `hp_*`).
 *
 * Both follow the same preset-cascade contract as AdS: the named preset is
 * applied first, then raw fields — each raw-field setter flips `preset` to
 * `custom`, so a URL carrying only a preset restores as that preset label
 * while raw fields alongside override it. Invoked from
 * `applyUrlStateParams` in `useUrlState.ts`; split out of the hook to keep
 * that file within the line budget. Store access is type-only — callers
 * pass the live store snapshot.
 *
 * @module lib/url/applyHorizonModeParams
 */

import type { ExtendedObjectState } from '@/stores/scene/extendedObjectStore'

import type { ParsedShareableState } from './state-serializer'

/**
 * Apply Coherence Horizon URL state params.
 *
 * Preset first, then raw fields — raw fields cascade `preset` into `custom`
 * via the individual setters, mirroring the AdS apply order.
 */
export function applyCoherenceHorizonParams(
  urlState: ParsedShareableState,
  ext: ExtendedObjectState
): void {
  if (
    urlState.coherenceHorizonPreset !== undefined &&
    urlState.coherenceHorizonPreset !== 'custom'
  ) {
    ext.setCoherenceHorizonPreset(urlState.coherenceHorizonPreset)
  }
  if (urlState.coherenceHorizonDecoherence !== undefined)
    ext.setCoherenceHorizonDecoherence(urlState.coherenceHorizonDecoherence)
  if (urlState.coherenceHorizonSeparation !== undefined)
    ext.setCoherenceHorizonSeparation(urlState.coherenceHorizonSeparation)
  if (urlState.coherenceHorizonWidth !== undefined)
    ext.setCoherenceHorizonWidth(urlState.coherenceHorizonWidth)
  if (urlState.coherenceHorizonWaveNumber !== undefined)
    ext.setCoherenceHorizonWaveNumber(urlState.coherenceHorizonWaveNumber)
  if (urlState.coherenceHorizonScale !== undefined)
    ext.setCoherenceHorizonScale(urlState.coherenceHorizonScale)
  if (urlState.coherenceHorizonRingGain !== undefined)
    ext.setCoherenceHorizonRingGain(urlState.coherenceHorizonRingGain)
  if (urlState.coherenceHorizonGlow !== undefined)
    ext.setCoherenceHorizonGlow(urlState.coherenceHorizonGlow)
}

/**
 * Apply Riemann Zeta (Arithmetic Horizon) URL state params.
 *
 * Preset first, then raw fields — raw fields cascade `preset` into `custom`
 * via the individual setters, mirroring the Coherence Horizon apply order.
 */
export function applyRiemannZetaParams(
  urlState: ParsedShareableState,
  ext: ExtendedObjectState
): void {
  if (urlState.riemannZetaPreset !== undefined && urlState.riemannZetaPreset !== 'custom') {
    ext.setRiemannZetaPreset(urlState.riemannZetaPreset)
  }
  if (urlState.riemannZetaSource !== undefined) ext.setRiemannZetaSource(urlState.riemannZetaSource)
  if (urlState.riemannZetaNumZeros !== undefined)
    ext.setRiemannZetaNumZeros(urlState.riemannZetaNumZeros)
  if (urlState.riemannZetaBeta !== undefined) ext.setRiemannZetaBeta(urlState.riemannZetaBeta)
  if (urlState.riemannZetaHorizonRadius !== undefined)
    ext.setRiemannZetaHorizonRadius(urlState.riemannZetaHorizonRadius)
  if (urlState.riemannZetaAngularL !== undefined)
    ext.setRiemannZetaAngularL(urlState.riemannZetaAngularL)
  if (urlState.riemannZetaAngularM !== undefined)
    ext.setRiemannZetaAngularM(urlState.riemannZetaAngularM)
  if (urlState.riemannZetaFlowRate !== undefined)
    ext.setRiemannZetaFlowRate(urlState.riemannZetaFlowRate)
  if (urlState.riemannZetaGlow !== undefined) ext.setRiemannZetaGlow(urlState.riemannZetaGlow)
  if (urlState.riemannZetaCutaway !== undefined)
    ext.setRiemannZetaCutaway(urlState.riemannZetaCutaway)
}

/**
 * Apply Hilbert–Pólya Spectrum URL state params.
 *
 * Preset first, then raw fields — raw fields cascade `preset` into `custom`
 * via the individual setters, mirroring the Riemann Zeta apply order.
 */
export function applyHilbertPolyaParams(
  urlState: ParsedShareableState,
  ext: ExtendedObjectState
): void {
  if (urlState.hilbertPolyaPreset !== undefined && urlState.hilbertPolyaPreset !== 'custom') {
    ext.setHilbertPolyaPreset(urlState.hilbertPolyaPreset)
  }
  if (urlState.hilbertPolyaZMax !== undefined) ext.setHilbertPolyaZMax(urlState.hilbertPolyaZMax)
  if (urlState.hilbertPolyaYExtent !== undefined)
    ext.setHilbertPolyaYExtent(urlState.hilbertPolyaYExtent)
  if (urlState.hilbertPolyaFilamentWidth !== undefined)
    ext.setHilbertPolyaFilamentWidth(urlState.hilbertPolyaFilamentWidth)
  if (urlState.hilbertPolyaGlow !== undefined) ext.setHilbertPolyaGlow(urlState.hilbertPolyaGlow)
  if (urlState.hilbertPolyaFogGain !== undefined)
    ext.setHilbertPolyaFogGain(urlState.hilbertPolyaFogGain)
  if (urlState.hilbertPolyaPlaneMarker !== undefined)
    ext.setHilbertPolyaPlaneMarker(urlState.hilbertPolyaPlaneMarker)
}

/**
 * Apply Bifurcation Horizon URL state params.
 *
 * Preset first, then raw fields — raw fields cascade `preset` into `custom`
 * via the individual setters, mirroring the Riemann Zeta apply order.
 */
export function applyBifurcationHorizonParams(
  urlState: ParsedShareableState,
  ext: ExtendedObjectState
): void {
  if (
    urlState.bifurcationHorizonPreset !== undefined &&
    urlState.bifurcationHorizonPreset !== 'custom'
  ) {
    ext.setBifurcationHorizonPreset(urlState.bifurcationHorizonPreset)
  }
  if (urlState.bifurcationHorizonNeckRadius !== undefined)
    ext.setBifurcationHorizonNeckRadius(urlState.bifurcationHorizonNeckRadius)
  if (urlState.bifurcationHorizonThroatWidth !== undefined)
    ext.setBifurcationHorizonThroatWidth(urlState.bifurcationHorizonThroatWidth)
  if (urlState.bifurcationHorizonGlow !== undefined)
    ext.setBifurcationHorizonGlow(urlState.bifurcationHorizonGlow)
  if (urlState.bifurcationHorizonFlowRate !== undefined)
    ext.setBifurcationHorizonFlowRate(urlState.bifurcationHorizonFlowRate)
  if (urlState.bifurcationHorizonSwirl !== undefined)
    ext.setBifurcationHorizonSwirl(urlState.bifurcationHorizonSwirl)
  if (urlState.bifurcationHorizonRedshiftRadius !== undefined)
    ext.setBifurcationHorizonRedshiftRadius(urlState.bifurcationHorizonRedshiftRadius)
  if (urlState.bifurcationHorizonOffLine !== undefined)
    ext.setBifurcationHorizonOffLine(urlState.bifurcationHorizonOffLine)
  if (urlState.bifurcationHorizonWinding !== undefined)
    ext.setBifurcationHorizonWinding(urlState.bifurcationHorizonWinding)
  if (urlState.bifurcationHorizonThermalGain !== undefined)
    ext.setBifurcationHorizonThermalGain(urlState.bifurcationHorizonThermalGain)
}
