/**
 * Export Button Component
 * Button for exporting the visualization as PNG
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { exportSceneToPNG, generateTimestampFilename } from '@/lib/export'

export interface ExportButtonProps {
  className?: string
}

export const ExportButton: React.FC<ExportButtonProps> = ({ className = '' }) => {
  const [isExporting, setIsExporting] = useState(false)
  const { addToast } = useToast()

  const handleExport = async () => {
    setIsExporting(true)

    // Small delay to ensure UI updates
    await new Promise((resolve) => setTimeout(resolve, 50))

    const filename = generateTimestampFilename('ndimensional')
    const success = exportSceneToPNG({ filename })

    if (success) {
      addToast('Opening screenshot preview...', 'info')
    } else {
      addToast('Export failed. Please try again.', 'error')
    }

    setIsExporting(false)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
        className="w-full"
      >
        {isExporting ? 'Exporting...' : 'Export PNG'}
      </Button>
    </div>
  )
}
