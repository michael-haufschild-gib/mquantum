/**
 * Quantum mode selection and quantum number setters.
 *
 * Extracted from schroedingerSlice to manage file size.
 * Follows the SetterContext pattern used by other domain setters.
 *
 * @module stores/slices/geometry/setters/quantumModeSetters
 */

import { resizeQuantumWalkArrays } from '@/lib/geometry/extended/quantumWalk'
import { getHydrogenNDPreset } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import type { HydrogenNDPresetName, SchroedingerConfig } from '@/lib/geometry/extended/types'
import { useGeometryStore } from '@/stores/geometryStore'

import type { SetterContext } from './sliceSetterUtils'
import { clampDtWithCfl } from './sliceSetterUtils'

/** Quantum modes that require 3D+ dimensions. */
const COMPUTE_MODES_3D = new Set([
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
])

/** Quantum modes that use compute pipelines (no inline wavefunction). */
const COMPUTE_MODES = new Set([
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
  'quantumWalk',
])

/**
 * Create quantum mode, representation, and quantum number setters.
 *
 * @param ctx - Setter context with Zustand set/get and validation helpers
 * @param resizers - Array resize functions from domain setters
 * @returns Object with all quantum mode and quantum number setters
 */
export function createQuantumModeSetters(
  ctx: SetterContext,
  resizers: {
    resizeFreeScalarArrays: (
      prev: SchroedingerConfig['freeScalar'],
      dim: number
    ) => Partial<SchroedingerConfig['freeScalar']>
    resizeTdseArrays: (
      prev: SchroedingerConfig['tdse'],
      dim: number
    ) => Partial<SchroedingerConfig['tdse']>
    resizeBecArrays: (
      prev: SchroedingerConfig['bec'],
      dim: number
    ) => Partial<SchroedingerConfig['bec']>
    resizeDiracArrays: (
      prev: SchroedingerConfig['dirac'],
      dim: number
    ) => Partial<SchroedingerConfig['dirac']>
  }
) {
  const { setWithVersion, get } = ctx
  const isFinite = ctx.isFinite
  const warn = ctx.warnNonFinite

  return {
    setSchroedingerQuantumMode: (mode: SchroedingerConfig['quantumMode']) => {
      const needsDim3 = COMPUTE_MODES_3D.has(mode)
      if (needsDim3 && useGeometryStore.getState().dimension < 3) {
        useGeometryStore.getState().setDimension(3)
      }
      setWithVersion((state) => {
        const updates: Partial<SchroedingerConfig> = { quantumMode: mode }
        const dim = useGeometryStore.getState().dimension

        // Force position representation and disable cross-section for compute modes
        if (COMPUTE_MODES.has(mode)) {
          if (state.schroedinger.representation !== 'position') updates.representation = 'position'
          if (state.schroedinger.crossSectionEnabled) updates.crossSectionEnabled = false
        }

        // Force position representation for hydrogen at dim=2
        // (momentum/Wigner not yet implemented for 2D hydrogen)
        const isHydrogen2D = dim === 2 && (mode === 'hydrogenND' || mode === 'hydrogenNDCoupled')
        if (isHydrogen2D && state.schroedinger.representation !== 'position') {
          updates.representation = 'position'
        }

        if (mode === 'freeScalarField') {
          const prev = state.schroedinger.freeScalar
          if (prev.latticeDim !== dim) {
            const resized = resizers.resizeFreeScalarArrays(prev, dim)
            const newSpacing = resized.spacing ?? prev.spacing
            const newDt = clampDtWithCfl(prev.dt, newSpacing, dim, prev.mass)
            updates.freeScalar = { ...prev, ...resized, dt: newDt, needsReset: true }
          }
        } else if (mode === 'tdseDynamics') {
          const prev = state.schroedinger.tdse
          if (prev.latticeDim !== dim) {
            const resized = resizers.resizeTdseArrays(prev, dim)
            const potentialType =
              dim < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : prev.potentialType
            updates.tdse = { ...prev, ...resized, potentialType, needsReset: true }
          }
        } else if (mode === 'becDynamics') {
          let becDim = dim
          if (becDim < 3) {
            useGeometryStore.getState().setDimension(3)
            becDim = 3
          }
          const prev = state.schroedinger.bec
          if (prev.latticeDim !== becDim) {
            const resized = resizers.resizeBecArrays(prev, becDim)
            updates.bec = { ...prev, ...resized, needsReset: true }
          }
        } else if (mode === 'diracEquation') {
          const prev = state.schroedinger.dirac
          if (prev.latticeDim !== dim) {
            const resized = resizers.resizeDiracArrays(prev, dim)
            updates.dirac = { ...prev, ...resized, needsReset: true }
          }
        } else if (mode === 'quantumWalk') {
          const prev = state.schroedinger.quantumWalk
          if (prev.latticeDim !== dim) {
            const resized = resizeQuantumWalkArrays(prev, dim)
            updates.quantumWalk = { ...prev, ...resized }
          }
        }
        return { schroedinger: { ...state.schroedinger, ...updates } }
      })
    },

    setSchroedingerRepresentation: (value: 'position' | 'momentum' | 'wigner') => {
      if (value !== 'position' && COMPUTE_MODES.has(get().schroedinger.quantumMode)) return
      // Block non-position for hydrogen at dim=2 (not yet implemented)
      if (value !== 'position') {
        const qm = get().schroedinger.quantumMode
        const dim = useGeometryStore.getState().dimension
        if (dim === 2 && (qm === 'hydrogenND' || qm === 'hydrogenNDCoupled')) return
      }
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, representation: value },
      }))
    },

    setSchroedingerPrincipalQuantumNumber: (n: number) => {
      if (!isFinite(n)) {
        warn('principalQuantumNumber', n)
        return
      }
      const clamped = Math.max(1, Math.min(7, Math.floor(n)))
      const currentL = get().schroedinger.azimuthalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber
      const newL = Math.min(currentL, clamped - 1)
      // `|| 0` normalizes JS -0 to 0 (Math.max(-0, ...) can produce -0 when bounds are 0)
      const newM = Math.max(-newL, Math.min(newL, currentM)) || 0
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          principalQuantumNumber: clamped,
          azimuthalQuantumNumber: newL,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerAzimuthalQuantumNumber: (l: number) => {
      if (!isFinite(l)) {
        warn('azimuthalQuantumNumber', l)
        return
      }
      const currentN = get().schroedinger.principalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber
      const clamped = Math.max(0, Math.min(currentN - 1, Math.floor(l)))
      // `|| 0` normalizes JS -0 to 0 (Math.max(-0, ...) can produce -0 when bounds are 0)
      const newM = Math.max(-clamped, Math.min(clamped, currentM)) || 0
      // Auto-clamp angular chain: each element must be <= l₁, cascade downward
      const chain = [...get().schroedinger.angularChain]
      let prevMax = clamped
      for (let i = 0; i < chain.length; i++) {
        chain[i] = Math.min(chain[i]!, prevMax)
        prevMax = chain[i]!
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          azimuthalQuantumNumber: clamped,
          magneticQuantumNumber: newM,
          angularChain: chain,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerMagneticQuantumNumber: (m: number) => {
      if (!isFinite(m)) {
        warn('magneticQuantumNumber', m)
        return
      }
      const currentL = get().schroedinger.azimuthalQuantumNumber
      // `|| 0` normalizes JS -0 to 0 (Math.max(-0, ...) can produce -0 when bounds are 0)
      const clamped = Math.max(-currentL, Math.min(currentL, Math.floor(m))) || 0
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          magneticQuantumNumber: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerUseRealOrbitals: (useRealOrbitals: boolean) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, useRealOrbitals, hydrogenNDPreset: 'custom' },
      }))
    },

    setSchroedingerBohrRadiusScale: (bohrRadiusScale: number) => {
      if (!isFinite(bohrRadiusScale)) {
        warn('bohrRadiusScale', bohrRadiusScale)
        return
      }
      const clamped = Math.max(0.5, Math.min(3.0, bohrRadiusScale))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bohrRadiusScale: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    // Hydrogen ND presets
    setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => {
      if (preset === 'custom') {
        setWithVersion((state) => ({
          schroedinger: { ...state.schroedinger, hydrogenNDPreset: preset },
        }))
        return
      }
      const presetData = getHydrogenNDPreset(preset)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          hydrogenNDPreset: preset,
          principalQuantumNumber: presetData.n,
          azimuthalQuantumNumber: presetData.l,
          magneticQuantumNumber: presetData.m,
          useRealOrbitals: presetData.useReal,
          bohrRadiusScale: presetData.bohrRadiusScale,
          extraDimQuantumNumbers: [...presetData.extraDimN],
          extraDimOmega: [...presetData.extraDimOmega],
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumber: (dimIndex: number, n: number) => {
      if (!Number.isInteger(dimIndex) || dimIndex < 0 || dimIndex >= 8) return
      if (!isFinite(n)) {
        warn('extraDimQuantumNumbers', n)
        return
      }
      const numbers = [...get().schroedinger.extraDimQuantumNumbers]
      numbers[dimIndex] = Math.max(0, Math.min(6, Math.floor(n)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: numbers,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumbers: (numbers: number[]) => {
      if (!ctx.hasOnlyFinite(numbers)) {
        warn('extraDimQuantumNumbers', numbers)
        return
      }
      const clamped = numbers.slice(0, 8).map((n) => Math.max(0, Math.min(6, Math.floor(n))))
      while (clamped.length < 8) clamped.push(0)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    /** Set a single angular chain value l_{k+2} for coupled hydrogen ND. */
    setSchroedingerAngularChainValue: (chainIndex: number, value: number) => {
      if (!Number.isInteger(chainIndex) || chainIndex < 0 || chainIndex >= 8) return
      if (!isFinite(value)) {
        warn('angularChain', value)
        return
      }
      const state = get().schroedinger
      const chain = [...state.angularChain]
      // Upper bound: previous element (or l₁ for the first)
      const upperBound =
        chainIndex === 0 ? state.azimuthalQuantumNumber : (chain[chainIndex - 1] ?? 0)
      chain[chainIndex] = Math.max(0, Math.min(upperBound, Math.floor(value)))
      // Cascade: clamp all subsequent elements to be <= this one
      for (let i = chainIndex + 1; i < chain.length; i++) {
        chain[i] = Math.min(chain[i]!, chain[i - 1]!)
      }
      setWithVersion((s) => ({
        schroedinger: { ...s.schroedinger, angularChain: chain },
      }))
    },

    setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => {
      const omegas = [...get().schroedinger.extraDimOmega]
      if (dimIndex < 0 || dimIndex >= 8) return
      if (!isFinite(omega)) {
        warn('extraDimOmega', omega)
        return
      }
      omegas[dimIndex] = Math.max(0.1, Math.min(2.0, omega))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: omegas },
      }))
    },

    setSchroedingerExtraDimOmegaAll: (omegas: number[]) => {
      if (!ctx.hasOnlyFinite(omegas)) {
        warn('extraDimOmegaAll', omegas)
        return
      }
      const clamped = omegas.slice(0, 8).map((o) => Math.max(0.1, Math.min(2.0, o)))
      while (clamped.length < 8) clamped.push(1.0)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: clamped, presetName: 'custom' },
      }))
    },

    setSchroedingerExtraDimFrequencySpread: (spread: number) => {
      if (!isFinite(spread)) {
        warn('extraDimFrequencySpread', spread)
        return
      }
      const clamped = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimFrequencySpread: clamped,
          presetName: 'custom',
        },
      }))
    },
  }
}
