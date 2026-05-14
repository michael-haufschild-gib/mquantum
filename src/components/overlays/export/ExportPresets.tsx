import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ExportPresetCard } from '@/components/ui/ExportPresetCard'
import { soundManager } from '@/lib/audio/SoundManager'
import { useExportStore } from '@/stores/runtime/exportStore'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import {
  DESKTOP_EXPORT_PRESETS,
  type ExportPresetId,
  exportPresetMatchesSettings,
  isExportPresetId,
  MOBILE_EXPORT_PRESETS,
} from '@/stores/utils/exportPresetDefinitions'

export const ExportPresets = () => {
  const { applyPreset, settings, canvasAspectRatio, lastAppliedPreset } = useExportStore(
    useShallow((s) => ({
      applyPreset: s.applyPreset,
      settings: s.settings,
      canvasAspectRatio: s.canvasAspectRatio,
      lastAppliedPreset: s.lastAppliedPreset,
    }))
  )
  const isMobileGPU = usePerformanceStore((s) => s.isMobileGPU)

  const presets = useMemo(
    () => (isMobileGPU ? MOBILE_EXPORT_PRESETS : DESKTOP_EXPORT_PRESETS),
    [isMobileGPU]
  )
  const activePresetId = useMemo(() => {
    if (
      isExportPresetId(lastAppliedPreset) &&
      presets.some((preset) => preset.id === lastAppliedPreset) &&
      exportPresetMatchesSettings(lastAppliedPreset, settings, canvasAspectRatio)
    ) {
      return lastAppliedPreset
    }

    return (
      presets.find((preset) => exportPresetMatchesSettings(preset.id, settings, canvasAspectRatio))
        ?.id ?? null
    )
  }, [canvasAspectRatio, lastAppliedPreset, presets, settings])

  const handleSelect = (id: ExportPresetId) => {
    applyPreset(id)
    soundManager.playClick()
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3">
      {presets.map((p) => (
        <ExportPresetCard
          key={p.id}
          id={p.id}
          label={p.label}
          description={p.description}
          isActive={p.id === activePresetId}
          onClick={() => handleSelect(p.id)}
        />
      ))}
    </div>
  )
}
