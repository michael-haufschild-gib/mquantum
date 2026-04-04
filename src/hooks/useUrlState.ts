/**
 * URL State Hook
 *
 * Initializes app state from URL parameters on mount.
 * Supports loading scene presets via `?scene=<name>` or
 * full scene configuration via `?t=schroedinger&d=5&qm=tdseDynamics&obs=1`.
 *
 * All extended params are optional — missing params keep app defaults.
 * Unknown params are silently ignored (forward compatible).
 */

import { useEffect, useRef } from 'react'

import { logger } from '@/lib/logger'
import { applySceneExample, findSceneByName } from '@/lib/sceneExamples'
import { parseCurrentUrl, type ParsedShareableState } from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

/** Mapping from URL state key → TDSE setter name on the extended object store. */
const TDSE_PARAM_MAP: ReadonlyArray<
  readonly [keyof ParsedShareableState, keyof ReturnType<typeof useExtendedObjectStore.getState>]
> = [
  ['potentialType', 'setTdsePotentialType'],
  ['absorberEnabled', 'setTdseAbsorberEnabled'],
  ['diagnosticsEnabled', 'setTdseDiagnosticsEnabled'],
  ['observablesEnabled', 'setTdseObservablesEnabled'],
  ['imaginaryTimeEnabled', 'setTdseImaginaryTimeEnabled'],
  ['customPotentialExpression', 'setTdseCustomPotentialExpression'],
  ['anharmonicLambda', 'setTdseAnharmonicLambda'],
  ['disorderStrength', 'setTdseDisorderStrength'],
  ['disorderSeed', 'setTdseDisorderSeed'],
  ['disorderDistribution', 'setTdseDisorderDistribution'],
] as const

/** Apply TDSE-specific URL state params. */
function applyTdseParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  for (const [urlKey, setter] of TDSE_PARAM_MAP) {
    if (urlState[urlKey] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic dispatch from validated lookup table
      ;(ext[setter] as (v: any) => void)(urlState[urlKey])
    }
  }
}

/** Apply open-quantum URL state params. */
function applyOpenQuantumParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.openQuantumEnabled === undefined) return

  ext.setOpenQuantumEnabled(urlState.openQuantumEnabled)
  if (urlState.openQuantumDephasingRate !== undefined)
    ext.setOpenQuantumDephasingRate(urlState.openQuantumDephasingRate)
  if (urlState.openQuantumRelaxationRate !== undefined)
    ext.setOpenQuantumRelaxationRate(urlState.openQuantumRelaxationRate)
  if (urlState.openQuantumThermalUpRate !== undefined)
    ext.setOpenQuantumThermalUpRate(urlState.openQuantumThermalUpRate)
}

/** Apply stochastic decoherence URL state params. */
function applyStochasticParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.stochasticEnabled === undefined) return

  ext.setTdseStochasticEnabled(urlState.stochasticEnabled)
  if (urlState.stochasticGamma !== undefined) ext.setTdseStochasticGamma(urlState.stochasticGamma)
  if (urlState.stochasticSigma !== undefined) ext.setTdseStochasticSigma(urlState.stochasticSigma)
  if (urlState.stochasticNumSites !== undefined)
    ext.setTdseStochasticNumSites(urlState.stochasticNumSites)
}

/** Apply coordinate entanglement URL state params (lazy import). */
function applyEntanglementParams(urlState: ParsedShareableState): void {
  if (urlState.entanglementEnabled === undefined) return

  void import('@/stores/coordinateEntanglementStore').then(({ useCoordinateEntanglementStore }) => {
    const entStore = useCoordinateEntanglementStore.getState()
    entStore.setEnabled(urlState.entanglementEnabled!)
    if (urlState.entanglementPairwiseMI !== undefined) {
      entStore.setComputePairwiseMI(urlState.entanglementPairwiseMI)
    }
  })
}

/**
 * Apply individual URL state parameters to stores.
 *
 * Exported for integration testing — this is the single source of truth for
 * URL param → store wiring. Tests should import this instead of duplicating it.
 *
 * @param urlState - Parsed URL state to apply
 */
export function applyUrlStateParams(urlState: ParsedShareableState): void {
  try {
    const geo = useGeometryStore.getState()
    const ext = useExtendedObjectStore.getState()

    // ── Core identity (order matters: dimension → objectType → quantumMode) ──
    if (urlState.dimension !== undefined) geo.setDimension(urlState.dimension)
    if (urlState.objectType !== undefined) geo.setObjectType(urlState.objectType)
    if (urlState.quantumMode !== undefined) ext.setSchroedingerQuantumMode(urlState.quantumMode)

    // ── Rendering ────────────────────────────────────────────────────────────
    if (urlState.representation !== undefined)
      ext.setSchroedingerRepresentation(urlState.representation)
    if (urlState.isoEnabled !== undefined) ext.setSchroedingerIsoEnabled(urlState.isoEnabled)
    if (urlState.isoThreshold !== undefined) ext.setSchroedingerIsoThreshold(urlState.isoThreshold)
    if (urlState.crossSectionEnabled !== undefined)
      ext.setSchroedingerCrossSectionEnabled(urlState.crossSectionEnabled)
    if (urlState.densityGain !== undefined) ext.setSchroedingerDensityGain(urlState.densityGain)
    if (urlState.scale !== undefined) ext.setSchroedingerScale(urlState.scale)

    // ── Quantum numbers ──────────────────────────────────────────────────────
    if (urlState.termCount !== undefined) ext.setSchroedingerTermCount(urlState.termCount)
    if (urlState.seed !== undefined) ext.setSchroedingerSeed(urlState.seed)
    if (urlState.hydrogenN !== undefined)
      ext.setSchroedingerPrincipalQuantumNumber(urlState.hydrogenN)
    if (urlState.hydrogenL !== undefined)
      ext.setSchroedingerAzimuthalQuantumNumber(urlState.hydrogenL)
    if (urlState.hydrogenM !== undefined)
      ext.setSchroedingerMagneticQuantumNumber(urlState.hydrogenM)

    // ── TDSE config ──────────────────────────────────────────────────────────
    applyTdseParams(urlState, ext)

    // ── Features ─────────────────────────────────────────────────────────────
    applyOpenQuantumParams(urlState, ext)
    applyStochasticParams(urlState, ext)
    applyEntanglementParams(urlState)
  } catch (error) {
    logger.warn('[useUrlState] Failed to apply URL state:', error)
  }
}

/**
 * Attempt to load a scene by name.
 * Searches both saved scenes (user's custom) and example scenes (bundled).
 * @param sceneName - Scene name to search for (case-insensitive)
 */
function loadSceneByName(sceneName: string): void {
  const result = findSceneByName(sceneName)

  if (result) {
    if (result.source === 'saved') {
      usePresetManagerStore.getState().loadScene(result.id)
      logger.log(`[useUrlState] Loaded saved scene: "${sceneName}"`)
    } else {
      applySceneExample(result.id)
      logger.log(`[useUrlState] Loaded example scene: "${sceneName}"`)
    }
  } else {
    logger.warn(`[useUrlState] Scene "${sceneName}" not found in saved or example scenes`)
  }
}

/**
 * Hook to initialize app state from URL parameters.
 * Only runs once on mount — does not react to URL changes.
 *
 * URL formats:
 * - Scene preset: `/?scene=schroedinger%20bloom`
 * - Object type:  `/?t=schroedinger&d=4&qm=tdseDynamics`
 *
 * When `scene` param is present, it takes priority and other params are ignored.
 */
export function useUrlState(): void {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const urlState = parseCurrentUrl()
    if (Object.keys(urlState).length === 0) return

    // Scene parameter is mutually exclusive with other params
    if (urlState.scene) {
      const sceneName = urlState.scene

      if (usePresetManagerStore.persist.hasHydrated()) {
        loadSceneByName(sceneName)
      } else {
        usePresetManagerStore.persist.onFinishHydration(() => {
          loadSceneByName(sceneName)
        })
      }
      return
    }

    applyUrlStateParams(urlState)
  }, [])
}
