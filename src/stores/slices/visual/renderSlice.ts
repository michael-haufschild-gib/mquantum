import { StateCreator } from 'zustand'
import { AppearanceSlice, RenderSlice, RenderSliceState } from './types'
import { DEFAULT_SHADER_SETTINGS, DEFAULT_SHADER_TYPE } from '@/stores/defaults/visualDefaults'

function isFiniteRenderSettingValue(value: number): boolean {
  return Number.isFinite(value)
}

export const RENDER_INITIAL_STATE: RenderSliceState = {
  shaderType: DEFAULT_SHADER_TYPE,
  shaderSettings: { ...DEFAULT_SHADER_SETTINGS },
}

export const createRenderSlice: StateCreator<AppearanceSlice, [], [], RenderSlice> = (set) => ({
  ...RENDER_INITIAL_STATE,

  setShaderType: (shaderType) => set({ shaderType }),

  setWireframeSettings: (settings) =>
    set((state) => {
      if (
        settings.lineThickness !== undefined &&
        !isFiniteRenderSettingValue(settings.lineThickness) &&
        import.meta.env.DEV
      ) {
        console.warn(
          '[renderSlice] Ignoring non-finite wireframe line thickness:',
          settings.lineThickness
        )
      }

      return {
        shaderSettings: {
          ...state.shaderSettings,
          wireframe: {
            ...state.shaderSettings.wireframe,
            ...settings,
            lineThickness:
              settings.lineThickness !== undefined
                ? isFiniteRenderSettingValue(settings.lineThickness)
                  ? Math.max(1, Math.min(5, settings.lineThickness))
                  : state.shaderSettings.wireframe.lineThickness
                : state.shaderSettings.wireframe.lineThickness,
          },
        },
      }
    }),

  setSurfaceSettings: (settings) =>
    set((state) => {
      if (
        settings.specularIntensity !== undefined &&
        !isFiniteRenderSettingValue(settings.specularIntensity) &&
        import.meta.env.DEV
      ) {
        console.warn(
          '[renderSlice] Ignoring non-finite surface specular intensity:',
          settings.specularIntensity
        )
      }

      return {
        shaderSettings: {
          ...state.shaderSettings,
          surface: {
            ...state.shaderSettings.surface,
            ...settings,
            specularIntensity:
              settings.specularIntensity !== undefined
                ? isFiniteRenderSettingValue(settings.specularIntensity)
                  ? Math.max(0, Math.min(2, settings.specularIntensity))
                  : state.shaderSettings.surface.specularIntensity
                : state.shaderSettings.surface.specularIntensity,
          },
        },
      }
    }),

})
