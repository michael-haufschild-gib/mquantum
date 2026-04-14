/**
 * Hidden file input primitive
 *
 * Wraps the native `<input type="file">` so callers outside `src/components/ui/`
 * do not have to touch raw HTML form controls. Typical use is programmatic:
 * hold a ref, call `.click()` from a `<Button>` handler, read the selected
 * file in `onFileSelected`.
 */

import React from 'react'

/** Props for the hidden file input primitive. */
export interface FileInputProps {
  /** MIME types or file extensions to accept (e.g. ".mqstate", "image/png"). */
  accept?: string
  /** Callback fired with the first selected file, or null when cleared. */
  onFileSelected: (file: File | null) => void
  /** Optional id for label association. */
  id?: string
}

/**
 * Hidden file input — render it anywhere and drive it via a ref.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLInputElement>(null)
 * <Button onClick={() => ref.current?.click()}>Load</Button>
 * <FileInput ref={ref} accept=".json" onFileSelected={(f) => ...} />
 * ```
 */
export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  ({ accept, onFileSelected, id }, ref) => (
    <input
      ref={ref}
      id={id}
      type="file"
      accept={accept}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null
        onFileSelected(file)
        e.target.value = ''
      }}
    />
  )
)

FileInput.displayName = 'FileInput'
