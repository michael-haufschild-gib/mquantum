import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useUIStore } from '@/stores/uiStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useTransformStore } from '@/stores/transformStore'
import { usePBRStore } from '@/stores/pbrStore'
import { APPEARANCE_INITIAL_STATE } from '@/stores/slices/appearanceSlice'
import { DEFAULT_FACE_PBR } from '@/stores/defaults/visualDefaults'

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

    it('normalizes imported style lighting scalar fields to store invariants on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Out Of Range Lighting',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {
            lightHorizontalAngle: -450,
            lightVerticalAngle: 200,
            ambientIntensity: 5,
            lightStrength: -2,
            exposure: 99,
          },
          postProcessing: {},
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const lighting = useLightingStore.getState()
      expect(lighting.lightHorizontalAngle).toBe(270)
      expect(lighting.lightVerticalAngle).toBe(90)
      expect(lighting.ambientIntensity).toBe(1)
      expect(lighting.lightStrength).toBe(0)
      expect(lighting.exposure).toBe(3)
    })

    it('resets PBR to defaults when loading imported style without pbr payload', () => {
      usePBRStore.getState().setFaceRoughness(0.82)
      usePBRStore.getState().setFaceMetallic(0.73)
      usePBRStore.getState().setFaceSpecularIntensity(1.6)
      usePBRStore.getState().setFaceSpecularColor('#123456')

      const importedStyle = {
        id: 'style-id',
        name: 'Legacy Style Without PBR',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff00ff' },
          lighting: {},
          postProcessing: {},
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      expect(usePBRStore.getState().face).toEqual(DEFAULT_FACE_PBR)
    })

    it('normalizes imported style light entries to runtime light constraints on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Out Of Range Lights',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {
            lights: [
              {
                id: 'light-1',
                name: 'Imported Light',
                type: 'spot',
                enabled: true,
                position: [1, 2, 3],
                rotation: [0, 0, 0],
                color: '#ffffff',
                intensity: -5,
                coneAngle: 300,
                penumbra: -1,
                range: -10,
                decay: 9,
              },
            ],
            selectedLightId: 'light-1',
          },
          postProcessing: {},
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const lighting = useLightingStore.getState()
      const importedLight = lighting.lights.find((light) => light.id === 'light-1')
      expect(importedLight).toBeDefined()
      expect(importedLight!.intensity).toBe(0.1)
      expect(importedLight!.coneAngle).toBe(120)
      expect(importedLight!.penumbra).toBe(0)
      expect(importedLight!.range).toBe(1)
      expect(importedLight!.decay).toBe(3)
      expect(lighting.selectedLightId).toBe('light-1')
    })

    it('drops unknown imported style lighting fields on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Unknown Lighting Field',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {
            mysteryLighting: true,
            lightStrength: 1.5,
          },
          postProcessing: {},
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const lighting = useLightingStore.getState() as Record<string, unknown>
      expect(lighting.lightStrength).toBe(1.5)
      expect(lighting.mysteryLighting).toBeUndefined()
    })

    it('normalizes imported style post-processing payload to store invariants on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Out Of Range Post Processing',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {
            bloomEnabled: 'yes',
            bloomGain: -10,
            bloomThreshold: 9,
            bloomKnee: -4,
            bloomRadius: 10,
            antiAliasingMethod: 'taa',
            cinematicAberration: 1,
            cinematicVignette: -1,
            cinematicGrain: 3,
            paperContrast: 2,
            paperRoughness: -1,
            paperFiber: 3,
            paperFiberSize: -1,
            paperCrumples: 3,
            paperCrumpleSize: 99,
            paperFolds: -5,
            paperFoldCount: 99,
            paperDrops: -2,
            paperFade: 9,
            paperSeed: -100,
            paperQuality: 'ultra',
            paperIntensity: 4,
            frameBlendingEnabled: 'true',
            frameBlendingFactor: -9,
          },
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const pp = usePostProcessingStore.getState()
      expect(pp.bloomEnabled).toBe(false)
      expect(pp.bloomGain).toBe(0)
      expect(pp.bloomThreshold).toBe(5)
      expect(pp.bloomKnee).toBe(0)
      expect(pp.bloomRadius).toBe(4)
      expect(pp.antiAliasingMethod).toBe('none')

      expect(pp.cinematicAberration).toBe(0.1)
      expect(pp.cinematicVignette).toBe(0)
      expect(pp.cinematicGrain).toBe(0.2)

      expect(pp.paperContrast).toBe(1)
      expect(pp.paperRoughness).toBe(0)
      expect(pp.paperFiber).toBe(1)
      expect(pp.paperFiberSize).toBe(0.1)
      expect(pp.paperCrumples).toBe(1)
      expect(pp.paperCrumpleSize).toBe(2)
      expect(pp.paperFolds).toBe(0)
      expect(pp.paperFoldCount).toBe(15)
      expect(pp.paperDrops).toBe(0)
      expect(pp.paperFade).toBe(1)
      expect(pp.paperSeed).toBe(0)
      expect(pp.paperQuality).toBe('medium')
      expect(pp.paperIntensity).toBe(1)

      expect(pp.frameBlendingEnabled).toBe(false)
      expect(pp.frameBlendingFactor).toBe(0)
    })

    it('drops unknown imported style post-processing fields on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Unknown Post Processing Field',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {
            mysteryEffect: true,
            bloomEnabled: true,
          },
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const pp = usePostProcessingStore.getState() as Record<string, unknown>
      expect(pp.bloomEnabled).toBe(true)
      expect(pp.mysteryEffect).toBeUndefined()
    })

    it('normalizes imported style PBR payload to store invariants on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Out Of Range PBR',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
          pbr: {
            face: {
              roughness: -5,
              metallic: 99,
              specularIntensity: -2,
              specularColor: '#123456',
            },
          },
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const pbr = usePBRStore.getState()
      expect(pbr.face.roughness).toBe(0.04)
      expect(pbr.face.metallic).toBe(1)
      expect(pbr.face.specularIntensity).toBe(0)
      expect(pbr.face.specularColor).toBe('#123456')
    })

    it('preserves missing PBR face fields when imported payload is partial', () => {
      usePBRStore.getState().setFacePBR({
        roughness: 0.55,
        metallic: 0.77,
        specularIntensity: 1.4,
        specularColor: '#abcdef',
      })

      const importedStyle = {
        id: 'style-id',
        name: 'Partial PBR Face',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
          pbr: {
            face: {
              roughness: 0.8,
            },
          },
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const pbr = usePBRStore.getState()
      expect(pbr.face.roughness).toBe(0.8)
      expect(pbr.face.metallic).toBe(0.77)
      expect(pbr.face.specularIntensity).toBe(1.4)
      expect(pbr.face.specularColor).toBe('#abcdef')
    })

    it('drops unknown imported style PBR fields on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Unknown PBR Field',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {},
          pbr: {
            mysteryPbr: true,
            face: {
              roughness: 0.6,
            },
          },
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const pbr = usePBRStore.getState() as Record<string, unknown>
      expect((pbr.face as Record<string, unknown>).roughness).toBe(0.6)
      expect(pbr.mysteryPbr).toBeUndefined()
    })

    it('normalizes imported style appearance payload to store invariants on load', () => {
      useAppearanceStore.setState(APPEARANCE_INITIAL_STATE)
      useAppearanceStore.getState().setColorAlgorithm('phase')
      useAppearanceStore.getState().setPerDimensionColorEnabled(true)
      useAppearanceStore.getState().setShaderType('wireframe')
      useAppearanceStore.getState().setPhaseDivergingSettings({
        neutralColor: '#111111',
      })
      useAppearanceStore.getState().setDivergingPsiSettings({
        component: 'imag',
      })

      const importedStyle = {
        id: 'style-id',
        name: 'Out Of Range Appearance',
        timestamp: 123,
        data: {
          appearance: {
            colorAlgorithm: 'invalid',
            perDimensionColorEnabled: 'yes',
            shaderType: 'toon',
            lchLightness: -3,
            lchChroma: 2,
            faceEmission: -7,
            faceEmissionThreshold: 5,
            faceEmissionColorShift: -3,
            distribution: {
              power: 0.1,
              cycles: 9,
              offset: -2,
            },
            multiSourceWeights: {
              depth: -1,
              orbitTrap: 2,
              normal: 'bad',
            },
            domainColoring: {
              modulusMode: 'bad',
              contoursEnabled: 'yes',
              contourDensity: 0,
              contourWidth: 1,
              contourStrength: 2,
            },
            phaseDiverging: {
              neutralColor: 42,
              positiveColor: '#00ff00',
              negativeColor: '#0000ff',
            },
            divergingPsi: {
              neutralColor: '#101010',
              positiveColor: '#202020',
              negativeColor: '#303030',
              intensityFloor: 4,
              component: 'phase',
            },
            shaderSettings: {
              wireframe: {
                lineThickness: 99,
              },
              surface: {
                specularIntensity: -5,
              },
            },
            sssEnabled: 'true',
            sssIntensity: 9,
            sssThickness: 0,
            sssJitter: -2,
            cosineCoefficients: {
              a: [-1, 3, 0.5],
              b: [0.1, 0.2, 0.3],
              c: [0.4, 0.5, 0.6],
              d: [0, 0, 0],
            },
          },
          lighting: {},
          postProcessing: {},
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const appearance = useAppearanceStore.getState()
      expect(appearance.colorAlgorithm).toBe('phase')
      expect(appearance.perDimensionColorEnabled).toBe(true)
      expect(appearance.shaderType).toBe('wireframe')

      expect(appearance.lchLightness).toBe(0.1)
      expect(appearance.lchChroma).toBe(0.4)
      expect(appearance.faceEmission).toBe(0)
      expect(appearance.faceEmissionThreshold).toBe(1)
      expect(appearance.faceEmissionColorShift).toBe(-1)

      expect(appearance.distribution).toEqual({
        power: 0.25,
        cycles: 5,
        offset: 0,
      })
      expect(appearance.multiSourceWeights).toEqual({
        depth: 0,
        orbitTrap: 1,
        normal: 0.2,
      })

      expect(appearance.domainColoring.modulusMode).toBe('logPsiAbsSquared')
      expect(appearance.domainColoring.contoursEnabled).toBe(true)
      expect(appearance.domainColoring.contourDensity).toBe(1)
      expect(appearance.domainColoring.contourWidth).toBe(0.25)
      expect(appearance.domainColoring.contourStrength).toBe(1)

      expect(appearance.phaseDiverging.neutralColor).toBe('#111111')
      expect(appearance.phaseDiverging.positiveColor).toBe('#00ff00')
      expect(appearance.phaseDiverging.negativeColor).toBe('#0000ff')

      expect(appearance.divergingPsi.neutralColor).toBe('#101010')
      expect(appearance.divergingPsi.positiveColor).toBe('#202020')
      expect(appearance.divergingPsi.negativeColor).toBe('#303030')
      expect(appearance.divergingPsi.intensityFloor).toBe(1)
      expect(appearance.divergingPsi.component).toBe('imag')

      expect(appearance.shaderSettings.wireframe.lineThickness).toBe(5)
      expect(appearance.shaderSettings.surface.specularIntensity).toBe(0)

      expect(appearance.sssEnabled).toBe(false)
      expect(appearance.sssIntensity).toBe(2)
      expect(appearance.sssThickness).toBe(0.1)
      expect(appearance.sssJitter).toBe(0)

      expect(appearance.cosineCoefficients.a).toEqual([0, 2, 0.5])
    })

    it('drops unknown imported style environment fields on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Unknown Environment Field',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: {
            mysteryEnvironment: true,
            skyboxSelection: 'space_red',
          },
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const environment = useEnvironmentStore.getState() as Record<string, unknown>
      expect(environment.skyboxSelection).toBe('space_red')
      expect(environment.mysteryEnvironment).toBeUndefined()
    })

    it('drops unknown imported style appearance fields on load', () => {
      const importedStyle = {
        id: 'style-id',
        name: 'Unknown Appearance Field',
        timestamp: 123,
        data: {
          appearance: {
            mysteryAppearance: true,
            edgeColor: '#123123',
          },
          lighting: {},
          postProcessing: {},
          environment: {},
        },
      }

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify([importedStyle]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadStyle(saved!.id)

      const appearance = useAppearanceStore.getState() as Record<string, unknown>
      expect(appearance.edgeColor).toBe('#123123')
      expect(appearance.mysteryAppearance).toBeUndefined()
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

    it('should not include version counters in saved styles', () => {
      // Version counters are auto-incremented by stores and should never be persisted
      usePresetManagerStore.getState().saveStyle('Test Style')
      const [saved] = usePresetManagerStore.getState().savedStyles

      // Version fields should be excluded from all store data
      expect(saved!.data.appearance.appearanceVersion).toBeUndefined()
      expect(saved!.data.environment.iblVersion).toBeUndefined()
      expect(saved!.data.environment.groundVersion).toBeUndefined()
      expect(saved!.data.environment.skyboxVersion).toBeUndefined()
      expect(saved!.data.lighting.version).toBeUndefined()
      expect(saved!.data.postProcessing.gravityVersion).toBeUndefined()
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

    it('resets PBR to defaults when loading imported scene without pbr payload', () => {
      usePBRStore.getState().setFaceRoughness(0.9)
      usePBRStore.getState().setFaceMetallic(0.8)
      usePBRStore.getState().setFaceSpecularIntensity(1.8)
      usePBRStore.getState().setFaceSpecularColor('#abcdef')

      const importedScene = {
        id: 'scene-id',
        name: 'Legacy Scene Without PBR',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: { speed: 1, animatingPlanes: ['XY'] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadScene(saved!.id)

      expect(usePBRStore.getState().face).toEqual(DEFAULT_FACE_PBR)
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

    it('clamps imported scene animationBias to the UI contract [0, 1] on load', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Out Of Range Bias',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 4, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: { animationBias: 42 },
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      useUIStore.setState({ animationBias: 0 })
      usePresetManagerStore.getState().loadScene(saved!.id)

      expect(useUIStore.getState().animationBias).toBe(1)
    })

    it('normalizes imported scene UI payload fields to store invariants on load', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Invalid UI Payload',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 4, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {
            animationBias: -3,
            showAxisHelper: 'yes',
            showPerfMonitor: 'no',
            perfMonitorExpanded: 'open',
            perfMonitorTab: 'gpu',
            mysteryFlag: true,
          },
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      useUIStore.setState({
        showAxisHelper: true,
        showPerfMonitor: false,
        perfMonitorExpanded: true,
        perfMonitorTab: 'shader',
      })

      usePresetManagerStore.getState().loadScene(saved!.id)

      const ui = useUIStore.getState()
      expect(ui.animationBias).toBe(0)
      expect(ui.showAxisHelper).toBe(true)
      expect(ui.showPerfMonitor).toBe(false)
      expect(ui.perfMonitorExpanded).toBe(true)
      expect(ui.perfMonitorTab).toBe('shader')
      expect(ui.showDepthBuffer).toBe(false)
      expect(ui.showNormalBuffer).toBe(false)
      expect(ui.showTemporalDepthBuffer).toBe(false)
      expect((ui as Record<string, unknown>).mysteryFlag).toBeUndefined()
    })

    it('ignores non-finite numeric fields from imported scene payloads', () => {
      // NOTE: Use raw JSON so 1e309 survives parsing as Infinity.
      const importedSceneJson = `[
        {
          "id": "scene-id",
          "name": "Infinite Numeric Scene",
          "timestamp": 123,
          "data": {
            "appearance": {},
            "lighting": {},
            "postProcessing": {},
            "environment": { "skyboxEnabled": true, "skyboxIntensity": 1e309 },
            "geometry": { "dimension": 3, "objectType": "schroedinger" },
            "extended": { "schroedinger": {} },
            "transform": { "uniformScale": 1 },
            "rotation": { "rotations": {} },
            "animation": { "speed": 1e309, "animatingPlanes": ["XY"] },
            "camera": { "position": [0, 0, 5], "target": [0, 0, 0] },
            "ui": {}
          }
        }
      ]`

      const ok = usePresetManagerStore.getState().importScenes(importedSceneJson)
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      useEnvironmentStore.getState().setSkyboxIntensity(1.25)
      useAnimationStore.getState().setSpeed(0.75)

      usePresetManagerStore.getState().loadScene(saved!.id)

      expect(useEnvironmentStore.getState().skyboxIntensity).toBe(1.25)
      expect(useAnimationStore.getState().speed).toBe(0.75)
    })

    it('keeps transform dimension aligned with loaded geometry when importing scenes', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Mismatched Transform Dimension',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 4, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: {
            uniformScale: 1.75,
            perAxisScale: [1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75],
            scaleLocked: true,
            dimension: 11,
          },
          rotation: { rotations: { XY: 0.75, XW: 'bad-angle' }, dimension: 11 },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      useGeometryStore.getState().setDimension(3)
      useTransformStore.getState().setDimension(3)
      usePresetManagerStore.getState().loadScene(saved!.id)

      expect(useGeometryStore.getState().dimension).toBe(4)
      expect(useTransformStore.getState().dimension).toBe(4)
      expect(useTransformStore.getState().uniformScale).toBe(1.75)
      expect(useTransformStore.getState().perAxisScale).toHaveLength(4)
      expect(useTransformStore.getState().perAxisScale.every((s) => s === 1.75)).toBe(true)
      expect(useRotationStore.getState().dimension).toBe(4)
      expect(useRotationStore.getState().rotations.get('XY')).toBeCloseTo(0.75, 6)
      expect(useRotationStore.getState().rotations.has('XW')).toBe(false)
    })

    it('filters imported animation planes to the loaded geometry dimension', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Mismatched Animation Planes',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: { speed: 1, isPlaying: true, animatingPlanes: ['XY', 'XW'] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadScene(saved!.id)

      expect(useGeometryStore.getState().dimension).toBe(3)
      expect(useAnimationStore.getState().animatingPlanes.has('XY')).toBe(true)
      expect(useAnimationStore.getState().animatingPlanes.has('XW')).toBe(false)
    })

    it('normalizes imported animation payload fields to store invariants', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Invalid Animation Payload',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: {
            speed: -100,
            direction: 0,
            isPlaying: 'yes',
            animatingPlanes: ['XY'],
          },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      useAnimationStore.getState().setSpeed(0.8)
      usePresetManagerStore.getState().loadScene(saved!.id)

      const animation = useAnimationStore.getState()
      expect(animation.speed).toBe(0.1)
      expect(animation.direction).toBe(1)
      expect(animation.isPlaying).toBe(true)
      expect(animation.animatingPlanes.has('XY')).toBe(true)
    })

    it('drops unknown imported scene animation fields on load', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Animation Unknown Key',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: {
            speed: 1,
            isPlaying: true,
            animatingPlanes: ['XY'],
            mysteryAnimation: true,
          },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadScene(saved!.id)

      const animation = useAnimationStore.getState() as Record<string, unknown>
      expect(animation.mysteryAnimation).toBeUndefined()
    })

    it('drops unknown imported scene extended schroedinger fields on load', () => {
      const importedScene = {
        id: 'scene-id',
        name: 'Extended Unknown Key',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: {
            schroedinger: {
              termCount: 4,
              mysteryExtended: 42,
            },
          },
          transform: { uniformScale: 1 },
          rotation: { rotations: {} },
          animation: { speed: 1, isPlaying: true, animatingPlanes: ['XY'] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      const ok = usePresetManagerStore.getState().importScenes(JSON.stringify([importedScene]))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedScenes
      expect(saved).toBeDefined()

      usePresetManagerStore.getState().loadScene(saved!.id)

      const schroedinger = useExtendedObjectStore.getState().schroedinger as Record<string, unknown>
      expect(schroedinger.termCount).toBe(4)
      expect(schroedinger.mysteryExtended).toBeUndefined()
    })

    it('persists momentum representation settings in saved scenes', () => {
      const extended = useExtendedObjectStore.getState()
      extended.setSchroedingerRepresentation('momentum')
      extended.setSchroedingerMomentumDisplayUnits('p')
      extended.setSchroedingerMomentumScale(2.25)
      extended.setSchroedingerMomentumHbar(1.75)

      usePresetManagerStore.getState().saveScene('Momentum Scene')
      const [savedScene] = usePresetManagerStore.getState().savedScenes
      expect(savedScene).toBeDefined()

      const savedConfig = savedScene!.data.extended.schroedinger as {
        representation?: string
        momentumDisplayUnits?: string
        momentumScale?: number
        momentumHbar?: number
      }
      expect(savedConfig.representation).toBe('momentum')
      expect(savedConfig.momentumDisplayUnits).toBe('p')
      expect(savedConfig.momentumScale).toBe(2.25)
      expect(savedConfig.momentumHbar).toBe(1.75)

      extended.setSchroedingerRepresentation('position')
      extended.setSchroedingerMomentumDisplayUnits('k')
      extended.setSchroedingerMomentumScale(1.0)
      extended.setSchroedingerMomentumHbar(1.0)

      usePresetManagerStore.getState().loadScene(savedScene!.id)

      const restored = useExtendedObjectStore.getState().schroedinger
      expect(restored.representation).toBe('momentum')
      expect(restored.momentumDisplayUnits).toBe('p')
      expect(restored.momentumScale).toBe(2.25)
      expect(restored.momentumHbar).toBe(1.75)
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

    it('should not include version counters in saved scenes', () => {
      // Version counters are auto-incremented by stores and should never be persisted
      usePresetManagerStore.getState().saveScene('Test Scene')
      const [saved] = usePresetManagerStore.getState().savedScenes

      // Version fields should be excluded from all store data
      expect(saved!.data.appearance.appearanceVersion).toBeUndefined()
      expect(saved!.data.environment.iblVersion).toBeUndefined()
      expect(saved!.data.environment.groundVersion).toBeUndefined()
      expect(saved!.data.environment.skyboxVersion).toBeUndefined()
      expect(saved!.data.lighting.version).toBeUndefined()
      expect(saved!.data.postProcessing.gravityVersion).toBeUndefined()
      expect(saved!.data.rotation.version).toBeUndefined()
      expect(saved!.data.extended.polytopeVersion).toBeUndefined()
      expect(saved!.data.extended.blackholeVersion).toBeUndefined()
      expect(saved!.data.extended.schroedingerVersion).toBeUndefined()
      expect(saved!.data.extended.mandelbulbVersion).toBeUndefined()
    })

    it('should not include device-specific UI settings in saved scenes', () => {
      // Set device-specific UI state that should NOT be saved
      // Note: maxFps is now in performanceStore, not uiStore
      useUIStore.setState({
        showDepthBuffer: true,
        showNormalBuffer: true,
        showTemporalDepthBuffer: true,
      })

      usePresetManagerStore.getState().saveScene('Test Scene')
      const [saved] = usePresetManagerStore.getState().savedScenes

      // Device-specific settings should be excluded from ui data
      expect(saved!.data.ui.showDepthBuffer).toBeUndefined()
      expect(saved!.data.ui.showNormalBuffer).toBeUndefined()
      expect(saved!.data.ui.showTemporalDepthBuffer).toBeUndefined()
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

    it('should reject style import entries with whitespace-only names', () => {
      const styleWithWhitespaceName = {
        id: 'test-id',
        name: '   ',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#0000ff' },
          lighting: { lightEnabled: true },
          postProcessing: { bloomEnabled: false },
          environment: { skyboxEnabled: false },
        },
      }

      const ok = usePresetManagerStore
        .getState()
        .importStyles(JSON.stringify([styleWithWhitespaceName]))
      expect(ok).toBe(false)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
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

    it('should reject scene import entries with whitespace-only names', () => {
      const sceneWithWhitespaceName = {
        id: 'test-id',
        name: '   ',
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
          ui: {},
        },
      }

      const ok = usePresetManagerStore
        .getState()
        .importScenes(JSON.stringify([sceneWithWhitespaceName]))
      expect(ok).toBe(false)
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
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

    it('deduplicates duplicate style names within the same import batch', () => {
      const duplicateStyles = [
        {
          id: 'style-a',
          name: 'Batch Style',
          timestamp: 123,
          data: {
            appearance: {},
            lighting: {},
            postProcessing: {},
            environment: {},
          },
        },
        {
          id: 'style-b',
          name: 'Batch Style',
          timestamp: 124,
          data: {
            appearance: {},
            lighting: {},
            postProcessing: {},
            environment: {},
          },
        },
      ]

      usePresetManagerStore.getState().importStyles(JSON.stringify(duplicateStyles))

      const styles = usePresetManagerStore.getState().savedStyles
      expect(styles).toHaveLength(2)
      expect(styles[0]!.name).toBe('Batch Style')
      expect(styles[1]!.name).toBe('Batch Style (imported)')
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

    it('deduplicates duplicate scene names within the same import batch', () => {
      const duplicateScenes = [
        {
          id: 'scene-a',
          name: 'Batch Scene',
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
        },
        {
          id: 'scene-b',
          name: 'Batch Scene',
          timestamp: 124,
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
        },
      ]

      usePresetManagerStore.getState().importScenes(JSON.stringify(duplicateScenes))

      const scenes = usePresetManagerStore.getState().savedScenes
      expect(scenes).toHaveLength(2)
      expect(scenes[0]!.name).toBe('Batch Scene')
      expect(scenes[1]!.name).toBe('Batch Scene (imported)')
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

      // Should have canonical skybox fallback and strip legacy field
      const environment = useEnvironmentStore.getState()
      expect(environment.skyboxEnabled).toBe(false)
      expect(environment.skyboxSelection).toBe('none')
      expect(environment.skyboxMode).toBe('classic')
      expect(environment.skyboxTexture).toBe('none')
      expect((environment as Record<string, unknown>).classicSkyboxType).toBeUndefined()
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

      // Should have canonical skybox fallback and strip legacy field
      const environment = useEnvironmentStore.getState()
      expect(environment.skyboxEnabled).toBe(false)
      expect(environment.skyboxSelection).toBe('none')
      expect(environment.skyboxMode).toBe('classic')
      expect(environment.skyboxTexture).toBe('none')
      expect((environment as Record<string, unknown>).classicSkyboxType).toBeUndefined()
    })

    it('should derive missing skybox selection from legacy mode/texture fields', () => {
      const legacyStyle = {
        id: 'legacy-derive-id',
        name: 'Legacy Derived Style',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000' },
          lighting: { lightEnabled: true },
          postProcessing: { bloomEnabled: false },
          environment: {
            skyboxEnabled: true,
            skyboxMode: 'classic',
            skyboxTexture: 'space_red',
          }, // No skyboxSelection
        },
      }

      usePresetManagerStore.getState().importStyles(JSON.stringify([legacyStyle]))
      const [imported] = usePresetManagerStore.getState().savedStyles

      usePresetManagerStore.getState().loadStyle(imported!.id)

      const environment = useEnvironmentStore.getState()
      expect(environment.skyboxSelection).toBe('space_red')
      expect(environment.skyboxEnabled).toBe(true)
      expect(environment.skyboxMode).toBe('classic')
      expect(environment.skyboxTexture).toBe('space_red')
    })

    it('should strip nested sqLayer transient fields when loading a scene', () => {
      // Simulate a legacy scene saved before sqLayer fields were marked transient
      const legacyScene = {
        id: 'sq-legacy-id',
        name: 'Legacy SQ Scene',
        timestamp: 123,
        data: {
          appearance: {},
          lighting: {},
          postProcessing: {},
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: {
            schroedinger: {
              quantumMode: 'harmonicOscillator',
              termCount: 3,
              sqLayerEnabled: true,
              sqLayerMode: 'coherent',
              sqLayerCoherentAlphaRe: 2.5,
              sqLayerSelectedModeIndex: 1,
              sqLayerFockQuantumNumber: 4,
            },
          },
          transform: {},
          rotation: { rotations: {} },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      usePresetManagerStore.getState().importScenes(JSON.stringify([legacyScene]))
      const [imported] = usePresetManagerStore.getState().savedScenes
      expect(imported).toBeDefined()

      // Load the scene — sqLayer transient fields should be stripped during load
      usePresetManagerStore.getState().loadScene(imported!.id)

      const config = useExtendedObjectStore.getState().schroedinger
      // Non-transient fields should be restored
      expect(config.quantumMode).toBe('harmonicOscillator')
      expect(config.termCount).toBe(3)
      // sqLayer fields should NOT have been applied from the legacy scene —
      // they should retain their defaults (false, 'fock', 0, etc.)
      expect(config.sqLayerEnabled).toBe(false)
      expect(config.sqLayerMode).toBe('fock')
      expect(config.sqLayerSelectedModeIndex).toBe(0)
      expect(config.sqLayerFockQuantumNumber).toBe(0)
    })

    it('should strip version fields when importing styles', () => {
      // Import a style that contains version fields (e.g., from an older export)
      const styleWithVersions = {
        id: 'version-style-id',
        name: 'Style With Versions',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000', appearanceVersion: 42 },
          lighting: { lightEnabled: true, version: 10 },
          postProcessing: { bloomEnabled: false, gravityVersion: 5 },
          environment: { skyboxEnabled: false, iblVersion: 3, groundVersion: 2 },
        },
      }

      usePresetManagerStore.getState().importStyles(JSON.stringify([styleWithVersions]))
      const [imported] = usePresetManagerStore.getState().savedStyles

      // Version fields should be stripped during import
      expect(imported!.data.appearance.appearanceVersion).toBeUndefined()
      expect(imported!.data.lighting.version).toBeUndefined()
      expect(imported!.data.postProcessing.gravityVersion).toBeUndefined()
      expect(imported!.data.environment.iblVersion).toBeUndefined()
      expect(imported!.data.environment.groundVersion).toBeUndefined()
      // Actual data should be preserved
      expect(imported!.data.appearance.edgeColor).toBe('#ff0000')
      expect(imported!.data.lighting.lightEnabled).toBe(true)
    })

    it('should strip version fields when importing scenes', () => {
      // Import a scene that contains version fields
      const sceneWithVersions = {
        id: 'version-scene-id',
        name: 'Scene With Versions',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000', appearanceVersion: 42 },
          lighting: { lightEnabled: true, version: 10 },
          postProcessing: { bloomEnabled: false, gravityVersion: 5 },
          environment: { skyboxEnabled: false, iblVersion: 3 },
          geometry: { dimension: 4, objectType: 'hypercube' },
          extended: { polytopeVersion: 7, blackholeVersion: 2 },
          transform: {},
          rotation: { rotations: {}, version: 15 },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      usePresetManagerStore.getState().importScenes(JSON.stringify([sceneWithVersions]))
      const [imported] = usePresetManagerStore.getState().savedScenes

      // Version fields should be stripped during import
      expect(imported!.data.appearance.appearanceVersion).toBeUndefined()
      expect(imported!.data.lighting.version).toBeUndefined()
      expect(imported!.data.extended.polytopeVersion).toBeUndefined()
      expect(imported!.data.extended.blackholeVersion).toBeUndefined()
      expect(imported!.data.rotation.version).toBeUndefined()
      // Actual data should be preserved
      expect(imported!.data.appearance.edgeColor).toBe('#ff0000')
      expect(imported!.data.geometry.dimension).toBe(4)
    })

    it('should strip removed gravity/object-depth fields when importing styles', () => {
      const styleWithLegacyPostProcessing = {
        id: 'legacy-post-style-id',
        name: 'Legacy Post Style',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000' },
          lighting: { lightEnabled: true },
          postProcessing: {
            bloomEnabled: false,
            objectOnlyDepth: true,
            gravityEnabled: true,
            gravityStrength: 0.8,
            gravityDistortionScale: 1.2,
            gravityFalloff: 1.6,
            gravityChromaticAberration: 0.05,
          },
          environment: { skyboxEnabled: false },
        },
      }

      usePresetManagerStore.getState().importStyles(JSON.stringify([styleWithLegacyPostProcessing]))
      const [imported] = usePresetManagerStore.getState().savedStyles
      expect(imported).toBeDefined()

      // Removed fields should not be kept in persisted imported data
      expect(imported!.data.postProcessing.objectOnlyDepth).toBeUndefined()
      expect(imported!.data.postProcessing.gravityEnabled).toBeUndefined()
      expect(imported!.data.postProcessing.gravityStrength).toBeUndefined()
      expect(imported!.data.postProcessing.gravityDistortionScale).toBeUndefined()
      expect(imported!.data.postProcessing.gravityFalloff).toBeUndefined()
      expect(imported!.data.postProcessing.gravityChromaticAberration).toBeUndefined()

      // Nor should they be applied to runtime post-processing state
      usePresetManagerStore.getState().loadStyle(imported!.id)
      const pp = usePostProcessingStore.getState() as Record<string, unknown>
      expect(pp.objectOnlyDepth).toBeUndefined()
      expect(pp.gravityEnabled).toBeUndefined()
      expect(pp.gravityStrength).toBeUndefined()
      expect(pp.gravityDistortionScale).toBeUndefined()
      expect(pp.gravityFalloff).toBeUndefined()
      expect(pp.gravityChromaticAberration).toBeUndefined()
    })

    it('should strip removed gravity/object-depth fields when importing scenes', () => {
      const sceneWithLegacyPostProcessing = {
        id: 'legacy-post-scene-id',
        name: 'Legacy Post Scene',
        timestamp: 123,
        data: {
          appearance: { edgeColor: '#ff0000' },
          lighting: { lightEnabled: true },
          postProcessing: {
            bloomEnabled: false,
            objectOnlyDepth: true,
            gravityEnabled: true,
            gravityStrength: 0.8,
            gravityDistortionScale: 1.2,
            gravityFalloff: 1.6,
            gravityChromaticAberration: 0.05,
          },
          environment: { skyboxEnabled: false },
          geometry: { dimension: 3, objectType: 'schroedinger' },
          extended: { schroedinger: {} },
          transform: {},
          rotation: { rotations: {} },
          animation: { speed: 1, animatingPlanes: [] },
          camera: { position: [0, 0, 5], target: [0, 0, 0] },
          ui: {},
        },
      }

      usePresetManagerStore.getState().importScenes(JSON.stringify([sceneWithLegacyPostProcessing]))
      const [imported] = usePresetManagerStore.getState().savedScenes
      expect(imported).toBeDefined()

      // Removed fields should not be kept in persisted imported data
      expect(imported!.data.postProcessing.objectOnlyDepth).toBeUndefined()
      expect(imported!.data.postProcessing.gravityEnabled).toBeUndefined()
      expect(imported!.data.postProcessing.gravityStrength).toBeUndefined()
      expect(imported!.data.postProcessing.gravityDistortionScale).toBeUndefined()
      expect(imported!.data.postProcessing.gravityFalloff).toBeUndefined()
      expect(imported!.data.postProcessing.gravityChromaticAberration).toBeUndefined()

      // Nor should they be applied to runtime post-processing state
      usePresetManagerStore.getState().loadScene(imported!.id)
      const pp = usePostProcessingStore.getState() as Record<string, unknown>
      expect(pp.objectOnlyDepth).toBeUndefined()
      expect(pp.gravityEnabled).toBeUndefined()
      expect(pp.gravityStrength).toBeUndefined()
      expect(pp.gravityDistortionScale).toBeUndefined()
      expect(pp.gravityFalloff).toBeUndefined()
      expect(pp.gravityChromaticAberration).toBeUndefined()
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
