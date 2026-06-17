import { beforeEach, describe, expect, it } from 'vitest'

import {
  BIFURCATION_HORIZON_PRESETS,
  DEFAULT_BIFURCATION_HORIZON_CONFIG,
} from '@/lib/geometry/extended/bifurcationHorizon'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const getConfig = () => useExtendedObjectStore.getState().schroedinger.bifurcationHorizon

describe('bifurcationHorizonSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('starts from the documented defaults (matching the eternalThroat preset)', () => {
    expect(getConfig()).toEqual(DEFAULT_BIFURCATION_HORIZON_CONFIG)
    expect({ ...BIFURCATION_HORIZON_PRESETS.eternalThroat, preset: 'eternalThroat' }).toEqual(
      DEFAULT_BIFURCATION_HORIZON_CONFIG
    )
  })

  it('clamps each numeric field to its documented range and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setBifurcationHorizonNeckRadius(2)
    expect(getConfig().neckRadius).toBe(0.6)
    expect(getConfig().preset).toBe('custom')

    s.setBifurcationHorizonNeckRadius(0.001)
    expect(getConfig().neckRadius).toBe(0.05)

    s.setBifurcationHorizonThroatWidth(0)
    expect(getConfig().throatWidth).toBe(0.05)

    s.setBifurcationHorizonThroatWidth(99)
    expect(getConfig().throatWidth).toBe(0.6)

    s.setBifurcationHorizonGlow(0)
    expect(getConfig().glow).toBe(0.2)

    s.setBifurcationHorizonGlow(99)
    expect(getConfig().glow).toBe(4)

    s.setBifurcationHorizonFlowRate(5)
    expect(getConfig().flowRate).toBe(1.5)

    s.setBifurcationHorizonSwirl(9)
    expect(getConfig().swirl).toBe(2)

    s.setBifurcationHorizonRedshiftRadius(2)
    expect(getConfig().redshiftRadius).toBe(1)

    s.setBifurcationHorizonOffLine(9)
    expect(getConfig().offLine).toBe(0.6)

    s.setBifurcationHorizonWinding(99)
    expect(getConfig().winding).toBe(4)

    s.setBifurcationHorizonThermalGain(9)
    expect(getConfig().thermalGain).toBe(2)
  })

  it('writes the exact in-range value through each numeric setter', () => {
    const s = useExtendedObjectStore.getState()
    s.setBifurcationHorizonNeckRadius(0.3)
    s.setBifurcationHorizonOffLine(0.25)
    expect(getConfig().neckRadius).toBeCloseTo(0.3, 6)
    expect(getConfig().offLine).toBeCloseTo(0.25, 6)
  })

  it('rejects non-finite values without mutating state', () => {
    const before = getConfig()
    useExtendedObjectStore.getState().setBifurcationHorizonGlow(Number.NaN)
    useExtendedObjectStore.getState().setBifurcationHorizonOffLine(Number.POSITIVE_INFINITY)
    expect(getConfig()).toEqual(before)
  })

  it('applies named presets wholesale and tags the preset id', () => {
    useExtendedObjectStore.getState().setBifurcationHorizonPreset('wedgeMirror')
    const config = getConfig()
    expect(config.preset).toBe('wedgeMirror')
    expect(config.neckRadius).toBe(BIFURCATION_HORIZON_PRESETS.wedgeMirror.neckRadius)
    expect(config.throatWidth).toBe(BIFURCATION_HORIZON_PRESETS.wedgeMirror.throatWidth)
    expect(config.offLine).toBe(BIFURCATION_HORIZON_PRESETS.wedgeMirror.offLine)
    expect(config.winding).toBe(BIFURCATION_HORIZON_PRESETS.wedgeMirror.winding)
    expect(config.thermalGain).toBe(BIFURCATION_HORIZON_PRESETS.wedgeMirror.thermalGain)
  })

  it('wedgeMirror preset displaces the rings off the throat (¬RH)', () => {
    useExtendedObjectStore.getState().setBifurcationHorizonPreset('wedgeMirror')
    expect(getConfig().offLine).toBeGreaterThan(0)
  })

  it('nearExtremal preset opens the captured redshift core', () => {
    useExtendedObjectStore.getState().setBifurcationHorizonPreset('nearExtremal')
    expect(getConfig().redshiftRadius).toBe(BIFURCATION_HORIZON_PRESETS.nearExtremal.redshiftRadius)
    expect(getConfig().redshiftRadius).toBeGreaterThan(0)
  })

  it('setting the custom preset leaves field values untouched', () => {
    const s = useExtendedObjectStore.getState()
    s.setBifurcationHorizonPreset('modularFlow')
    const fields = getConfig()
    s.setBifurcationHorizonPreset('custom')
    expect(getConfig().preset).toBe('custom')
    expect(getConfig().neckRadius).toBe(fields.neckRadius)
    expect(getConfig().flowRate).toBe(fields.flowRate)
  })

  it('an individual edit after a preset flips the tag to custom but keeps siblings', () => {
    const s = useExtendedObjectStore.getState()
    s.setBifurcationHorizonPreset('modularFlow')
    expect(getConfig().preset).toBe('modularFlow')

    s.setBifurcationHorizonGlow(3)
    expect(getConfig().preset).toBe('custom')
    expect(getConfig().glow).toBe(3)
    // The other modularFlow fields survive the single-field edit.
    expect(getConfig().flowRate).toBe(BIFURCATION_HORIZON_PRESETS.modularFlow.flowRate)
  })

  it('bumps the schroedinger version so the renderer re-packs uniforms', () => {
    const before = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setBifurcationHorizonOffLine(0.4)
    expect(useExtendedObjectStore.getState().schroedingerVersion).toBeGreaterThan(before)
  })

  it('sets the spectral-dynamics mode and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()
    s.setBifurcationHorizonPreset('modularFlow')
    s.setBifurcationHorizonSpectralDynamics('softMode')
    expect(getConfig().spectralDynamics).toBe('softMode')
    expect(getConfig().preset).toBe('custom')
    // Sibling fields from the prior preset survive the enum edit.
    expect(getConfig().flowRate).toBe(BIFURCATION_HORIZON_PRESETS.modularFlow.flowRate)
  })

  it('clamps the dynamics numeric fields and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()
    s.setBifurcationHorizonDynamicsAmplitude(9)
    expect(getConfig().dynamicsAmplitude).toBe(1)
    expect(getConfig().preset).toBe('custom')

    s.setBifurcationHorizonDynamicsAmplitude(-1)
    expect(getConfig().dynamicsAmplitude).toBe(0)

    s.setBifurcationHorizonDynamicsRate(99)
    expect(getConfig().dynamicsRate).toBe(3)

    s.setBifurcationHorizonStiffnessTint(9)
    expect(getConfig().stiffnessTint).toBe(1)
  })

  it('the spectralRigidity preset enables the soft-mode breathing', () => {
    useExtendedObjectStore.getState().setBifurcationHorizonPreset('spectralRigidity')
    const config = getConfig()
    expect(config.preset).toBe('spectralRigidity')
    expect(config.spectralDynamics).toBe('softMode')
    expect(config.dynamicsAmplitude).toBe(
      BIFURCATION_HORIZON_PRESETS.spectralRigidity.dynamicsAmplitude
    )
    expect(config.stiffnessTint).toBe(BIFURCATION_HORIZON_PRESETS.spectralRigidity.stiffnessTint)
  })

  it('rejects a non-finite dynamics value without mutating state', () => {
    const before = getConfig()
    useExtendedObjectStore.getState().setBifurcationHorizonDynamicsRate(Number.NaN)
    expect(getConfig()).toEqual(before)
  })
})
