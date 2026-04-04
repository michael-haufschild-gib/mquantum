/**
 * Tests for TDSE stochastic decoherence setters.
 *
 * Validates clamping, non-finite rejection, and state transitions
 * for stochastic localization and branching visualization controls.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('TDSE stochastic setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

  describe('setTdseStochasticEnabled', () => {
    it('enables stochastic decoherence', () => {
      useExtendedObjectStore.getState().setTdseStochasticEnabled(true)
      expect(getTdse().stochasticEnabled).toBe(true)
    })

    it('disables stochastic decoherence', () => {
      useExtendedObjectStore.getState().setTdseStochasticEnabled(true)
      useExtendedObjectStore.getState().setTdseStochasticEnabled(false)
      expect(getTdse().stochasticEnabled).toBe(false)
    })
  })

  describe('setTdseStochasticGamma', () => {
    it('sets gamma within valid range', () => {
      useExtendedObjectStore.getState().setTdseStochasticGamma(2.5)
      expect(getTdse().stochasticGamma).toBe(2.5)
    })

    it('clamps gamma to [0, 10]', () => {
      useExtendedObjectStore.getState().setTdseStochasticGamma(-1)
      expect(getTdse().stochasticGamma).toBe(0)
      useExtendedObjectStore.getState().setTdseStochasticGamma(15)
      expect(getTdse().stochasticGamma).toBe(10)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseStochasticGamma(2.0)
      useExtendedObjectStore.getState().setTdseStochasticGamma(NaN)
      expect(getTdse().stochasticGamma).toBe(2.0)
    })

    it('rejects Infinity', () => {
      useExtendedObjectStore.getState().setTdseStochasticGamma(3.0)
      useExtendedObjectStore.getState().setTdseStochasticGamma(Infinity)
      expect(getTdse().stochasticGamma).toBe(3.0)
    })
  })

  describe('setTdseStochasticSigma', () => {
    it('sets sigma within valid range', () => {
      useExtendedObjectStore.getState().setTdseStochasticSigma(2.0)
      expect(getTdse().stochasticSigma).toBe(2.0)
    })

    it('clamps sigma to [0.5, 5.0]', () => {
      useExtendedObjectStore.getState().setTdseStochasticSigma(0.1)
      expect(getTdse().stochasticSigma).toBe(0.5)
      useExtendedObjectStore.getState().setTdseStochasticSigma(10)
      expect(getTdse().stochasticSigma).toBe(5.0)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseStochasticSigma(2.0)
      useExtendedObjectStore.getState().setTdseStochasticSigma(NaN)
      expect(getTdse().stochasticSigma).toBe(2.0)
    })
  })

  describe('setTdseStochasticNumSites', () => {
    it('sets numSites within valid range', () => {
      useExtendedObjectStore.getState().setTdseStochasticNumSites(8)
      expect(getTdse().stochasticNumSites).toBe(8)
    })

    it('clamps numSites to [1, 32] and floors', () => {
      useExtendedObjectStore.getState().setTdseStochasticNumSites(0)
      expect(getTdse().stochasticNumSites).toBe(1)
      useExtendedObjectStore.getState().setTdseStochasticNumSites(50)
      expect(getTdse().stochasticNumSites).toBe(32)
      useExtendedObjectStore.getState().setTdseStochasticNumSites(4.7)
      expect(getTdse().stochasticNumSites).toBe(4)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseStochasticNumSites(4)
      useExtendedObjectStore.getState().setTdseStochasticNumSites(NaN)
      expect(getTdse().stochasticNumSites).toBe(4)
    })
  })

  describe('setTdseStochasticSeed', () => {
    it('sets seed within valid range', () => {
      useExtendedObjectStore.getState().setTdseStochasticSeed(42)
      expect(getTdse().stochasticSeed).toBe(42)
    })

    it('clamps seed to [0, 999999] and floors', () => {
      useExtendedObjectStore.getState().setTdseStochasticSeed(-5)
      expect(getTdse().stochasticSeed).toBe(0)
      useExtendedObjectStore.getState().setTdseStochasticSeed(1_500_000)
      expect(getTdse().stochasticSeed).toBe(999999)
      useExtendedObjectStore.getState().setTdseStochasticSeed(42.8)
      expect(getTdse().stochasticSeed).toBe(42)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseStochasticSeed(42)
      useExtendedObjectStore.getState().setTdseStochasticSeed(NaN)
      expect(getTdse().stochasticSeed).toBe(42)
    })
  })

  describe('setTdseBranchingEnabled', () => {
    it('enables branching visualization', () => {
      useExtendedObjectStore.getState().setTdseBranchingEnabled(true)
      expect(getTdse().branchingEnabled).toBe(true)
    })

    it('disables branching visualization', () => {
      useExtendedObjectStore.getState().setTdseBranchingEnabled(true)
      useExtendedObjectStore.getState().setTdseBranchingEnabled(false)
      expect(getTdse().branchingEnabled).toBe(false)
    })
  })

  describe('setTdseBranchPlanePosition', () => {
    it('sets branch plane position', () => {
      useExtendedObjectStore.getState().setTdseBranchPlanePosition(0.5)
      expect(getTdse().branchPlanePosition).toBe(0.5)
    })

    it('clamps to [-1.0, 1.0]', () => {
      useExtendedObjectStore.getState().setTdseBranchPlanePosition(-2.0)
      expect(getTdse().branchPlanePosition).toBe(-1.0)
      useExtendedObjectStore.getState().setTdseBranchPlanePosition(2.0)
      expect(getTdse().branchPlanePosition).toBe(1.0)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseBranchPlanePosition(0.3)
      useExtendedObjectStore.getState().setTdseBranchPlanePosition(NaN)
      expect(getTdse().branchPlanePosition).toBe(0.3)
    })
  })

  describe('setTdseBranchColorA / setTdseBranchColorB', () => {
    it('sets branch color A', () => {
      useExtendedObjectStore.getState().setTdseBranchColorA([1.0, 0.5, 0.0])
      expect(getTdse().branchColorA).toEqual([1.0, 0.5, 0.0])
    })

    it('sets branch color B', () => {
      useExtendedObjectStore.getState().setTdseBranchColorB([0.0, 0.5, 1.0])
      expect(getTdse().branchColorB).toEqual([0.0, 0.5, 1.0])
    })
  })
})
