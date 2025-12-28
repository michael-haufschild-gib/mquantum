import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

// Mock msgBoxStore to prevent actual dialog displays
vi.mock('@/stores/msgBoxStore', () => ({
  useMsgBoxStore: {
    getState: () => ({
      showMsgBox: vi.fn(),
    }),
  },
}))

describe('presetManagerStore', () => {
  beforeEach(() => {
    usePresetManagerStore.setState({ savedStyles: [], savedScenes: [] })
    useAppearanceStore.setState({ edgeColor: '#ffffff' }) // minimal reset for test
    useAnimationStore.getState().reset()
    useRotationStore.getState().reset()
  })

  describe('style management', () => {
    it('should save and load a style', () => {
      // Setup initial state
      useAppearanceStore.setState({ edgeColor: '#ff0000' })

      // Save style
      usePresetManagerStore.getState().saveStyle('Red Edge')

      // Check it's saved
      const [firstStyle] = usePresetManagerStore.getState().savedStyles
      expect(firstStyle).toBeDefined()
      expect(firstStyle!.name).toBe('Red Edge')
      expect(firstStyle!.data.appearance.edgeColor).toBe('#ff0000')

      // Change state
      useAppearanceStore.setState({ edgeColor: '#00ff00' })

      // Load style
      usePresetManagerStore.getState().loadStyle(firstStyle!.id)

      // Check it's restored
      expect(useAppearanceStore.getState().edgeColor).toBe('#ff0000')
    })

    it('should delete a style', () => {
      usePresetManagerStore.getState().saveStyle('Test Style')
      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().deleteStyle(saved!.id)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
    })

    it('should rename a style', () => {
      usePresetManagerStore.getState().saveStyle('Original Name')
      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()
      expect(saved!.name).toBe('Original Name')

      usePresetManagerStore.getState().renameStyle(saved!.id, 'New Name')

      const [renamed] = usePresetManagerStore.getState().savedStyles
      expect(renamed!.name).toBe('New Name')
      expect(renamed!.id).toBe(saved!.id) // ID should remain the same
    })

    it('should trim whitespace when renaming a style', () => {
      usePresetManagerStore.getState().saveStyle('Original')
      const [saved] = usePresetManagerStore.getState().savedStyles

      usePresetManagerStore.getState().renameStyle(saved!.id, '  Trimmed Name  ')

      const [renamed] = usePresetManagerStore.getState().savedStyles
      expect(renamed!.name).toBe('Trimmed Name')
    })

    it('should not rename style to empty name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveStyle('Keep This Name')
      const [saved] = usePresetManagerStore.getState().savedStyles

      usePresetManagerStore.getState().renameStyle(saved!.id, '')

      const [unchanged] = usePresetManagerStore.getState().savedStyles
      expect(unchanged!.name).toBe('Keep This Name')
      expect(warnSpy).toHaveBeenCalledWith('Cannot rename style to empty name')
      warnSpy.mockRestore()
    })

    it('should not rename style to whitespace-only name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveStyle('Keep This Name')
      const [saved] = usePresetManagerStore.getState().savedStyles

      usePresetManagerStore.getState().renameStyle(saved!.id, '   ')

      const [unchanged] = usePresetManagerStore.getState().savedStyles
      expect(unchanged!.name).toBe('Keep This Name')
      expect(warnSpy).toHaveBeenCalledWith('Cannot rename style to empty name')
      warnSpy.mockRestore()
    })

    it('should not include transient state fields in saved styles', () => {
      // Set some transient state that shouldn't be saved
      useLightingStore.setState({ isDraggingLight: true })
      useEnvironmentStore.setState({ skyboxLoading: true })

      usePresetManagerStore.getState().saveStyle('Test Style')
      const [saved] = usePresetManagerStore.getState().savedStyles

      // Transient fields should be excluded
      expect(saved!.data.lighting.isDraggingLight).toBeUndefined()
      expect(saved!.data.environment.skyboxLoading).toBeUndefined()
      expect(saved!.data.environment.classicCubeTexture).toBeUndefined()
    })
  })

  describe('scene management', () => {
    it('should save and load a scene with animation', () => {
      // Setup animation state
      const animStore = useAnimationStore.getState()
      animStore.setSpeed(2.0)

      // Save scene
      usePresetManagerStore.getState().saveScene('Fast Scene')

      // Check saved
      const [firstScene] = usePresetManagerStore.getState().savedScenes
      expect(firstScene).toBeDefined()
      expect(firstScene!.data.animation.speed).toBe(2.0)

      // Check Set -> Array conversion (serialization shape)
      expect(Array.isArray(firstScene!.data.animation.animatingPlanes)).toBe(true)

      // Change state
      animStore.setSpeed(0.5)

      // Load scene
      usePresetManagerStore.getState().loadScene(firstScene!.id)

      // Check restored
      expect(useAnimationStore.getState().speed).toBe(2.0)
      expect(useAnimationStore.getState().animatingPlanes).toBeInstanceOf(Set)
    })

    it('should save and load a scene with rotation Map', () => {
      // Setup rotation state
      const rotStore = useRotationStore.getState()
      rotStore.setRotation('XY', 1.5)
      rotStore.setRotation('YZ', 2.0)

      // Save scene
      usePresetManagerStore.getState().saveScene('Rotated Scene')

      // Check saved - Map should be serialized as Object
      const [firstScene] = usePresetManagerStore.getState().savedScenes
      expect(firstScene).toBeDefined()
      expect(firstScene!.data.rotation.rotations).toBeDefined()
      // Verify it's an object (not Map or Array)
      expect(typeof firstScene!.data.rotation.rotations).toBe('object')
      expect(Array.isArray(firstScene!.data.rotation.rotations)).toBe(false)

      // Reset rotation
      rotStore.reset()
      expect(useRotationStore.getState().rotations.size).toBe(0)

      // Load scene
      usePresetManagerStore.getState().loadScene(firstScene!.id)

      // Check restored - should be back to Map
      const restoredRotations = useRotationStore.getState().rotations
      expect(restoredRotations).toBeInstanceOf(Map)
      expect(restoredRotations.get('XY')).toBeCloseTo(1.5, 5)
      expect(restoredRotations.get('YZ')).toBeCloseTo(2.0, 5)
    })

    it('should delete a scene', () => {
      usePresetManagerStore.getState().saveScene('Test Scene')
      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().deleteScene(saved!.id)
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
    })

    it('should rename a scene', () => {
      usePresetManagerStore.getState().saveScene('Original Scene')
      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()
      expect(saved!.name).toBe('Original Scene')

      usePresetManagerStore.getState().renameScene(saved!.id, 'Renamed Scene')

      const [renamed] = usePresetManagerStore.getState().savedScenes
      expect(renamed!.name).toBe('Renamed Scene')
      expect(renamed!.id).toBe(saved!.id) // ID should remain the same
    })

    it('should trim whitespace when renaming a scene', () => {
      usePresetManagerStore.getState().saveScene('Original')
      const [saved] = usePresetManagerStore.getState().savedScenes

      usePresetManagerStore.getState().renameScene(saved!.id, '  Trimmed Scene  ')

      const [renamed] = usePresetManagerStore.getState().savedScenes
      expect(renamed!.name).toBe('Trimmed Scene')
    })

    it('should not rename scene to empty name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveScene('Keep This Name')
      const [saved] = usePresetManagerStore.getState().savedScenes

      usePresetManagerStore.getState().renameScene(saved!.id, '')

      const [unchanged] = usePresetManagerStore.getState().savedScenes
      expect(unchanged!.name).toBe('Keep This Name')
      expect(warnSpy).toHaveBeenCalledWith('Cannot rename scene to empty name')
      warnSpy.mockRestore()
    })

    it('should not rename scene to whitespace-only name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveScene('Keep This Name')
      const [saved] = usePresetManagerStore.getState().savedScenes

      usePresetManagerStore.getState().renameScene(saved!.id, '   ')

      const [unchanged] = usePresetManagerStore.getState().savedScenes
      expect(unchanged!.name).toBe('Keep This Name')
      expect(warnSpy).toHaveBeenCalledWith('Cannot rename scene to empty name')
      warnSpy.mockRestore()
    })
  })

  describe('import validation', () => {
    it('should reject invalid JSON for styles', () => {
      const ok = usePresetManagerStore.getState().importStyles('not valid json')
      expect(ok).toBe(false)
    })

    it('should reject non-array data for styles', () => {
      const ok = usePresetManagerStore.getState().importStyles('{"foo": "bar"}')
      expect(ok).toBe(false)
    })

    it('should reject incomplete style data', () => {
      // Missing required fields (lighting, postProcessing, environment)
      const incompleteStyle = {
        id: 'test-id',
        name: 'Incomplete Style',
        timestamp: 123,
        data: { appearance: { edgeColor: '#0000ff' } },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([incompleteStyle]))
      expect(ok).toBe(false)
    })

    it('should accept complete style data', () => {
      const completeStyle = {
        id: 'test-id',
        name: 'Complete Style',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#0000ff' },
          lighting: { lightEnabled: true },
          postProcessing: { bloomEnabled: false },
          environment: { skyboxEnabled: false },
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([completeStyle]))
      expect(ok).toBe(true)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(1)
    })

    it('should reject invalid JSON for scenes', () => {
      const ok = usePresetManagerStore.getState().importScenes('not valid json')
      expect(ok).toBe(false)
    })

    it('should reject incomplete scene data', () => {
      // Missing required fields
      const incompleteScene = {
        id: 'test-id',
        name: 'Incomplete Scene',
        timestamp: 123,
        data: { geometry: { dimension: 4 } },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([incompleteScene]))
      expect(ok).toBe(false)
    })

    it('should accept complete scene data', () => {
      const completeScene = {
        id: 'test-id',
        name: 'Complete Scene',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#0000ff' },
          lighting: { lightEnabled: true },
          postProcessing: { bloomEnabled: false },
          environment: { skyboxEnabled: false },
          geometry: { dimension: 4, objectType: 'hypercube' },
          extended: { polytope: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: { speed: 1 },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: { showAxisHelper: true },
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([completeScene]))
      expect(ok).toBe(true)
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(1)
    })
  })

  describe('import duplicate handling', () => {
    it('should regenerate IDs for imported styles', () => {
      const style = {
        id: 'original-id',
        name: 'Test Style',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
        },
      }

      usePresetManagerStore.getState().importStyles(JSON.stringify([style]))
      const [imported] = usePresetManagerStore.getState().savedStyles

      // ID should be regenerated (not the original)
      expect(imported!.id).not.toBe('original-id')
      // Timestamp should be updated
      expect(imported!.timestamp).toBeGreaterThan(123)
    })

    it('should append (imported) to duplicate style names', () => {
      // First, save a style with a name
      usePresetManagerStore.getState().saveStyle('My Style')

      // Import a style with the same name
      const duplicateStyle = {
        id: 'other-id',
        name: 'My Style',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
        },
      }

      usePresetManagerStore.getState().importStyles(JSON.stringify([duplicateStyle]))

      const styles = usePresetManagerStore.getState().savedStyles
      expect(styles).toHaveLength(2)
      expect(styles[0]!.name).toBe('My Style')
      expect(styles[1]!.name).toBe('My Style (imported)')
    })

    it('should regenerate IDs for imported scenes', () => {
      const scene = {
        id: 'original-id',
        name: 'Test Scene',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
          geometry: {},
          extended: {},
          transform: {},
          rotation: {},
          animation: {},
          camera: {},
          ui: {},
        },
      }

      usePresetManagerStore.getState().importScenes(JSON.stringify([scene]))
      const [imported] = usePresetManagerStore.getState().savedScenes

      // ID should be regenerated
      expect(imported!.id).not.toBe('original-id')
      // Timestamp should be updated
      expect(imported!.timestamp).toBeGreaterThan(123)
    })

    it('should append (imported) to duplicate scene names', () => {
      // First, save a scene with a name
      usePresetManagerStore.getState().saveScene('My Scene')

      // Import a scene with the same name
      const duplicateScene = {
        id: 'other-id',
        name: 'My Scene',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
          geometry: {},
          extended: {},
          transform: {},
          rotation: {},
          animation: {},
          camera: {},
          ui: {},
        },
      }

      usePresetManagerStore.getState().importScenes(JSON.stringify([duplicateScene]))

      const scenes = usePresetManagerStore.getState().savedScenes
      expect(scenes).toHaveLength(2)
      expect(scenes[0]!.name).toBe('My Scene')
      expect(scenes[1]!.name).toBe('My Scene (imported)')
    })
  })

  describe('export functionality', () => {
    it('should export styles as valid JSON', () => {
      usePresetManagerStore.getState().saveStyle('Style 1')
      usePresetManagerStore.getState().saveStyle('Style 2')

      const exported = usePresetManagerStore.getState().exportStyles()
      const parsed = JSON.parse(exported)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].name).toBe('Style 1')
      expect(parsed[1].name).toBe('Style 2')
    })

    it('should export scenes as valid JSON', () => {
      usePresetManagerStore.getState().saveScene('Scene 1')
      usePresetManagerStore.getState().saveScene('Scene 2')

      const exported = usePresetManagerStore.getState().exportScenes()
      const parsed = JSON.parse(exported)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].name).toBe('Scene 1')
      expect(parsed[1].name).toBe('Scene 2')
    })
  })

  describe('edge cases', () => {
    it('should handle loading non-existent style gracefully', () => {
      // Should not throw
      expect(() => {
        usePresetManagerStore.getState().loadStyle('non-existent-id')
      }).not.toThrow()
    })

    it('should handle loading non-existent scene gracefully', () => {
      // Should not throw
      expect(() => {
        usePresetManagerStore.getState().loadScene('non-existent-id')
      }).not.toThrow()
    })

    it('should handle empty imports gracefully', () => {
      const okStyles = usePresetManagerStore.getState().importStyles('[]')
      expect(okStyles).toBe(true)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)

      const okScenes = usePresetManagerStore.getState().importScenes('[]')
      expect(okScenes).toBe(true)
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
    })
  })

  describe('legacy data handling', () => {
    it('should handle legacy style without skyboxEnabled', () => {
      // Import legacy style missing skyboxEnabled field
      const legacyStyle = {
        id: 'legacy-id',
        name: 'Legacy Style',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000' },
          lighting: { lightEnabled: true },
          postProcessing: { bloomEnabled: false },
          environment: { classicSkyboxType: 'sunset' }, // No skyboxEnabled
        },
      }

      usePresetManagerStore.getState().importStyles(JSON.stringify([legacyStyle]))
      const [imported] = usePresetManagerStore.getState().savedStyles

      // Load the legacy style
      usePresetManagerStore.getState().loadStyle(imported!.id)

      // Should have set skyboxEnabled to false as fallback
      expect(useEnvironmentStore.getState().skyboxEnabled).toBe(false)
    })

    it('should handle legacy scene without skyboxEnabled', () => {
      // Import legacy scene missing skyboxEnabled field
      const legacyScene = {
        id: 'legacy-id',
        name: 'Legacy Scene',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000' },
          lighting: { lightEnabled: true },
          postProcessing: { bloomEnabled: false },
          environment: { classicSkyboxType: 'sunset' }, // No skyboxEnabled
          geometry: { dimension: 4, objectType: 'hypercube' },
          extended: {},
          transform: {},
          rotation: { rotations: {} },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      usePresetManagerStore.getState().importScenes(JSON.stringify([legacyScene]))
      const [imported] = usePresetManagerStore.getState().savedScenes

      // Load the legacy scene
      usePresetManagerStore.getState().loadScene(imported!.id)

      // Should have set skyboxEnabled to false as fallback
      expect(useEnvironmentStore.getState().skyboxEnabled).toBe(false)
    })
  })

  describe('name validation', () => {
    it('should reject empty style name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveStyle('')
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith('Cannot save style with empty name')
      warnSpy.mockRestore()
    })

    it('should reject whitespace-only style name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveStyle('   ')
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith('Cannot save style with empty name')
      warnSpy.mockRestore()
    })

    it('should trim whitespace from style name', () => {
      usePresetManagerStore.getState().saveStyle('  Trimmed Style  ')
      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved!.name).toBe('Trimmed Style')
    })

    it('should reject empty scene name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveScene('')
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith('Cannot save scene with empty name')
      warnSpy.mockRestore()
    })

    it('should reject whitespace-only scene name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      usePresetManagerStore.getState().saveScene('   \t\n   ')
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith('Cannot save scene with empty name')
      warnSpy.mockRestore()
    })

    it('should trim whitespace from scene name', () => {
      usePresetManagerStore.getState().saveScene('  Trimmed Scene  ')
      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved!.name).toBe('Trimmed Scene')
    })
  })
})
