/**
 * Tests for style examples loader — bundled style presets.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { applyStyleExample, findStyleByName, getStyleExamples } from '@/lib/styleExamples'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

describe('styleExamples', () => {
  beforeEach(() => {
    usePresetManagerStore.setState(usePresetManagerStore.getInitialState())
  })

  describe('getStyleExamples', () => {
    it('returns examples sorted alphabetically by name', () => {
      const examples = getStyleExamples()
      for (let i = 1; i < examples.length; i++) {
        expect(examples[i]!.name.localeCompare(examples[i - 1]!.name)).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('findStyleByName', () => {
    it('finds example styles by name (case-insensitive)', () => {
      const examples = getStyleExamples()
      if (examples.length === 0) return
      const first = examples[0]!
      const result = findStyleByName(first.name.toUpperCase())
      expect(result).toEqual({ id: first.id, source: 'example' })
    })

    it('returns null for empty string', () => {
      expect(findStyleByName('')).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(findStyleByName('   ')).toBeNull()
    })

    it('returns null for nonexistent name', () => {
      expect(findStyleByName('ThisStyleDefinitelyDoesNotExist12345')).toBeNull()
    })

    it('prioritizes saved styles over examples', () => {
      const examples = getStyleExamples()
      if (examples.length === 0) return
      const exampleName = examples[0]!.name

      // Add a saved style with the same name
      usePresetManagerStore.setState((s) => ({
        savedStyles: [
          ...s.savedStyles,
          { id: 'custom-saved', name: exampleName, data: {} } as never,
        ],
      }))

      const result = findStyleByName(exampleName)
      expect(result).toEqual({ id: 'custom-saved', source: 'saved' })
    })
  })

  describe('applyStyleExample', () => {
    it('returns false for unknown style ID', () => {
      expect(applyStyleExample('nonexistent-id')).toBe(false)
    })

    it('returns true for a valid style ID', () => {
      const examples = getStyleExamples()
      if (examples.length === 0) return
      const result = applyStyleExample(examples[0]!.id)
      expect(result).toBe(true)
    })
  })
})
