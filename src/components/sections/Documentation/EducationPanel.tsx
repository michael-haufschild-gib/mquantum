/**
 * Education Panel Component
 * Displays educational information about the current visualization
 */

import React, { useMemo } from 'react'
import { useGeometryStore } from '@/stores/geometryStore'
import { getDimensionInfo, PROJECTION_INFO, ROTATION_INFO } from '@/lib/education'

export interface EducationPanelProps {
  className?: string
}

export const EducationPanel: React.FC<EducationPanelProps> = React.memo(({ className = '' }) => {
  const dimension = useGeometryStore((state) => state.dimension)

  const dimensionInfo = useMemo(() => getDimensionInfo(dimension), [dimension])

  return (
    <div className={`space-y-4 text-sm ${className}`}>
      {/* Current Dimension Info */}
      {dimensionInfo && (
        <div className="space-y-2">
          <h4 className="font-medium text-text-primary">{dimensionInfo.name}</h4>
          <p className="text-text-secondary text-xs">{dimensionInfo.description}</p>
          <div className="space-y-1">
            <p className="text-xs text-text-muted">Properties:</p>
            <ul className="list-disc list-inside text-xs text-text-secondary space-y-0.5">
              {dimensionInfo.properties.map((prop, i) => (
                <li key={i}>{prop}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Projection Info */}
      <div className="space-y-2 border-t border-panel-border pt-4">
        <h4 className="font-medium text-text-primary">{PROJECTION_INFO.title}</h4>
        <p className="text-text-secondary text-xs">{PROJECTION_INFO.description}</p>
        <ul className="list-disc list-inside text-xs text-text-secondary space-y-0.5">
          {PROJECTION_INFO.details.slice(0, 2).map((detail, i) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      </div>

      {/* Rotation Info */}
      <div className="space-y-2 border-t border-panel-border pt-4">
        <h4 className="font-medium text-text-primary">{ROTATION_INFO.title}</h4>
        <p className="text-text-secondary text-xs">{ROTATION_INFO.description}</p>
        <ul className="list-disc list-inside text-xs text-text-secondary space-y-0.5">
          {ROTATION_INFO.details.slice(0, 2).map((detail, i) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      </div>
    </div>
  )
})

EducationPanel.displayName = 'EducationPanel'
