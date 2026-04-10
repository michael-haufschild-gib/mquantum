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
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

/**
 * Mapping from URL state key → TDSE setter name on the extended object store.
 *
 * NOTE: `absorberEnabled` is intentionally NOT in this list. PML is shared
 * across all dynamic compute modes via `state.schroedinger.absorberEnabled`
 * (the top-level field that `applySharedPml` reads). Routing the URL param
 * through `setTdseAbsorberEnabled` would write to the per-mode TDSE field,
 * which is then *shadowed* by the top-level shared default `true` — meaning
 * `?abs=0` had no effect on actual rendering. The shared setter is dispatched
 * separately in `applyUrlStateParams` below.
 */
const TDSE_PARAM_MAP: ReadonlyArray<
  readonly [keyof ParsedShareableState, keyof ReturnType<typeof useExtendedObjectStore.getState>]
> = [
  ['potentialType', 'setTdsePotentialType'],
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
    if (urlState.entanglementBipartitions !== undefined) {
      entStore.setComputeBipartitions(urlState.entanglementBipartitions)
    }
  })
}

/**
 * Apply core identity (dimension → objectType → quantumMode) then synchronously
 * rerun the dimension-derived initializer that `useObjectTypeInitialization`
 * would normally handle. The init-hook's deps-changed effect is skipped during
 * URL load (see `isLoadingScene` gate below) so we run it here to get the
 * dimension-derived defaults before URL overrides layer on top.
 */
function applyCoreIdentityAndInit(urlState: ParsedShareableState): void {
  const geo = useGeometryStore.getState()
  const ext = useExtendedObjectStore.getState()

  if (urlState.dimension !== undefined) geo.setDimension(urlState.dimension)
  if (urlState.objectType !== undefined) geo.setObjectType(urlState.objectType)
  if (urlState.quantumMode !== undefined) ext.setSchroedingerQuantumMode(urlState.quantumMode)

  // Read post-mutation state: setDimension() clamps to the supported range, and
  // setObjectType() may auto-adjust the dimension. Initializing with the raw URL
  // values would mis-size arrays relative to the store's actual dimension.
  const currentGeo = useGeometryStore.getState()
  const { dimension: dim, objectType } = currentGeo
  const extStore = useExtendedObjectStore.getState()
  if (objectType === 'schroedinger') {
    extStore.initializeSchroedingerForDimension(dim)
  } else if (objectType === 'pauliSpinor') {
    extStore.initializePauliForDimension(dim)
  }
}

/** Clear the isLoadingScene guard after the next RAF tick. */
function scheduleClearLoadingFlag(): void {
  const clearFlag = () => usePerformanceStore.getState().setIsLoadingScene(false)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(clearFlag)
  } else {
    setTimeout(clearFlag, 0)
  }
}

/**
 * Apply individual URL state parameters to stores.
 *
 * Exported for integration testing — this is the single source of truth for
 * URL param → store wiring. Tests should import this instead of duplicating it.
 *
 * Guards the batched mutations behind `isLoadingScene=true` so the follow-up
 * render doesn't retrigger `useObjectTypeInitialization` with the new dimension
 * and clobber URL-set fields like `densityGain` / `parameterValues` / `extent`.
 * Mirrors the scheme `loadScene` uses in `presetManagerStore.ts`. The flag is
 * cleared after one RAF so the init hook's deps-changed effect has fired with
 * the guard still set, then normal operation resumes.
 *
 * @param urlState - Parsed URL state to apply
 */
export function applyUrlStateParams(urlState: ParsedShareableState): void {
  usePerformanceStore.getState().setIsLoadingScene(true)
  try {
    applyCoreIdentityAndInit(urlState)
    const ext = useExtendedObjectStore.getState()

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

    // ── Shared PML absorbing boundary ────────────────────────────────────────
    // PML is universal across all dynamic compute modes — see
    // computeGridUtils.applySharedPml. Must write to the top-level shared
    // field, not the per-mode TDSE one (which gets shadowed).
    if (urlState.absorberEnabled !== undefined) {
      ext.setSchroedingerAbsorberEnabled(urlState.absorberEnabled)
    }

    // ── TDSE config ──────────────────────────────────────────────────────────
    applyTdseParams(urlState, ext)

    // ── Features ─────────────────────────────────────────────────────────────
    applyOpenQuantumParams(urlState, ext)
    applyStochasticParams(urlState, ext)
    applyEntanglementParams(urlState)
  } catch (error) {
    logger.warn('[useUrlState] Failed to apply URL state:', error)
  } finally {
    scheduleClearLoadingFlag()
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
