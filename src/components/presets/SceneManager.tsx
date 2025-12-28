import React, { useRef, useState } from 'react';
import { usePresetManagerStore, type SavedScene, type PresetManagerState } from '@/stores/presetManagerStore';
import { useToast } from '@/hooks/useToast';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';

/** Props for SceneManager component */
interface SceneManagerProps {
  /** Callback to close the scene manager modal */
  onClose: () => void;
}

/**
 * Scene manager component for managing saved scenes.
 * Allows users to load, delete, import, and export scene configurations
 * (geometry, transforms, camera positions, etc.).
 */
export const SceneManager: React.FC<SceneManagerProps> = ({ onClose }) => {
  const { savedScenes, loadScene, deleteScene, importScenes, exportScenes } = usePresetManagerStore(
    useShallow((state: PresetManagerState) => ({
      savedScenes: state.savedScenes,
      loadScene: state.loadScene,
      deleteScene: state.deleteScene,
      importScenes: state.importScenes,
      exportScenes: state.exportScenes
    }))
  );
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sceneToDelete, setSceneToDelete] = useState<SavedScene | null>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') {
        addToast('Failed to read file: invalid content', 'error');
        return;
      }
      if (importScenes(content)) {
        addToast('Scenes imported successfully', 'success');
      } else {
        addToast('Failed to import scenes: invalid format', 'error');
      }
    };
    reader.onerror = () => {
      addToast('Failed to read file', 'error');
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const handleExport = () => {
    const data = exportScenes();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `mdimension-scenes-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addToast('Scenes exported', 'success');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleDeleteConfirm = () => {
    if (sceneToDelete) {
      deleteScene(sceneToDelete.id);
      addToast('Scene deleted', 'info');
      setSceneToDelete(null);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1"
          ariaLabel="Import scenes from JSON file"
        >
          Import JSON
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".json"
          onChange={handleImport}
          aria-label="Select JSON file to import"
        />
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
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Saved Scenes</h3>
        
        {savedScenes.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm italic border border-dashed border-panel-border rounded">
            No saved scenes yet.
          </div>
        ) : (
          <div className="space-y-2">
            {savedScenes.map((scene: SavedScene) => (
              <div
                key={scene.id}
                className="group flex items-center justify-between p-3 bg-white/5 rounded-md hover:bg-white/10 transition-colors border border-transparent hover:border-panel-border focus-within:border-panel-border"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-left justify-start p-0"
                  onClick={() => {
                    loadScene(scene.id);
                    addToast(`Loaded scene: ${scene.name}`, 'info');
                    onClose();
                  }}
                  ariaLabel={`Load scene "${scene.name}"`}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-medium text-sm text-text-primary">{scene.name}</div>
                    <div className="text-[10px] text-text-secondary">{formatDate(scene.timestamp)}</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSceneToDelete(scene);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-text-secondary hover:text-red-400 hover:bg-red-400/10 focus:opacity-100"
                  ariaLabel={`Delete scene "${scene.name}"`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            ))}
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
  );
};
