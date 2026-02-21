import React, { useCallback, useState } from 'react'
import {
  usePresetManagerStore,
  type SavedScene,
  type PresetManagerState,
} from '@/stores/presetManagerStore'
import { useToast } from '@/hooks/useToast'
import { useShallow } from 'zustand/react/shallow'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Button } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'

/**
 * Format a timestamp to a readable date string
 * @param timestamp
 */
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Props for SceneManager component */
interface SceneManagerProps {
  /** Callback to close the scene manager modal */
  onClose: () => void
}

/**
 * Scene manager component for managing saved scenes.
 * Allows users to load, delete, import, and export scene configurations
 * (geometry, transforms, camera positions, etc.).
 * @param root0 - Component props
 * @param root0.onClose - Callback to close the scene manager modal
 * @returns The scene manager component
 */
export const SceneManager: React.FC<SceneManagerProps> = React.memo(({ onClose }) => {
  const { savedScenes, loadScene, deleteScene, renameScene, importScenes, exportScenes } =
    usePresetManagerStore(
      useShallow((state: PresetManagerState) => ({
        savedScenes: state.savedScenes,
        loadScene: state.loadScene,
        deleteScene: state.deleteScene,
        renameScene: state.renameScene,
        importScenes: state.importScenes,
        exportScenes: state.exportScenes,
      }))
    )
  const { addToast } = useToast()
  const [sceneToDelete, setSceneToDelete] = useState<SavedScene | null>(null)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)

  const handleRenameScene = useCallback(
    (sceneId: string, newName: string) => {
      renameScene(sceneId, newName)
      addToast('Scene renamed', 'success')
    },
    [renameScene, addToast]
  )

  const handleImportFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result
        if (typeof content !== 'string') {
          addToast('Failed to read file: invalid content', 'error')
          return
        }
        if (importScenes(content)) {
          addToast('Scenes imported successfully', 'success')
        } else {
          addToast('Failed to import scenes: invalid format', 'error')
        }
      }
      reader.onerror = () => {
        addToast('Failed to read file', 'error')
      }
      reader.readAsText(file)
    },
    [importScenes, addToast]
  )

  const openImportPicker = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) {
        handleImportFile(file)
      }
    }
    input.click()
  }, [handleImportFile])

  const handleExport = useCallback(() => {
    const data = exportScenes()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = `mdimension-scenes-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      addToast('Scenes exported', 'success')
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [exportScenes, addToast])

  const handleDeleteConfirm = useCallback(() => {
    if (sceneToDelete) {
      deleteScene(sceneToDelete.id)
      addToast('Scene deleted', 'info')
      setSceneToDelete(null)
    }
  }, [sceneToDelete, deleteScene, addToast])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={openImportPicker}
          className="flex-1"
          ariaLabel="Import scenes from JSON file"
        >
          Import JSON
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          className="flex-1"
          ariaLabel="Export all scenes to JSON file"
        >
          Export JSON
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Saved Scenes
        </h3>

        {savedScenes.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm italic border border-dashed border-panel-border rounded">
            No saved scenes yet.
          </div>
        ) : (
          <div className="space-y-2">
            {savedScenes.map((scene: SavedScene) => {
              const isEditingThis = editingSceneId === scene.id
              return (
                <div
                  key={scene.id}
                  className="group flex items-center justify-between p-3 bg-[var(--bg-hover)] rounded-md hover:bg-[var(--bg-active)] transition-colors border border-transparent hover:border-panel-border focus-within:border-panel-border"
                >
                  <div
                    role="button"
                    tabIndex={isEditingThis ? -1 : 0}
                    className={`flex-1 text-left min-w-0 ${isEditingThis ? '' : 'cursor-pointer'}`}
                    onClick={() => {
                      if (isEditingThis) return
                      loadScene(scene.id)
                      addToast(`Loaded scene: ${scene.name}`, 'info')
                      onClose()
                    }}
                    onKeyDown={(e) => {
                      if (isEditingThis) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        loadScene(scene.id)
                        addToast(`Loaded scene: ${scene.name}`, 'info')
                        onClose()
                      }
                    }}
                    aria-label={`Load scene "${scene.name}"`}
                  >
                    <div className="flex flex-col items-start min-w-0">
                      <InlineEdit
                        value={scene.name}
                        onSave={(newName) => {
                          handleRenameScene(scene.id, newName)
                          setEditingSceneId(null)
                        }}
                        onCancel={() => setEditingSceneId(null)}
                        textClassName="font-medium text-sm text-text-primary"
                        editButtonAriaLabel={`Rename scene "${scene.name}"`}
                        placeholder="Scene name..."
                        hideEditButton
                        isEditing={isEditingThis}
                        onEditingChange={(editing) => {
                          if (!editing) setEditingSceneId(null)
                        }}
                      />
                      <div className="text-[10px] text-text-secondary">
                        {formatDate(scene.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingSceneId(scene.id)
                      }}
                      className={`p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 ${isEditingThis ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                      ariaLabel={`Rename scene "${scene.name}"`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSceneToDelete(scene)
                      }}
                      className={`p-1.5 text-text-secondary hover:text-danger hover:bg-danger-bg ${isEditingThis ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                      ariaLabel={`Delete scene "${scene.name}"`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!sceneToDelete}
        onClose={() => setSceneToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Scene"
        message={`Are you sure you want to delete scene "${sceneToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        isDestructive
      />
    </div>
  )
})

SceneManager.displayName = 'SceneManager'
