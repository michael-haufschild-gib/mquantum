import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Icons } from '../icons'
import { InfoCard, SectionHeader } from '../subcomponents'
import { formatBytes, formatShaderName } from '../utils'

// ============================================================================
// SHADER TAB - Isolated subscription for shader debug info
// ============================================================================
export const ShaderTabContent = React.memo(function ShaderTabContent() {
  const objectType = useGeometryStore((s) => s.objectType)
  const { shaderDebugInfos, shaderOverrides, toggleShaderModule } = usePerformanceStore(
    useShallow((s) => ({
      shaderDebugInfos: s.shaderDebugInfos,
      shaderOverrides: s.shaderOverrides,
      toggleShaderModule: s.toggleShaderModule,
    }))
  )

  const [selectedShaderKey, setSelectedShaderKey] = useState<string | null>(null)

  // Auto-select shader when available
  useEffect(() => {
    const keys = Object.keys(shaderDebugInfos)
    if (keys.length > 0) {
      if (!selectedShaderKey || !shaderDebugInfos[selectedShaderKey]) {
        if (keys.includes('object')) setSelectedShaderKey('object')
        else setSelectedShaderKey(keys[0]!)
      }
    } else {
      setSelectedShaderKey(null)
    }
  }, [shaderDebugInfos, selectedShaderKey])

  const activeShaderInfo = selectedShaderKey ? shaderDebugInfos[selectedShaderKey] : null

  if (Object.keys(shaderDebugInfos).length === 0) {
    return (
      <div className="space-y-5 p-5">
        <div className="text-center text-text-tertiary py-8 text-xs">No shader data available</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
        {Object.keys(shaderDebugInfos).map((key) => (
          <Button
            key={key}
            variant={selectedShaderKey === key ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSelectedShaderKey(key)}
            className={`
              rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap
              ${selectedShaderKey === key ? 'bg-accent/20 text-accent border-accent/30' : ''}
            `}
          >
            {formatShaderName(key, objectType)}
          </Button>
        ))}
      </div>
      {activeShaderInfo && (
        <div className="animate-in fade-in duration-300 space-y-5">
          <div className="space-y-3">
            <SectionHeader icon={<Icons.Layers />} label="Stats" />
            <div className="grid grid-cols-2 gap-2">
              <InfoCard label="Vertex" value={formatBytes(activeShaderInfo.vertexShaderLength)} />
              <InfoCard
                label="Fragment"
                value={formatBytes(activeShaderInfo.fragmentShaderLength)}
              />
            </div>
          </div>
          <div className="space-y-3">
            <SectionHeader icon={<Icons.Zap />} label="Features" />
            <div className="flex flex-wrap gap-2">
              {activeShaderInfo.features.map((f) => (
                <span
                  key={f}
                  className="px-2 py-1 bg-success border border-success-border text-success rounded text-[9px] font-mono uppercase tracking-wide"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <SectionHeader icon={<Icons.Database />} label="Modules" />
            <div className="border border-border-subtle rounded-lg overflow-hidden">
              {activeShaderInfo.activeModules.map((mod) => {
                const isEnabled = !shaderOverrides.includes(mod)
                return (
                  <div
                    key={mod}
                    className="flex items-center justify-between p-2 hover:bg-[var(--bg-hover)] border-b border-border-subtle last:border-0 transition-colors"
                  >
                    <span
                      className={`text-[10px] font-mono ${isEnabled ? 'text-text-secondary' : 'text-text-tertiary line-through'}`}
                    >
                      {mod}
                    </span>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleShaderModule(mod)}
                      className="scale-75 origin-right"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
