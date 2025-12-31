import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import {
  DEFAULT_MANDELBROT_CONFIG,
  DEFAULT_POLYTOPE_CONFIG,
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
} from '@/lib/geometry/extended/types'

describe('extendedObjectStore (invariants)', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('polytope scale setting clamps to safe range', () => {
    useExtendedObjectStore.getState().setPolytopeScale(999)
    expect(useExtendedObjectStore.getState().polytope.scale).toBe(8.0)

    useExtendedObjectStore.getState().setPolytopeScale(0.1)
    expect(useExtendedObjectStore.getState().polytope.scale).toBe(0.5)
  })

  it('wythoff preset updates scale and initializeWythoffForDimension downgrades D->B for <4D', () => {
    useExtendedObjectStore.getState().setWythoffPreset('rectified')
    expect(useExtendedObjectStore.getState().wythoffPolytope.scale).not.toBe(
      DEFAULT_WYTHOFF_POLYTOPE_CONFIG.scale
    )

    useExtendedObjectStore.getState().setWythoffSymmetryGroup('D')
    useExtendedObjectStore.getState().initializeWythoffForDimension(3)
    expect(useExtendedObjectStore.getState().wythoffPolytope.symmetryGroup).toBe('B')
  })

  it('mandelbulb quality preset updates related settings together', () => {
    useExtendedObjectStore.getState().setMandelbulbQualityPreset('draft')
    const draft = useExtendedObjectStore.getState().mandelbulb
    expect(draft.qualityPreset).toBe('draft')
    expect(draft.maxIterations).toBe(30)
    expect(draft.resolution).toBe(24)

    useExtendedObjectStore.getState().setMandelbulbQualityPreset('ultra')
    const ultra = useExtendedObjectStore.getState().mandelbulb
    expect(ultra.qualityPreset).toBe('ultra')
    expect(ultra.maxIterations).toBe(500)
    expect(ultra.resolution).toBe(96)
  })

  it('getMandelbulbConfig returns a copy (not a reference)', () => {
    useExtendedObjectStore.getState().setMandelbulbMaxIterations(150)
    const cfg = useExtendedObjectStore.getState().getMandelbulbConfig()
    expect(cfg.maxIterations).toBe(150)

    cfg.maxIterations = 999
    expect(useExtendedObjectStore.getState().mandelbulb.maxIterations).toBe(150)
  })

  it('reset restores defaults (spot-check a few slices)', () => {
    useExtendedObjectStore.getState().setPolytopeScale(8)
    useExtendedObjectStore.getState().setWythoffScale(5)
    useExtendedObjectStore.getState().setMandelbulbMaxIterations(200)

    useExtendedObjectStore.getState().reset()
    expect(useExtendedObjectStore.getState().polytope).toEqual({ ...DEFAULT_POLYTOPE_CONFIG })
    expect(useExtendedObjectStore.getState().wythoffPolytope).toEqual({ ...DEFAULT_WYTHOFF_POLYTOPE_CONFIG })
    expect(useExtendedObjectStore.getState().mandelbulb).toEqual({ ...DEFAULT_MANDELBROT_CONFIG })
  })
})


