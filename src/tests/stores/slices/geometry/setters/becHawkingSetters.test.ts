/**
 * Tests for the analog-Hawking setters on the BEC slice.
 *
 * Validates that clamp bounds match the PRD for `hawkingVmax` and `hawkingLh`,
 * protecting against silent drift between the setter guard and the UI-exposed
 * slider range (which a URL or preset merge can bypass programmatically).
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('becHawkingSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getBec = () => useExtendedObjectStore.getState().schroedinger.bec

  describe('setBecHawkingVmax', () => {
    it('clamps below-range input up to PRD lower bound 0.5', () => {
      useExtendedObjectStore.getState().setBecHawkingVmax(0.2)
      expect(getBec().hawkingVmax).toBe(0.5)
    })

    it('clamps above-range input down to PRD upper bound 5.0', () => {
      useExtendedObjectStore.getState().setBecHawkingVmax(10)
      expect(getBec().hawkingVmax).toBe(5.0)
    })

    it('passes in-range values through unchanged', () => {
      useExtendedObjectStore.getState().setBecHawkingVmax(2.0)
      expect(getBec().hawkingVmax).toBe(2.0)
    })
  })

  describe('setBecHawkingLh', () => {
    it('clamps below-range input up to PRD lower bound 0.1', () => {
      useExtendedObjectStore.getState().setBecHawkingLh(0.05)
      expect(getBec().hawkingLh).toBe(0.1)
    })

    it('clamps above-range input down to PRD upper bound 1.5', () => {
      useExtendedObjectStore.getState().setBecHawkingLh(1.9)
      expect(getBec().hawkingLh).toBe(1.5)
    })

    it('passes in-range values through unchanged', () => {
      useExtendedObjectStore.getState().setBecHawkingLh(0.6)
      expect(getBec().hawkingLh).toBe(0.6)
    })
  })
})
