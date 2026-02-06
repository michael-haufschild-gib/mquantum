import { StateCreator } from 'zustand'
import { AppearanceSlice, RenderSlice, RenderSliceState } from './types'
import { DEFAULT_SHADER_SETTINGS, DEFAULT_SHADER_TYPE } from '@/stores/defaults/visualDefaults'

export const RENDER_INITIAL_STATE: RenderSliceState = {
  shaderType: DEFAULT_SHADER_TYPE,
  shaderSettings: { ...DEFAULT_SHADER_SETTINGS },
}

export const createRenderSlice: StateCreator<AppearanceSlice, [], [], RenderSlice> = (set) => ({
  ...RENDER_INITIAL_STATE,

  setShaderType: (shaderType) => set({ shaderType }),

  setWireframeSettings: (settings) =>
    set((state) => ({
      shaderSettings: {
        ...state.shaderSettings,
        wireframe: {
          ...state.shaderSettings.wireframe,
          ...settings,
          lineThickness:
            settings.lineThickness !== undefined
              ? Math.max(1, Math.min(5, settings.lineThickness))
              : state.shaderSettings.wireframe.lineThickness,
        },
      },
    })),

  setSurfaceSettings: (settings) =>
    set((state) => ({
      shaderSettings: {
        ...state.shaderSettings,
        surface: {
          ...state.shaderSettings.surface,
          ...settings,
          faceOpacity:
            settings.faceOpacity !== undefined
              ? Math.max(0, Math.min(1, settings.faceOpacity))
              : state.shaderSettings.surface.faceOpacity,
          specularIntensity:
            settings.specularIntensity !== undefined
              ? Math.max(0, Math.min(2, settings.specularIntensity))
              : state.shaderSettings.surface.specularIntensity,
        },
      },
    })),

})
