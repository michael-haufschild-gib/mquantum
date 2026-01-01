import React, { useCallback, useRef, useState } from 'react';
import { usePresetManagerStore, type SavedStyle, type PresetManagerState } from '@/stores/presetManagerStore';
import { useToast } from '@/hooks/useToast';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';
import { InlineEdit } from '@/components/ui/InlineEdit';

/** Format a timestamp to a readable date string */
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

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
export const StyleManager: React.FC<StyleManagerProps> = React.memo(({ onClose }) => {
  const { savedStyles, loadStyle, deleteStyle, renameStyle, importStyles, exportStyles } = usePresetManagerStore(
    useShallow((state: PresetManagerState) => ({
      savedStyles: state.savedStyles,
      loadStyle: state.loadStyle,
      deleteStyle: state.deleteStyle,
      renameStyle: state.renameStyle,
      importStyles: state.importStyles,
      exportStyles: state.exportStyles
    }))
  );
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [styleToDelete, setStyleToDelete] = useState<SavedStyle | null>(null);
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);

  const handleRenameStyle = useCallback((styleId: string, newName: string) => {
    renameStyle(styleId, newName);
    addToast('Style renamed', 'success');
  }, [renameStyle, addToast]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [importStyles, addToast]);

  const handleExport = useCallback(() => {
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
  }, [exportStyles, addToast]);

  const handleDeleteConfirm = useCallback(() => {
    if (styleToDelete) {
      deleteStyle(styleToDelete.id);
      addToast('Style deleted', 'info');
      setStyleToDelete(null);
    }
  }, [styleToDelete, deleteStyle, addToast]);

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
            {savedStyles.map((style: SavedStyle) => {
              const isEditingThis = editingStyleId === style.id;
              return (
                <div
                  key={style.id}
                  className="group flex items-center justify-between p-3 bg-[var(--bg-hover)] rounded-md hover:bg-[var(--bg-active)] transition-colors border border-transparent hover:border-panel-border focus-within:border-panel-border"
                >
                  <div
                    role="button"
                    tabIndex={isEditingThis ? -1 : 0}
                    className={`flex-1 text-left min-w-0 ${isEditingThis ? '' : 'cursor-pointer'}`}
                    onClick={() => {
                      if (isEditingThis) return;
                      loadStyle(style.id);
                      addToast(`Applied style: ${style.name}`, 'info');
                      onClose();
                    }}
                    onKeyDown={(e) => {
                      if (isEditingThis) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        loadStyle(style.id);
                        addToast(`Applied style: ${style.name}`, 'info');
                        onClose();
                      }
                    }}
                    aria-label={`Apply style "${style.name}"`}
                  >
                    <div className="flex flex-col items-start min-w-0">
                      <InlineEdit
                        value={style.name}
                        onSave={(newName) => {
                          handleRenameStyle(style.id, newName);
                          setEditingStyleId(null);
                        }}
                        onCancel={() => setEditingStyleId(null)}
                        textClassName="font-medium text-sm text-text-primary"
                        editButtonAriaLabel={`Rename style "${style.name}"`}
                        placeholder="Style name..."
                        hideEditButton
                        isEditing={isEditingThis}
                        onEditingChange={(editing) => {
                          if (!editing) setEditingStyleId(null);
                        }}
                      />
                      <div className="text-[10px] text-text-secondary">{formatDate(style.timestamp)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStyleId(style.id);
                      }}
                      className={`p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 ${isEditingThis ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                      ariaLabel={`Rename style "${style.name}"`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStyleToDelete(style);
                      }}
                      className={`p-1.5 text-text-secondary hover:text-danger hover:bg-danger-bg ${isEditingThis ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                      ariaLabel={`Delete style "${style.name}"`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </Button>
                  </div>
                </div>
              );
            })}
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
});

StyleManager.displayName = 'StyleManager';
