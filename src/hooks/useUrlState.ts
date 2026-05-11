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
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { usePresetManagerStore } from '@/stores/runtime/presetManagerStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

/**
 * Apply TDSE-specific URL state params.
 *
 * NOTE: `absorberEnabled` is intentionally dispatched separately in
 * `applyUrlStateParams` (not here). PML is shared across all dynamic compute
 * modes via `state.schroedinger.absorberEnabled` (the top-level field that
 * `applySharedPml` reads). Routing the URL param through `setTdseAbsorberEnabled`
 * would write to the per-mode TDSE field, which is then *shadowed* by the
 * top-level shared default `true` — meaning `?abs=0` had no effect on actual
 * rendering.
 */
function applyTdseParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.potentialType !== undefined) ext.setTdsePotentialType(urlState.potentialType)
  if (urlState.diagnosticsEnabled !== undefined)
    ext.setTdseDiagnosticsEnabled(urlState.diagnosticsEnabled)
  if (urlState.observablesEnabled !== undefined)
    ext.setTdseObservablesEnabled(urlState.observablesEnabled)
  if (urlState.imaginaryTimeEnabled !== undefined)
    ext.setTdseImaginaryTimeEnabled(urlState.imaginaryTimeEnabled)
  if (urlState.customPotentialExpression !== undefined)
    ext.setTdseCustomPotentialExpression(urlState.customPotentialExpression)
  if (urlState.anharmonicLambda !== undefined)
    ext.setTdseAnharmonicLambda(urlState.anharmonicLambda)
  if (urlState.disorderStrength !== undefined)
    ext.setTdseDisorderStrength(urlState.disorderStrength)
  if (urlState.disorderSeed !== undefined) ext.setTdseDisorderSeed(urlState.disorderSeed)
  if (urlState.disorderDistribution === 'uniform' || urlState.disorderDistribution === 'gaussian')
    ext.setTdseDisorderDistribution(urlState.disorderDistribution)
}

type MetricKindFromUrl = NonNullable<ParsedShareableState['tdseMetricKind']>

/**
 * Per-kind extractors that pull the scalars a given metric kind cares about
 * from the parsed URL state. Each returns a partial config without `kind`.
 * Dispatched by kind to keep the top-level `buildMetricCfgFromUrl` linear.
 */
const METRIC_FIELD_EXTRACTORS: {
  [K in MetricKindFromUrl]: (u: ParsedShareableState) => Record<string, unknown>
} = {
  flat: () => ({}),
  morrisThorne: (u) =>
    u.tdseMetricThroatRadius !== undefined ? { throatRadius: u.tdseMetricThroatRadius } : {},
  schwarzschild: (u) =>
    u.tdseSchwarzschildMass !== undefined ? { schwarzschildMass: u.tdseSchwarzschildMass } : {},
  deSitter: (u) => (u.tdseHubbleRate !== undefined ? { hubbleRate: u.tdseHubbleRate } : {}),
  antiDeSitter: (u) => (u.tdseAdsRadius !== undefined ? { adsRadius: u.tdseAdsRadius } : {}),
  sphere2D: (u) => (u.tdseSphereRadius !== undefined ? { sphereRadius: u.tdseSphereRadius } : {}),
  torus: (u) => {
    const { tdseTorusPeriod0: p0, tdseTorusPeriod1: p1, tdseTorusPeriod2: p2 } = u
    return p0 !== undefined && p1 !== undefined && p2 !== undefined
      ? { torusPeriod: [p0, p1, p2] }
      : {}
  },
  doubleThroat: (u) => {
    const out: Record<string, unknown> = {}
    if (u.tdseDoubleThroatSeparation !== undefined)
      out.doubleThroatSeparation = u.tdseDoubleThroatSeparation
    if (u.tdseDoubleThroatRadius !== undefined) out.doubleThroatRadius = u.tdseDoubleThroatRadius
    return out
  },
}

/**
 * Build a `MetricConfig`-shaped object from URL state for a given kind. Each
 * kind only consumes the scalars it cares about; unknown fields are dropped
 * by the downstream setter's clamping logic.
 */
function buildMetricCfgFromUrl(
  urlState: ParsedShareableState,
  kind: MetricKindFromUrl
): Record<string, unknown> {
  return { kind, ...METRIC_FIELD_EXTRACTORS[kind](urlState) }
}

/**
 * Apply TDSE metric + curvature-visualization URL state params (Waves 5-6).
 *
 * Builds a `MetricConfig` by selecting only the scalars relevant to the
 * declared `tdseMetricKind` and calls `setTdseMetric` once. Sets overlay /
 * density-view flags independently. No-ops when the URL specified no metric.
 */
function applyTdseMetricParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.tdseMetricKind !== undefined) {
    const cfg = buildMetricCfgFromUrl(urlState, urlState.tdseMetricKind)
    ext.setTdseMetric(cfg as unknown as Parameters<typeof ext.setTdseMetric>[0])
  }
  if (urlState.tdseShowCurvatureOverlay !== undefined)
    ext.setShowCurvatureOverlay(urlState.tdseShowCurvatureOverlay)
  if (urlState.tdseCurvatureOverlayOpacity !== undefined)
    ext.setCurvatureOverlayOpacity(urlState.tdseCurvatureOverlayOpacity)
  if (urlState.tdseDensityView !== undefined) ext.setDensityView(urlState.tdseDensityView)
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

/**
 * Apply TDSE branching visualization URL state params.
 *
 * Independent from stochastic decoherence (see ShareableObjectState.branchingEnabled
 * docstring) — the branch partition is a physics-visible diagnostic that is
 * meaningful for any TDSE run, not just CSL-driven ones.
 */
function applyBranchingParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.branchingEnabled === undefined) return

  ext.setTdseBranchingEnabled(urlState.branchingEnabled)
  if (urlState.branchPlanePosition !== undefined)
    ext.setTdseBranchPlanePosition(urlState.branchPlanePosition)
}

/**
 * Apply ER=EPR double-trace wormhole coupling URL state params. Order
 * matters: `setTdseWormholeEnabled` flips the `needsReset` flag, so we
 * set the axis/g first and only flip the enable last. This matches the
 * convention used by `applyCosmologyParams`.
 */
function applyWormholeParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.wormholeCouplingEnabled === undefined) return

  if (urlState.wormholeMirrorAxis !== undefined) {
    ext.setTdseWormholeAxis(urlState.wormholeMirrorAxis)
  }
  if (urlState.wormholeCouplingG !== undefined) {
    ext.setTdseWormholeG(urlState.wormholeCouplingG)
  }
  ext.setTdseWormholeEnabled(urlState.wormholeCouplingEnabled)
}

/**
 * Apply cosmological-background URL state params. Sets preset/steepness/hubble
 * BEFORE eta0 and enable so the setter chain sees a consistent preset state
 * at each step (setFreeScalarCosmologyPreset re-clamps eta0, setEnabled
 * re-clamps again against the new invariants).
 */
function applyCosmologyParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.cosmologyEnabled === undefined) return

  if (urlState.cosmologyPreset !== undefined) {
    ext.setFreeScalarCosmologyPreset(urlState.cosmologyPreset)
  }
  if (urlState.cosmologySteepness !== undefined) {
    ext.setFreeScalarCosmologySteepness(urlState.cosmologySteepness)
  }
  if (urlState.cosmologyHubble !== undefined) {
    ext.setFreeScalarCosmologyHubble(urlState.cosmologyHubble)
  }
  if (urlState.cosmologyLqcRhoCritical !== undefined) {
    ext.setFreeScalarCosmologyLqcRhoCritical(urlState.cosmologyLqcRhoCritical)
  }
  if (urlState.cosmologyLqcEquationOfState !== undefined) {
    ext.setFreeScalarCosmologyLqcEquationOfState(urlState.cosmologyLqcEquationOfState)
  }
  if (urlState.cosmologyLqcInitialRhoRatio !== undefined) {
    ext.setFreeScalarCosmologyLqcInitialRhoRatio(urlState.cosmologyLqcInitialRhoRatio)
  }
  if (urlState.cosmologyEta0 !== undefined) {
    ext.setFreeScalarCosmologyEta0(urlState.cosmologyEta0)
  }
  // Enable last: the enable setter re-clamps eta0 against the final preset
  // state, so earlier setters' intermediate values don't matter.
  ext.setFreeScalarCosmologyEnabled(urlState.cosmologyEnabled)
}

/** Apply the AdS bound-state (Stage 1) URL fields. Extracted so the top-
 * level `applyAdsParams` stays under the cognitive-complexity budget.
 *
 * Ordering: set ℓ BEFORE m so the magnetic-QN setter sees the correct
 * [−ℓ, +ℓ] clamp window — setting m first against a stale ℓ would silently
 * over-clamp when ℓ later increases. */
function applyAdsBoundStateFields(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.adsDimension !== undefined) ext.setAdsDimension(urlState.adsDimension)
  if (urlState.adsRadial !== undefined) ext.setAdsRadialQuantumNumber(urlState.adsRadial)
  if (urlState.adsAngular !== undefined) ext.setAdsAngularQuantumNumber(urlState.adsAngular)
  if (urlState.adsMagnetic !== undefined) ext.setAdsMagneticQuantumNumber(urlState.adsMagnetic)
  if (urlState.adsMassParameter !== undefined) ext.setAdsMassParameter(urlState.adsMassParameter)
  if (urlState.adsBranch !== undefined) ext.setAdsQuantizationBranch(urlState.adsBranch)
  if (urlState.adsBoundaryOverlay !== undefined)
    ext.setAdsBoundaryOverlay(urlState.adsBoundaryOverlay)
}

/** Apply the AdS Stage-2 (BTZ + HKLL) URL fields. Sub-fields are applied
 * BEFORE the enable toggles so the strategy sees a fully-configured block
 * on its first repack. The HKLL enable setter clears `btzEnabled` to hold
 * the mutex — order between the two blocks at the URL level is therefore
 * irrelevant. */
function applyAdsStageTwoFields(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.adsBtzHorizonRadius !== undefined)
    ext.setAdsBtzHorizonRadius(urlState.adsBtzHorizonRadius)
  if (urlState.adsBtzOmega !== undefined) ext.setAdsBtzOmega(urlState.adsBtzOmega)
  if (urlState.adsBtzAngularM !== undefined) ext.setAdsBtzAngularM(urlState.adsBtzAngularM)
  if (urlState.adsBtzEnabled !== undefined) ext.setAdsBtzEnabled(urlState.adsBtzEnabled)
  if (urlState.adsHkllBoundarySource !== undefined)
    ext.setAdsHkllBoundarySource(urlState.adsHkllBoundarySource)
  if (urlState.adsHkllSourceSigma !== undefined)
    ext.setAdsHkllSourceSigma(urlState.adsHkllSourceSigma)
  if (urlState.adsHkllPlaneWaveM !== undefined) ext.setAdsHkllPlaneWaveM(urlState.adsHkllPlaneWaveM)
  if (urlState.adsHkllEnabled !== undefined) ext.setAdsHkllEnabled(urlState.adsHkllEnabled)
}

/**
 * Apply Anti-de Sitter URL state params.
 *
 * Preset first, then raw fields. A URL carrying only `ads_preset=…` restores
 * as that preset label; a URL with raw fields alongside cascades into
 * `custom` via the individual setters (each one flips `preset` to `custom`).
 */
function applyAdsParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  if (urlState.adsPreset !== undefined && urlState.adsPreset !== 'custom') {
    ext.setAdsPreset(urlState.adsPreset)
  }
  applyAdsBoundStateFields(urlState, ext)
  applyAdsStageTwoFields(urlState, ext)
}

/**
 * Apply Wheeler–DeWitt minisuperspace URL state params.
 *
 * Each setter (`setWdwBoundaryCondition`, `setWdwInflatonMass`,
 * `setWdwCosmologicalConstant`) clamps its input and flips
 * `wheelerDeWitt.needsReset` so the strategy re-runs the solver on the
 * next frame with the URL-supplied parameters.
 */
function applyWdwParams(
  urlState: ParsedShareableState,
  ext: ReturnType<typeof useExtendedObjectStore.getState>
): void {
  type Apply = (s: ParsedShareableState, e: typeof ext) => void
  const apply =
    (get: (s: ParsedShareableState) => unknown, run: Apply): Apply =>
    (s, e) => {
      if (get(s) !== undefined) run(s, e)
    }
  const steps: Apply[] = [
    apply(
      (s) => s.wdwBoundaryCondition,
      (s, e) => e.setWdwBoundaryCondition(s.wdwBoundaryCondition!)
    ),
    apply(
      (s) => s.wdwInflatonMass,
      (s, e) => e.setWdwInflatonMass(s.wdwInflatonMass!)
    ),
    apply(
      (s) => s.wdwInflatonMassAsymmetry,
      (s, e) => e.setWdwInflatonMassAsymmetry(s.wdwInflatonMassAsymmetry!)
    ),
    apply(
      (s) => s.wdwCosmologicalConstant,
      (s, e) => e.setWdwCosmologicalConstant(s.wdwCosmologicalConstant!)
    ),
    // Grid dimensions — physics-relevant: different Nphi/Na produce
    // numerically different χ. Applied as a single `setWdwGridDimensions`
    // call so both fields flip `needsReset` atomically (one solver re-run
    // per URL apply, not two).
    (s, e) => {
      if (s.wdwGridNa !== undefined || s.wdwGridNphi !== undefined) {
        const current = e.schroedinger.wheelerDeWitt
        e.setWdwGridDimensions(s.wdwGridNa ?? current.gridNa, s.wdwGridNphi ?? current.gridNphi)
      }
    },
    apply(
      (s) => s.wdwStreamlinesEnabled,
      (s, e) => e.setWdwStreamlinesEnabled(s.wdwStreamlinesEnabled!)
    ),
    apply(
      (s) => s.wdwStreamlineDensity,
      (s, e) => e.setWdwStreamlineDensity(s.wdwStreamlineDensity!)
    ),
    // Render-only animation effects — these setters do NOT flip needsReset.
    apply(
      (s) => s.wdwPhaseRotationEnabled,
      (s, e) => e.setWdwPhaseRotationEnabled(s.wdwPhaseRotationEnabled!)
    ),
    apply(
      (s) => s.wdwPhaseRotationSpeed,
      (s, e) => e.setWdwPhaseRotationSpeed(s.wdwPhaseRotationSpeed!)
    ),
    apply(
      (s) => s.wdwWorldlineEnabled,
      (s, e) => e.setWdwWorldlineEnabled(s.wdwWorldlineEnabled!)
    ),
    apply(
      (s) => s.wdwWorldlineSpeed,
      (s, e) => e.setWdwWorldlineSpeed(s.wdwWorldlineSpeed!)
    ),
    apply(
      (s) => s.wdwWorldlinePulseWidth,
      (s, e) => e.setWdwWorldlinePulseWidth(s.wdwWorldlinePulseWidth!)
    ),
    apply(
      (s) => s.wdwRenderDynamicRange,
      (s, e) => e.setWdwRenderDynamicRange(s.wdwRenderDynamicRange!)
    ),
    // SRMT diagnostic — display-only; these setters do not flip needsReset.
    apply(
      (s) => s.wdwSrmtEnabled,
      (s, e) => e.setWdwSrmtEnabled(s.wdwSrmtEnabled!)
    ),
    apply(
      (s) => s.wdwSrmtClock,
      (s, e) => e.setWdwSrmtClock(s.wdwSrmtClock!)
    ),
    apply(
      (s) => s.wdwSrmtCutNormalized,
      (s, e) => e.setWdwSrmtCutNormalized(s.wdwSrmtCutNormalized!)
    ),
    apply(
      (s) => s.wdwSrmtRankCap,
      (s, e) => e.setWdwSrmtRankCap(s.wdwSrmtRankCap!)
    ),
    apply(
      (s) => s.wdwSrmtHeatmapIntensity,
      (s, e) => e.setWdwSrmtHeatmapIntensity(s.wdwSrmtHeatmapIntensity!)
    ),
  ]
  for (const step of steps) step(urlState, ext)
}

/**
 * Queue the SRMT sweep configuration from URL params so the sweep
 * section can auto-dispatch it once the Wheeler–DeWitt strategy has
 * produced its first solver output. No-op when `sw` is absent.
 */
function applySrmtSweepParams(urlState: ParsedShareableState, effectiveQuantumMode: string): void {
  if (effectiveQuantumMode !== 'wheelerDeWitt') return
  if (!urlState.srmtSweepKind) return
  void import('@/stores/diagnostics/srmtSweepStore').then(({ useSrmtSweepStore }) => {
    useSrmtSweepStore.getState().setPendingSweep({
      kind: urlState.srmtSweepKind!,
      points: urlState.srmtSweepPoints,
      sweepMin: urlState.srmtSweepMin,
      sweepMax: urlState.srmtSweepMax,
      phiRef: urlState.srmtSweepPhiRef,
      cutAnchor: urlState.srmtSweepCutAnchor,
    })
  })
}

/** Apply coordinate entanglement URL state params (lazy import). */
function applyEntanglementParams(urlState: ParsedShareableState): void {
  if (urlState.entanglementEnabled === undefined) return

  void import('@/stores/diagnostics/coordinateEntanglementStore').then(
    ({ useCoordinateEntanglementStore }) => {
      const entStore = useCoordinateEntanglementStore.getState()
      entStore.setEnabled(urlState.entanglementEnabled!)
      if (urlState.entanglementPairwiseMI !== undefined) {
        entStore.setComputePairwiseMI(urlState.entanglementPairwiseMI)
      }
      if (urlState.entanglementBipartitions !== undefined) {
        entStore.setComputeBipartitions(urlState.entanglementBipartitions)
      }
    }
  )
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
    applyTdseMetricParams(urlState, ext)

    // ── Features ─────────────────────────────────────────────────────────────
    applyOpenQuantumParams(urlState, ext)
    applyStochasticParams(urlState, ext)
    applyBranchingParams(urlState, ext)
    applyWormholeParams(urlState, ext)
    applyEntanglementParams(urlState)
    applyCosmologyParams(urlState, ext)
    applyWdwParams(urlState, ext)
    applyAdsParams(urlState, ext)
    applySrmtSweepParams(urlState, ext.schroedinger.quantumMode)
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
async function loadSceneByName(sceneName: string): Promise<void> {
  try {
    const result = findSceneByName(sceneName)

    if (result) {
      if (result.source === 'saved') {
        usePresetManagerStore.getState().loadScene(result.id)
        logger.log(`[useUrlState] Loaded saved scene: "${sceneName}"`)
      } else {
        const loaded = await applySceneExample(result.id)
        if (loaded) logger.log(`[useUrlState] Loaded example scene: "${sceneName}"`)
      }
    } else {
      logger.warn(`[useUrlState] Scene "${sceneName}" not found in saved or example scenes`)
    }
  } catch (error) {
    logger.error(`[useUrlState] Failed to load scene "${sceneName}":`, error)
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
        void loadSceneByName(sceneName)
      } else {
        usePresetManagerStore.persist.onFinishHydration(() => {
          void loadSceneByName(sceneName)
        })
      }
      return
    }

    applyUrlStateParams(urlState)
  }, [])
}
