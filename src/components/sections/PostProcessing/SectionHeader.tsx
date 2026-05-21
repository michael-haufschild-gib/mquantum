/**
 * PostProcessing Section Header
 *
 * Small uppercase section divider used by the post-processing control
 * panels (Paper, Cinematic, etc.) to group related sliders under a
 * labelled top-border. Extracted here because `PaperControls.tsx` and
 * `CinematicControls.tsx` had byte-identical local copies.
 *
 * The `first:` Tailwind modifiers make the first header in a container
 * borderless and flush with the top, so multiple sections stack
 * cleanly without a redundant rule at the top of the list.
 */

import React from 'react'

/** Props for PostProcessingSectionHeader. */
export interface PostProcessingSectionHeaderProps {
  /** Uppercase section label shown to the user. */
  title: string
}

/**
 * Uppercase section divider for post-processing control panels.
 *
 * @param props - Component props
 * @param props.title - Uppercase section label
 * @returns Section header element
 */
export const PostProcessingSectionHeader: React.FC<PostProcessingSectionHeaderProps> = ({
  title,
}) => (
  <div className="text-2xs font-semibold text-text-secondary uppercase tracking-wider pt-2 pb-1 border-t border-panel-border mt-2 first:mt-0 first:border-t-0 first:pt-0">
    {title}
  </div>
)
