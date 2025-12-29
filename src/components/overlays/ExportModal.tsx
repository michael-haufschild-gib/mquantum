import { Icon } from '@/components/ui/Icon'
import { soundManager } from '@/lib/audio/SoundManager'
import { useExportStore } from '@/stores/exportStore'
import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ConfirmModal } from '../ui/ConfirmModal'
import { Tabs } from '../ui/Tabs'
import { ExportPreview } from './export/ExportPreview'
import { ExportPresets } from './export/ExportPresets'
import { ExportGeneralTab } from './export/ExportGeneralTab'
import { ExportTextTab } from './export/ExportTextTab'
import { ExportAdvancedTab } from './export/ExportAdvancedTab'

type ExportTabId = 'presets' | 'general' | 'text' | 'advanced'

// Create selector outside component to avoid hook rules violation
const exportModalSelector = (state: ReturnType<typeof useExportStore.getState>) => ({
  isModalOpen: state.isModalOpen,
  setModalOpen: state.setModalOpen,
  isExporting: state.isExporting,
  setIsExporting: state.setIsExporting,
  status: state.status,
  setStatus: state.setStatus,
  progress: state.progress,
  previewUrl: state.previewUrl,
  eta: state.eta,
  reset: state.reset,
  setPreviewImage: state.setPreviewImage,
  estimatedSizeMB: state.estimatedSizeMB,
  exportTier: state.exportTier,
  exportMode: state.exportMode,
  completionDetails: state.completionDetails,
  setCanvasAspectRatio: state.setCanvasAspectRatio,
  settings: state.settings
})

export const ExportModal = () => {
  const selector = useShallow(exportModalSelector)
  const {
    isModalOpen,
    setModalOpen,
    isExporting,
    setIsExporting,
    status,
    setStatus,
    progress,
    previewUrl,
    eta,
    reset,
    setPreviewImage,
    estimatedSizeMB,
    exportTier,
    exportMode,
    completionDetails,
    setCanvasAspectRatio,
    settings
  } = useExportStore(selector)

  const [activeTab, setActiveTab] = useState<ExportTabId>('presets')
  const [showStopConfirm, setShowStopConfirm] = useState(false)

  // Update canvas aspect ratio when modal opens
  useEffect(() => {
    if (isModalOpen) {
      const canvas = document.querySelector('canvas')
      if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        setCanvasAspectRatio(canvas.clientWidth / canvas.clientHeight)
      }
    }
  }, [isModalOpen, setCanvasAspectRatio])

  const handleClose = () => {
    if (status === 'encoding') return 
    if (isExporting && status === 'rendering') {
        setShowStopConfirm(true)
        return
    }
    closeModal()
  }

  const closeModal = () => {
    setModalOpen(false)
    reset()
    setPreviewImage(null) // Clear preview only when modal actually closes
    setActiveTab('presets')
  }

  const handleConfirmStop = () => {
    setIsExporting(false)
    setShowStopConfirm(false)
    closeModal()
  }

  const handleExport = () => {
    soundManager.playClick()
    setIsExporting(true)
  }

  const handleDownload = () => {
    if (previewUrl) {
        const link = document.createElement('a')
        link.href = previewUrl
        const ext = settings.format === 'webm' ? 'webm' : 'mp4'
        link.download = `mdimension-${Date.now()}.${ext}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        soundManager.playSuccess()
    }
  }

  // Get Tier Badge
  const getTierBadge = () => {
      switch (exportTier) {
          case 'large': return <span className="px-2 py-0.5 rounded bg-danger-bg text-danger text-[10px] font-bold border border-danger-border">LARGE EXPORT</span>
          case 'medium': return <span className="px-2 py-0.5 rounded bg-warning-bg text-warning text-[10px] font-bold border border-warning-border">MEDIUM EXPORT</span>
          default: return <span className="px-2 py-0.5 rounded bg-success-bg text-success text-[10px] font-bold border border-success-border">OPTIMIZED</span>
      }
  }

  // Determine modal width based on state
  const isProcessActive = status === 'rendering' || status === 'encoding' || status === 'previewing' || status === 'completed'
  const widthClass = isProcessActive ? 'max-w-xl' : 'max-w-6xl'

  return (
    <>
    <Modal
      isOpen={isModalOpen}
      onClose={handleClose}
      title={isProcessActive ? 'Processing Export' : 'Video Export Studio'}
      width={widthClass}
    >
        {/* ACTIVE PROCESSING STATE (Centered, Focused) */}
        {isProcessActive ? (
            <div className="py-8 px-4">
                 {/* RENDERING / PREVIEWING */}
                {(status === 'rendering' || status === 'previewing') && (
                    <div className="flex flex-col items-center justify-center gap-8 text-center animate-in fade-in zoom-in-95 duration-300">
                        <div className="relative w-40 h-40">
                            {/* Outer Glow */}
                            <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full animate-pulse" />
                            
                            <svg className="w-full h-full transform -rotate-90 relative z-10">
                                <circle
                                    cx="80" cy="80" r="70"
                                    className="stroke-border-subtle fill-none"
                                    strokeWidth="6"
                                />
                                <circle
                                    cx="80" cy="80" r="70"
                                    className="stroke-accent fill-none transition-all duration-300 ease-linear"
                                    strokeWidth="6"
                                    strokeDasharray={440}
                                    strokeDashoffset={440 * (1 - progress)}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                                <span className="text-4xl font-mono font-bold tracking-tighter text-white">{Math.round(progress * 100)}%</span>
                            </div>
                        </div>

                        <div className="space-y-2 max-w-sm">
                            <h3 className="text-xl font-bold text-accent animate-pulse">
                                {status === 'previewing' ? 'Generating Preview...' :
                                 exportMode === 'stream' ? 'Streaming to Disk...' :
                                 'Rendering Sequence...'}
                            </h3>
                             {eta && status !== 'previewing' && (
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-hover)] border border-border-default">
                                    <Icon name="clock" className="w-3 h-3 text-text-tertiary" />
                                    <span className="text-xs font-mono text-text-secondary">Time Remaining: {eta}</span>
                                </div>
                            )}
                            <p className="text-sm text-text-tertiary pt-2">
                                Please keep this window open for best performance.
                            </p>
                        </div>
                        
                        <Button onClick={() => setIsExporting(false)} variant="danger" size="sm" className="opacity-50 hover:opacity-100">
                            Cancel Operation
                        </Button>
                    </div>
                )}

                {/* ENCODING */}
                {status === 'encoding' && (
                    <div className="flex flex-col items-center justify-center gap-6 text-center animate-in fade-in zoom-in-95 duration-300 py-8">
                         <div className="relative">
                            <div className="w-20 h-20 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Icon name="settings" className="text-accent/50 w-8 h-8 animate-pulse" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Finalizing Video</h3>
                            <p className="text-text-secondary">Encoding media stream...</p>
                        </div>
                    </div>
                )}

                 {/* COMPLETED */}
                {status === 'completed' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        {(!completionDetails || completionDetails?.type === 'in-memory') && previewUrl && (
                            <div className="space-y-6">
                                <div className="rounded-xl overflow-hidden border border-border-default bg-black aspect-video relative group shadow-2xl">
                                    <video src={previewUrl} controls autoPlay loop className="w-full h-full object-contain" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <Button onClick={handleDownload} variant="primary" size="lg" glow className="py-6 text-lg">
                                        <Icon name="download" className="w-5 h-5 mr-2" /> Download
                                    </Button>
                                    <Button onClick={() => { reset(); setStatus('idle'); }} variant="secondary" size="lg" className="py-6">
                                        New Export
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {completionDetails?.type === 'stream' && (
                            <div className="flex flex-col items-center justify-center gap-6 py-4">
                                 <div className="w-20 h-20 bg-success border border-success-border rounded-full flex items-center justify-center">
                                    <Icon name="check" className="text-success w-10 h-10" />
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-2xl font-bold text-white">Export Successful</h3>
                                    <p className="text-text-secondary">Video saved directly to your device.</p>
                                </div>
                                <Button onClick={() => { reset(); setStatus('idle'); }} variant="secondary" size="lg" className="w-full">
                                    Start New Export
                                </Button>
                            </div>
                        )}

                        {completionDetails?.type === 'segmented' && (
                             <div className="flex flex-col gap-6 text-center">
                                <div className="flex flex-col items-center gap-4">
                                     <Icon name="layers" className="text-warning w-12 h-12" />
                                     <h3 className="text-xl font-bold text-warning">Segmented Export Complete</h3>
                                     <p className="text-sm text-text-secondary">{completionDetails.segmentCount} segments downloaded.</p>
                                </div>
                                <Button onClick={() => { reset(); setStatus('idle'); }} variant="secondary" size="lg" className="w-full">
                                    Back to Editor
                                </Button>
                             </div>
                        )}
                    </div>
                )}
            </div>
        ) : (
            /* CONFIGURATION STATE (Split View) */
            <div className="flex flex-col lg:flex-row h-[70vh] lg:h-[600px] overflow-hidden">
                {/* LEFT: Preview & Quick Stats */}
                <div className="hidden lg:flex flex-col w-5/12 border-r border-border-subtle bg-[var(--bg-hover)] p-6 gap-6 relative">
                    <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden shadow-2xl border border-border-default bg-[var(--bg-overlay)]">
                         <ExportPreview />
                    </div>
                    
                    {/* Summary Card */}
                    <div className="bg-[var(--bg-hover)] border border-border-subtle rounded-xl p-4 space-y-3">
                         <div className="flex justify-between items-center">
                             <span className="text-xs font-bold text-text-secondary uppercase">Estimated Size</span>
                             {getTierBadge()}
                         </div>
                         <div className="flex items-baseline gap-2">
                             <span className="text-2xl font-mono font-bold text-white">~{estimatedSizeMB.toFixed(1)}</span>
                             <span className="text-sm text-text-tertiary">MB</span>
                         </div>
                         
                         <div className="h-px bg-border-subtle w-full my-2" />
                         
                         <div className="grid grid-cols-3 gap-2 text-center">
                             <div>
                                 <div className="text-[10px] text-text-tertiary uppercase">Res</div>
                                 <div className="font-bold text-sm text-text-primary">{settings.resolution === 'custom' ? 'Custom' : settings.resolution}</div>
                             </div>
                              <div>
                                 <div className="text-[10px] text-text-tertiary uppercase">FPS</div>
                                 <div className="font-bold text-sm text-text-primary">{settings.fps}</div>
                             </div>
                              <div>
                                 <div className="text-[10px] text-text-tertiary uppercase">Dur</div>
                                 <div className="font-bold text-sm text-text-primary">{settings.duration}s</div>
                             </div>
                         </div>
                    </div>
                </div>

                {/* RIGHT: Controls */}
                <div className="flex-1 flex flex-col bg-panel-bg min-w-0">
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-6" data-testid="export-tabs-wrapper">
                        <Tabs
                            className="flex-1 flex flex-col min-h-0"
                            value={activeTab}
                            onChange={(id) => setActiveTab(id as ExportTabId)}
                            fullWidth
                            tabs={[
                                { id: 'presets', label: 'Presets', content: <div className="pt-6"><ExportPresets /></div> },
                                { id: 'general', label: 'Settings', content: <div className="pt-6"><ExportGeneralTab /></div> },
                                { id: 'text', label: 'Text', content: <div className="pt-6"><ExportTextTab /></div> },
                                { id: 'advanced', label: 'Advanced', content: <div className="pt-6"><ExportAdvancedTab /></div> }
                            ]}
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-border-subtle bg-panel-bg/95 backdrop-blur z-10 flex justify-between items-center gap-4">
                        <div className="lg:hidden flex flex-col">
                             <span className="text-[10px] text-text-tertiary uppercase">Est. Size</span>
                             <span className="text-sm font-bold font-mono">~{estimatedSizeMB.toFixed(1)} MB</span>
                        </div>
                        
                        <Button
                            onClick={handleExport}
                            variant="primary"
                            size="lg"
                            className="flex-1 py-4 glow-accent-md hover:glow-accent-lg transition-shadow"
                            glow
                        >
                            <div className="flex flex-col items-center">
                                <span className="text-sm font-bold flex items-center gap-2">
                                    <Icon name="image" className="w-4 h-4" />
                                    {exportMode === 'stream' ? 'Select File & Start' : 'Start Rendering'}
                                </span>
                            </div>
                        </Button>
                    </div>
                </div>
            </div>
        )}
    </Modal>
    <ConfirmModal
        isOpen={showStopConfirm}
        onClose={() => setShowStopConfirm(false)}
        onConfirm={handleConfirmStop}
        title="Stop Recording?"
        message="Are you sure you want to stop the recording? The progress will be lost."
        confirmText="Stop Recording"
        isDestructive
    />
    </>
  )
}