/**
 * Tests for classical overlay store setters: hbar clamping and trail fraction.
 *
 * @module tests/stores/classicalOverlaySetters
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('classical overlay setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })

  it('has correct default values for classical overlay', () => {
    expect(DEFAULT_SCHROEDINGER_CONFIG.classicalOverlayEnabled).toBe(false)
    expect(DEFAULT_SCHROEDINGER_CONFIG.classicalOverlayTrailFraction).toBe(0.15)
    expect(DEFAULT_SCHROEDINGER_CONFIG.classicalOverlayColor).toBe('#fff2cc')
    expect(DEFAULT_SCHROEDINGER_CONFIG.classicalOverlayHbar).toBe(1.0)
  })

  it('setSchroedingerClassicalOverlayHbar clamps to valid range', () => {
    const store = useExtendedObjectStore

    store.getState().setSchroedingerClassicalOverlayHbar(0.5)
    expect(store.getState().schroedinger.classicalOverlayHbar).toBe(0.5)

    // Below minimum: clamps to 0.01
    store.getState().setSchroedingerClassicalOverlayHbar(-1)
    expect(store.getState().schroedinger.classicalOverlayHbar).toBe(0.01)

    // Above maximum: clamps to 2.0
    store.getState().setSchroedingerClassicalOverlayHbar(10)
    expect(store.getState().schroedinger.classicalOverlayHbar).toBe(2.0)
  })

  it('setSchroedingerClassicalOverlayEnabled toggles correctly', () => {
    const store = useExtendedObjectStore

    store.getState().setSchroedingerClassicalOverlayEnabled(true)
    expect(store.getState().schroedinger.classicalOverlayEnabled).toBe(true)

    store.getState().setSchroedingerClassicalOverlayEnabled(false)
    expect(store.getState().schroedinger.classicalOverlayEnabled).toBe(false)
  })

  it('setSchroedingerClassicalOverlayTrailFraction clamps to valid range', () => {
    const store = useExtendedObjectStore

    store.getState().setSchroedingerClassicalOverlayTrailFraction(0.3)
    expect(store.getState().schroedinger.classicalOverlayTrailFraction).toBe(0.3)

    // Below minimum: clamps to 0.1
    store.getState().setSchroedingerClassicalOverlayTrailFraction(0.01)
    expect(store.getState().schroedinger.classicalOverlayTrailFraction).toBe(0.1)

    // Above maximum: clamps to 1.0
    store.getState().setSchroedingerClassicalOverlayTrailFraction(5.0)
    expect(store.getState().schroedinger.classicalOverlayTrailFraction).toBe(1.0)
  })
})
