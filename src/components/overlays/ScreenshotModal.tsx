import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { soundManager } from '@/lib/audio/SoundManager'
import { useScreenshotStore } from '@/stores/screenshotStore'
import { useEffect, useRef, useState } from 'react'
import { CropBox, CropValues } from './CropBox'

export const ScreenshotModal = () => {
  const { isOpen, imageSrc, closeModal, reset } = useScreenshotStore()
  const { addToast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [crop, setCrop] = useState<CropValues>({ x: 0, y: 0, width: 1, height: 1 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Reset crop when modal opens with new image
  useEffect(() => {
    if (isOpen && imageSrc) {
      setCrop({ x: 0, y: 0, width: 1, height: 1 })
      setImageLoaded(false)
    }
  }, [isOpen, imageSrc])

  if (!isOpen || !imageSrc) return null

  const generateOutput = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }

        const pixelX = Math.round(crop.x * img.naturalWidth)
        const pixelY = Math.round(crop.y * img.naturalHeight)
        const pixelWidth = Math.round(crop.width * img.naturalWidth)
        const pixelHeight = Math.round(crop.height * img.naturalHeight)

        canvas.width = pixelWidth
        canvas.height = pixelHeight
        ctx.drawImage(img, pixelX, pixelY, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight)

        canvas.toBlob((blob) => resolve(blob), 'image/png')
      }

      img.onerror = () => resolve(null)
      img.src = imageSrc
    })
  }

  const handleCopy = async () => {
    try {
      const blob = await generateOutput()
      if (!blob) throw new Error('Failed to process image')

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      addToast('Copied screenshot to clipboard!', 'success')
      soundManager.playSuccess()
      closeModal()
      setTimeout(reset, 300)
    } catch (err) {
      console.error(err)
      addToast('Failed to copy. ' + (err instanceof Error ? err.message : ''), 'error')
    }
  }

  const handleDownload = async () => {
    setIsSaving(true)
    try {
      const blob = await generateOutput()
      if (!blob) throw new Error('Failed to process image')

      const filename = `mdimension-${Date.now()}.png`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()

      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)

      addToast('Screenshot downloaded!', 'success')
      soundManager.playSuccess()
      closeModal()
      setTimeout(reset, 300)
    } catch (err) {
      console.error(err)
      addToast('Failed to save image.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const getCropDimensions = () => {
    if (!imgRef.current || !imageLoaded) return null
    const w = Math.round(crop.width * imgRef.current.naturalWidth)
    const h = Math.round(crop.height * imgRef.current.naturalHeight)
    return `${w} × ${h}`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title="Screenshot Preview"
      width="max-w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl"
      data-testid="screenshot-modal"
    >
      <div className="flex flex-col gap-4" data-testid="screenshot-modal-content">
        {/* Crop Editor Area */}
        <div className="relative bg-black rounded-lg overflow-hidden border border-border-default">
          <div
            ref={containerRef}
            className="relative flex items-center justify-center p-4 sm:p-8 select-none"
          >
            <div className="relative inline-block shadow-2xl shadow-black">
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Preview"
                className="max-h-[45vh] sm:max-h-[55vh] md:max-h-[60vh] max-w-full object-contain block pointer-events-none"
                data-testid="crop-preview-image"
                onLoad={() => setImageLoaded(true)}
              />

              {/* Overlay + CropBox */}
              {imageLoaded && (
                <div className="absolute inset-0">
                  <CropBox containerRef={containerRef} crop={crop} onCropChange={setCrop} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <div
            className="text-xs text-text-tertiary text-center sm:text-left"
            data-testid="crop-dimensions"
          >
            <span className="hidden sm:inline">Drag corners to crop • </span>
            {imageLoaded && (
              <span className="font-mono text-text-secondary">{getCropDimensions()} px</span>
            )}
          </div>

          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="secondary"
              onClick={handleCopy}
              size="lg"
              className="flex-1 sm:flex-initial"
              data-testid="screenshot-copy-button"
            >
              <Icon name="copy" className="sm:mr-2" />
              <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button
              variant="primary"
              onClick={handleDownload}
              loading={isSaving}
              size="lg"
              glow
              className="flex-1 sm:flex-initial"
              data-testid="screenshot-save-button"
            >
              <Icon name="download" className="sm:mr-2" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
