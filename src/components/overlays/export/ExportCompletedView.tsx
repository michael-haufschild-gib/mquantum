import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

/** Props for {@link ExportCompletedView}. */
export interface ExportCompletedViewProps {
  /** Result metadata from the export pipeline, used to pick the variant. */
  completionDetails: { type: string; segmentCount?: number } | null
  /** Object URL for the in-memory blob, when the export was buffered. */
  previewUrl: string | null
  /** Trigger a download of the in-memory result. */
  onDownload: () => void
  /** Reset the modal so the user can configure a new export. */
  onReset: () => void
}

/**
 * Completion view dispatching to in-memory, stream, or segmented result.
 * Lives outside {@link ExportModal} so the modal stays under the
 * `max-lines` budget; the three result variants are not reused elsewhere
 * but were extracted as a unit because they share the same prop contract.
 *
 * @returns The completion variant matching `completionDetails.type`.
 */
export function ExportCompletedView({
  completionDetails,
  previewUrl,
  onDownload,
  onReset,
}: ExportCompletedViewProps) {
  const detailType = completionDetails?.type ?? 'in-memory'

  if (detailType === 'stream') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-4">
        <div className="w-20 h-20 bg-success border border-success-border rounded-full flex items-center justify-center">
          <Icon name="check" className="text-success w-10 h-10" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold text-white">Export Successful</h3>
          <p className="text-text-secondary">Video saved directly to your device.</p>
        </div>
        <Button
          onClick={onReset}
          variant="secondary"
          size="lg"
          className="w-full"
          tooltip="Reset the export modal for a new export"
        >
          Start New Export
        </Button>
      </div>
    )
  }

  if (detailType === 'segmented') {
    return (
      <div className="flex flex-col gap-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <Icon name="layers" className="text-warning w-12 h-12" />
          <h3 className="text-xl font-bold text-warning">Segmented Export Complete</h3>
          <p className="text-sm text-text-secondary">
            {completionDetails?.segmentCount ?? 0} segments downloaded.
          </p>
        </div>
        <Button
          onClick={onReset}
          variant="secondary"
          size="lg"
          className="w-full"
          tooltip="Return to the export editor"
        >
          Back to Editor
        </Button>
      </div>
    )
  }

  // in-memory (default)
  if (!previewUrl) return null
  return (
    <div className="space-y-6">
      <div className="rounded-xl overflow-hidden border border-border-default bg-black aspect-video relative group shadow-2xl">
        <video src={previewUrl} controls autoPlay loop className="w-full h-full object-contain" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={onDownload}
          variant="primary"
          size="lg"
          glow
          className="py-6 text-lg"
          tooltip="Download the rendered export file"
        >
          <Icon name="download" className="w-5 h-5 me-2" /> Download
        </Button>
        <Button
          onClick={onReset}
          variant="secondary"
          size="lg"
          className="py-6"
          tooltip="Discard the result and start a new export"
        >
          New Export
        </Button>
      </div>
    </div>
  )
}
