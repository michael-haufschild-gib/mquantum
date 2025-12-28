import React, { useRef, useState } from 'react';
import { usePresetManagerStore, type SavedStyle, type PresetManagerState } from '@/stores/presetManagerStore';
import { useToast } from '@/hooks/useToast';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';

/** Props for StyleManager component */
interface StyleManagerProps {
  /** Callback to close the style manager modal */
  onClose: () => void;
}

/**
 * Style manager component for managing saved visual styles.
 * Allows users to load, delete, import, and export style configurations
 * (appearance, lighting, post-processing, environment, PBR settings).
 * @param root0 - Component props
 * @param root0.onClose - Callback to close the style manager modal
 * @returns The style manager component
 */
export const StyleManager: React.FC<StyleManagerProps> = ({ onClose }) => {
  const { savedStyles, loadStyle, deleteStyle, importStyles, exportStyles } = usePresetManagerStore(
    useShallow((state: PresetManagerState) => ({
      savedStyles: state.savedStyles,
      loadStyle: state.loadStyle,
      deleteStyle: state.deleteStyle,
      importStyles: state.importStyles,
      exportStyles: state.exportStyles
    }))
  );
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [styleToDelete, setStyleToDelete] = useState<SavedStyle | null>(null);

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
      if (importStyles(content)) {
        addToast('Styles imported successfully', 'success');
      } else {
        addToast('Failed to import styles: invalid format', 'error');
      }
    };
    reader.onerror = () => {
      addToast('Failed to read file', 'error');
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const handleExport = () => {
    const data = exportStyles();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `mdimension-styles-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addToast('Styles exported', 'success');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleDeleteConfirm = () => {
    if (styleToDelete) {
      deleteStyle(styleToDelete.id);
      addToast('Style deleted', 'info');
      setStyleToDelete(null);
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
          ariaLabel="Import styles from JSON file"
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
          ariaLabel="Export all styles to JSON file"
        >
          Export JSON
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Saved Styles</h3>
        
        {savedStyles.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm italic border border-dashed border-panel-border rounded">
            No saved styles yet.
          </div>
        ) : (
          <div className="space-y-2">
            {savedStyles.map((style: SavedStyle) => (
              <div
                key={style.id}
                className="group flex items-center justify-between p-3 bg-[var(--bg-hover)] rounded-md hover:bg-[var(--bg-active)] transition-colors border border-transparent hover:border-panel-border focus-within:border-panel-border"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-left justify-start p-0"
                  onClick={() => {
                    loadStyle(style.id);
                    addToast(`Applied style: ${style.name}`, 'info');
                    onClose();
                  }}
                  ariaLabel={`Apply style "${style.name}"`}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-medium text-sm text-text-primary">{style.name}</div>
                    <div className="text-[10px] text-text-secondary">{formatDate(style.timestamp)}</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStyleToDelete(style);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-text-secondary hover:text-danger hover:bg-danger-bg focus:opacity-100"
                  ariaLabel={`Delete style "${style.name}"`}
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
        isOpen={!!styleToDelete}
        onClose={() => setStyleToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Style"
        message={`Are you sure you want to delete style "${styleToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
};
