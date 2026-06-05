import React, { useCallback } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  /** Prefix for data-testid attributes (e.g. "delete-scene" → "delete-scene-confirm") */
  'data-testid'?: string
}

export const ConfirmModal: React.FC<ConfirmModalProps> = React.memo(
  ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = false,
    'data-testid': testId = 'confirm-modal',
  }) => {
    const handleConfirm = useCallback(() => {
      onConfirm()
      onClose()
    }, [onConfirm, onClose])

    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title} width="max-w-sm">
        <div className="space-y-4">
          <div className="text-text-secondary text-sm">{message}</div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} size="sm" data-testid={`${testId}-cancel`}>
              {cancelText}
            </Button>
            <Button
              variant={isDestructive ? 'danger' : 'primary'}
              onClick={handleConfirm}
              size="sm"
              data-testid={`${testId}-confirm`}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }
)

ConfirmModal.displayName = 'ConfirmModal'
