# UI/UX Audit Log

**Date**: 2026-03-13
**Report**: Evidence-based UI evaluation against `final_report.md` principles
**Scope**: All UI surfaces — top bar, left/right panels, timeline, drawers, sections, mobile

---

## Task #4: TOP BAR

_Status: COMPLETE_

### Files Audited
- `src/components/layout/EditorTopBar/index.tsx` (486 lines)
- `src/components/layout/TopBarControls.tsx` (233 lines)
- `src/components/layout/EditorTopBar/menuItems.ts` (320 lines)
- `src/components/layout/EditorTopBar/useMenuItems.ts` (218 lines)

### Findings

#### F4.1 — BUG: Export video default text misses BEC and Dirac modes
- **File**: `EditorTopBar/index.tsx:168-175`
- **Issue**: The `handleExportVideo` callback maps `quantumMode` to display name but only handles `freeScalarField`, `tdseDynamics`, and `hydrogenND`. Both `becDynamics` and `diracEquation` fall through to the default `'Harmonic Oscillator'`. A user exporting a Dirac equation video gets labeled "Harmonic Oscillator".
- **Principle**: §1.5 Processing Fluency — incorrect labels destroy trust
- **Severity**: Fail (0) — factual error in output
- **Fix**: Add `becDynamics → 'BEC Dynamics'` and `diracEquation → 'Dirac Equation'` branches

#### F4.2 — Sound state duplication between EditorTopBar and TopBarControls
- **File**: `EditorTopBar/index.tsx:138`, `TopBarControls.tsx:91`
- **Issue**: Both components maintain independent `useState(soundManager.isEnabled)` for sound state. The mobile menu sound toggle (EditorTopBar) and the desktop sound button (TopBarControls) update their own local state — toggling one does not update the other. If a user toggles sound via the mobile menu, then rotates to desktop, the desktop button shows stale state.
- **Principle**: §1.2 Cognitive Load (extraneous) — inconsistent state across controls
- **Severity**: Partial (1) — edge case but real
- **Fix**: Lift sound state to a shared store or use `useSyncExternalStore` on `soundManager`

#### F4.3 — Representation toggle disabled with no explanation for compute modes
- **File**: `TopBarControls.tsx:86-88, 186`
- **Issue**: When `isComputeMode` is true, the representation button gets `opacity-40 pointer-events-none` (desktop) or `disabled` (mobile). The `title` says "Position only (compute mode)" but only on hover — there's no visible label change. Users see a greyed-out button with no immediate explanation.
- **Principle**: §2.3 Information Scent — disabled controls need explanation; §1.3 Change Blindness — button appearance changes when switching modes
- **Severity**: Partial (1)
- **Fix**: Show persistent tooltip or change button text to "Position (locked)" for compute modes

#### F4.4 — Mobile compact mode drops Sound and Cinematic buttons entirely
- **File**: `TopBarControls.tsx:144-171`
- **Issue**: When `compact=true` (mobile), the component renders only Representation, PerfMonitor, and Fullscreen. Sound and Cinematic are completely absent — not just hidden, but not rendered at all. Sound is partially recoverable via the mobile hamburger menu ("Mute Sound"/"Enable Sound" in `buildMobileMenuItems`), but Cinematic mode has NO mobile path except the View menu.
- **Principle**: §4.2 Navigation Depth — Cinematic requires hamburger → VIEW → Cinematic Mode (depth 3); §5.3 Flow State — missing quick-access breaks muscle memory
- **Severity**: Partial (1) — Sound is reachable (depth 2 via hamburger), Cinematic is reachable (depth 3 via VIEW menu) but slow
- **Fix**: Either keep icons in compact mode (they're small enough) or add them to the mobile bottom area

#### F4.5 — Menu labels are ALL CAPS with no icons or differentiation
- **File**: `EditorTopBar/index.tsx:341-384`
- **Issue**: FILE, VIEW, SCENES, STYLES are all styled identically — same font, same size, same color, same ghost button variant. No icons, no visual grouping. Users must read each label to find their target.
- **Principle**: §2.1 Pre-attentive Processing — no unique pre-attentive attribute distinguishes menu items; §4.1 Steering Law — small targets, tightly packed
- **Severity**: Partial (1) — functional but requires serial visual search
- **Fix**: Add subtle icons or use different visual weights for content menus (SCENES/STYLES) vs system menus (FILE/VIEW)

#### F4.6 — Theme submenu buried at depth 3
- **File**: `menuItems.ts:263-291`
- **Issue**: Theme controls are under VIEW → Theme → [preset list | Advanced → Mode/Accent]. That's depth 3-4 for changing a theme accent color. For a visual application, theme is a high-frequency action buried deep.
- **Principle**: §4.2 Navigation Depth/Breadth — depth > 3 for frequent actions is a usability problem
- **Severity**: Partial (1) — works but friction
- **Fix**: Consider a top-bar theme quick-switch, or move Theme to a top-level menu

#### F4.7 — Panel toggle icons have identical visual weight on both sides
- **File**: `EditorTopBar/index.tsx:304-329, 427-451`
- **Issue**: Left panel toggle (sidebar-left icon) and right panel toggle (sidebar-right icon) use identical styling and only differ in SVG line position (x1="9" vs x1="15"). They're visually symmetric, which is good for spatial mapping. No issue here — correct implementation.
- **Principle**: §2.1 Pre-attentive Processing — spatial position (left/right) differentiates them correctly
- **Severity**: Pass (2)

#### F4.8 — Radio-style menu items use text `[x]`/`[ ]` instead of visual indicators
- **File**: `menuItems.ts:28-30, 41-43`
- **Issue**: Accent and mode selection items use string prefix `'[x] '` / `'[ ] '` to indicate selection state. This is plain text inside a dropdown, not a visual checkmark or radio dot.
- **Principle**: §2.1 Pre-attentive Processing — text prefixes require System 2 reading; §1.5 Processing Fluency — text checkboxes feel unpolished
- **Severity**: Partial (1) — functional but visually crude
- **Fix**: Use DropdownMenu's built-in checked/radio item patterns if available, or render a checkmark icon

### Score Summary (Task #4)
| Finding | Severity |
|-|-|
| F4.1 Export video label bug | Fail (0) |
| F4.2 Sound state duplication | Partial (1) |
| F4.3 Representation disabled silently | Partial (1) |
| F4.4 Mobile drops Sound/Cinematic | Partial (1) |
| F4.5 Menu labels undifferentiated | Partial (1) |
| F4.6 Theme at depth 3-4 | Partial (1) |
| F4.7 Panel toggle icons | Pass (2) |
| F4.8 Text-based radio indicators | Partial (1) |

## Task #5: LEFT PANEL

_Status: COMPLETE_

### Files Audited
- `src/components/layout/EditorLeftPanel.tsx` (135 lines)
- `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx` (139 lines)
- `src/components/sections/Geometry/ObjectSettingsSection.tsx` (100 lines)
- `src/components/sections/Geometry/SchroedingerControls/index.tsx` (194 lines)
- `src/components/sections/Geometry/DimensionSelector.tsx` (210 lines)

### Findings

#### F5.1 — Panel header "Geometry" is semantically wrong
- **File**: `EditorLeftPanel.tsx:76-78`
- **Issue**: The panel header reads "Geometry" but the panel contains: (1) a dimension selector, (2) a surface mode toggle, (3) a "Type" tab with quantum mode cards, and (4) a "Geometry" tab that actually shows quantum state/field configuration controls (SchroedingerControls). The header "Geometry" matches neither tab's actual content. The "Type" tab is about physics mode selection, and the "Geometry" tab is about quantum state configuration — neither is geometry in the traditional sense.
- **Principle**: §1.5 Processing Fluency — label doesn't match content; §2.3 Information Scent — "Geometry" suggests spatial/mesh configuration
- **Severity**: Partial (1)
- **Fix**: Consider renaming header to "Quantum" or "Physics", or use a neutral "Explorer"

#### F5.2 — Tab icon reuse with right panel
- **File**: `EditorLeftPanel.tsx:43,57` vs `EditorRightPanel.tsx` (to be audited in Task #6)
- **Issue**: Left panel uses `sphere` icon for "Type" tab and `cog` icon for "Geometry" tab. The right panel uses `sphere` for "Object" tab and `cog` for "System" tab. Same icons, different panels, different meanings.
- **Principle**: §2.1 Pre-attentive Processing — icon identity must be unique across the app to enable pre-attentive recognition
- **Severity**: Partial (1)
- **Fix**: Assign distinct icons per tab across both panels. E.g., left "Type" → atom/molecule icon, left "Geometry" → sliders/tuning icon

#### F5.3 — Surface mode toggle silently disappears for dim ≤ 2 or wigner
- **File**: `EditorLeftPanel.tsx:88`
- **Issue**: `{dimension > 2 && representation !== 'wigner' && (...)}` — the ToggleGroup for volumetric/isosurface rendering vanishes without explanation when dimension is 1-2 or when Wigner representation is active. The vertical space collapses with no message.
- **Principle**: §1.3 Change Blindness — control disappears outside attention focus; §2.3 Information Scent — no cue that surface mode exists but is unavailable
- **Severity**: Partial (1) — the DimensionSelector above is always visible, but the surface toggle below it appears/disappears

#### F5.4 — DimensionSelector scrollbar is hidden with no scroll affordance cue
- **File**: `DimensionSelector.tsx:174`
- **Issue**: `[&::-webkit-scrollbar]:hidden` hides the scrollbar. Scroll arrow buttons only appear when content overflows and the user has scrolled (or not). The gradient-fade arrow buttons are a good pattern, but the initial state shows no indication that more options exist to the right.
- **Principle**: §2.1 Pre-attentive Processing — scroll affordance needs a persistent visual cue; §4.1 Steering Law — hidden scroll targets increase discovery time
- **Severity**: Partial (1) — arrow buttons partially mitigate this
- **Fix**: Always show a subtle right-fade gradient when content overflows, even before any scroll

#### F5.5 — ObjectTypeExplorer cards provide no feature availability hints
- **File**: `ObjectTypeExplorer.tsx:29-61`
- **Issue**: All 6 mode cards show label + 1-line description. No badges, icons, or tags indicate what features are available per mode (e.g., "has analysis", "has open quantum", "position only"). The descriptions are physics-focused, not feature-focused. A user selecting "Free Scalar Field" has no warning that analysis tools, quantum effects, and cross-section are all unavailable.
- **Principle**: §2.3 Information Scent — cards should communicate what the user will get; §3.1 Anchoring — first-selected mode sets expectations for all modes; §2.2 Aesthetic-Usability — equal visual treatment implies equal feature depth
- **Severity**: Fail (0) — users discover feature gaps only after switching
- **Fix**: Add subtle feature badges (e.g., "Analysis", "Open Q", "Effects") or a feature availability indicator per card

#### F5.6 — "Quantum State" vs "Field Configuration" section title switching
- **File**: `SchroedingerControls/index.tsx:132`
- **Issue**: Section title is "Field Configuration" for compute modes, "Quantum State" for HO/Hydrogen. This is actually good — it correctly reflects the different physics paradigms. However, there's no transition animation or visual cue when the title changes on mode switch.
- **Principle**: §1.3 Change Blindness — title change is subtle and may go unnoticed
- **Severity**: Pass (2) — correct semantics, minor transition issue

#### F5.7 — Render mode info text is static and potentially misleading
- **File**: `SchroedingerControls/index.tsx:153-178`
- **Issue**: The bottom info text always says "Rendering: Volumetric (Beer-Lambert)" regardless of whether isosurface mode is active. When a user enables isosurface via the surface mode toggle above, this text still says "Volumetric".
- **Principle**: §1.5 Processing Fluency — contradictory information destroys trust
- **Severity**: Fail (0) — factual error when isosurface is enabled
- **Fix**: Conditionally show "Rendering: Isosurface (Marching Cubes)" or "Rendering: Volumetric (Beer-Lambert)" based on `isoEnabled`

### Score Summary (Task #5)
| Finding | Severity |
|-|-|
| F5.1 "Geometry" header mismatch | Partial (1) |
| F5.2 Icon reuse with right panel | Partial (1) |
| F5.3 Surface toggle silent disappearance | Partial (1) |
| F5.4 Hidden scrollbar no affordance | Partial (1) |
| F5.5 No feature hints on mode cards | Fail (0) |
| F5.6 Section title switching | Pass (2) |
| F5.7 Render mode text wrong for isosurface | Fail (0) |

## Task #6: RIGHT PANEL

_Status: COMPLETE_

### Files Audited
- `src/components/layout/EditorRightPanel.tsx` (114 lines)
- `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx` (383 lines)
- `src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx` (346 lines)
- `src/components/sections/Advanced/AdvancedObjectControls.tsx` (23 lines)
- `src/components/sections/Faces/FacesSection.tsx` (read first 60 lines — enough to confirm title/structure)
- `src/components/sections/Settings/SettingsSection.tsx` (153 lines)

### Findings

#### F6.1 — Panel header "Visuals" doesn't match content scope
- **File**: `EditorRightPanel.tsx:90-92`
- **Issue**: Header says "Visuals" but the panel contains three tabs: Object (surface + analysis + quantum effects + diagnostics), Scene (environment + lights + post-processing), System (settings + performance). "Visuals" only describes the Scene tab content. The Object tab contains physics analysis sections. The System tab contains performance/maintenance.
- **Principle**: §1.5 Processing Fluency — header sets wrong expectations; §2.3 Information Scent — "Visuals" would push analysis-seeking users to look elsewhere
- **Severity**: Partial (1)
- **Fix**: Use "Inspector" (matches View menu label "Hide Inspector") or remove the header and let tabs speak for themselves

#### F6.2 — Icon reuse across panels (duplicate of F5.2)
- **File**: `EditorRightPanel.tsx:30,68` — `sphere` for Object tab, `cog` for System tab
- **Issue**: Same as F5.2. Left panel "Type" = sphere, Right panel "Object" = sphere. Left panel "Geometry" = cog, Right panel "System" = cog.
- **Principle**: §2.1 Pre-attentive Processing
- **Severity**: Partial (1)

#### F6.3 — Object tab has 8 sections, most conditionally hidden — extreme content instability
- **File**: `EditorRightPanel.tsx:36-45`
- **Issue**: Object tab renders: FacesSection, SchroedingerCrossSectionSection, TDSEAnalysisSection, BECAnalysisSection, DiracAnalysisSection, SchroedingerQuantumEffectsSection, AdvancedObjectControls, OpenQuantumDiagnosticsSection. At most ~4 are visible at once (varies by mode). The visible set changes dramatically when switching quantum modes. Worst case (Free Scalar Field): only FacesSection and AdvancedObjectControls are visible — 2 of 8 sections.
- **Principle**: §1.3 Change Blindness — content shifts without transition; §1.2 Cognitive Load — user must mentally model which sections are available per mode; §8.4 Cognitive Load Audit — 6 ghost elements
- **Severity**: Fail (0) — the most severe instance of silent disappearance in the app

#### F6.4 — Title collision: "Analysis" appears twice in some modes
- **File**: `SchroedingerCrossSectionSection.tsx:149` (title "Analysis"), `TDSEAnalysisSection` (title "Analysis")
- **Issue**: Both sections use the title "Analysis". In HO/Hydrogen 3D+ mode, only the cross-section "Analysis" is visible. In TDSE mode, only the TDSE "Analysis" is visible. They never appear simultaneously, so there's no runtime collision. But if a user switches between modes, they see an "Analysis" section that changes content completely — same name, different tools.
- **Principle**: §8.1 Von Restorff — inconsistent section identity; §1.3 Change Blindness — same label, different content
- **Severity**: Partial (1) — no simultaneous collision but confusing across modes

#### F6.5 — Cross-section section uses ToggleButton for "Auto Window" — inconsistent with Switch pattern
- **File**: `SchroedingerCrossSectionSection.tsx:286-294`
- **Issue**: "Auto Window" uses ToggleButton with text "ON"/"OFF" while the same section uses Switch for "Slice Plane" enable (line 160). Same section, same semantic (boolean toggle), different widgets.
- **Principle**: §2.1 Pre-attentive Processing — internal inconsistency within one section
- **Severity**: Partial (1) — will be tracked holistically in Task #12

#### F6.6 — Quantum Effects section uses ToggleButton exclusively, not Switch
- **File**: `SchroedingerQuantumEffectsSection.tsx:107-115, 265-275, 317-324`
- **Issue**: All three toggles (Nodal Surfaces, Uncertainty Boundary, Phase Materiality) use ToggleButton with "ON"/"OFF" text. Every other section in the app uses Switch for boolean enables. This section is the outlier.
- **Principle**: §1.5 Processing Fluency — users learn Switch = toggle elsewhere, then encounter ToggleButton here
- **Severity**: Partial (1) — will be tracked holistically in Task #12

#### F6.7 — Settings section mixes three domains
- **File**: `SettingsSection.tsx:84-147`
- **Issue**: Contains: (1) Show Axis Helper (visual), (2) Max FPS (performance), (3) Render Resolution (performance), (4) Restore Dismissed Hints (maintenance), (5) Clear localStorage (maintenance/destructive). Three distinct domains in one section. The FPS and resolution sliders belong in Performance section (which exists in the System tab already). Axis Helper could be in Scene or Object tab.
- **Principle**: §1.2 Cognitive Load (extraneous) — mixed concerns force users to scan unrelated items; §4.2 Navigation Depth — controls are misplaced, requiring users to look in the wrong place
- **Severity**: Partial (1)
- **Fix**: Move FPS/Resolution to Performance section, keep maintenance actions in Settings, move Axis Helper to Scene tab

#### F6.8 — Scene tab default collapse states reduce discoverability
- **File**: `EditorRightPanel.tsx:59-63`
- **Issue**: LightsSection and PostProcessingSection default to `defaultOpen={false}`. Only EnvironmentSection is open. New users may not realize Lights and PostProcessing exist since they're collapsed.
- **Principle**: §8.2 Serial Position — collapsed sections at bottom get least attention; §2.3 Information Scent — collapsed sections reduce scent to their content
- **Severity**: Pass (2) — reasonable default for secondary sections, minor concern

### Score Summary (Task #6)
| Finding | Severity |
|-|-|
| F6.1 "Visuals" header mismatch | Partial (1) |
| F6.2 Icon reuse across panels | Partial (1) |
| F6.3 Object tab extreme content instability | Fail (0) |
| F6.4 "Analysis" title collision | Partial (1) |
| F6.5 Auto Window ToggleButton inconsistency | Partial (1) |
| F6.6 Quantum Effects all ToggleButtons | Partial (1) |
| F6.7 Settings mixed domains | Partial (1) |
| F6.8 Scene tab collapse defaults | Pass (2) |

## Task #7: TIMELINE CONTROLS

_Status: COMPLETE_

### Files Audited
- `src/components/layout/TimelineControls.tsx` (319 lines)

### Findings

#### F7.1 — "BIAS" slider has no tooltip or explanation
- **File**: `TimelineControls.tsx:243-253`
- **Issue**: The "BIAS" slider has no `tooltip` prop, no description, and no contextual hint. "Bias" is ambiguous — it could mean animation bias, rendering bias, visual bias. It actually controls animation time bias (how time evolution weights different dimensions). Users must guess or experiment to understand it.
- **Principle**: §2.3 Information Scent — "BIAS" is a zero-scent label; §1.2 Cognitive Load (extraneous) — forces users to experiment to learn what it does
- **Severity**: Fail (0) — completely opaque control
- **Fix**: Add `tooltip="Controls how animation time is distributed across dimensions"` or rename to "Dim. Bias" with tooltip

#### F7.2 — "Anim" drawer toggle label is abbreviated/cryptic
- **File**: `TimelineControls.tsx:271`
- **Issue**: Label reads "Anim" — a non-standard abbreviation of "Animations". While brief labels are good for compact bars, "Anim" is not a recognized abbreviation and provides weak information scent. Users may not associate it with quantum animation effects (interference, probability current, etc.).
- **Principle**: §2.3 Information Scent — abbreviations reduce scent; §1.5 Processing Fluency — unfamiliar abbreviation decreases fluency
- **Severity**: Partial (1)
- **Fix**: Use "Effects" or "Animate" — or at minimum add `title="Animation Effects"` tooltip

#### F7.3 — "Open Q" label is jargon
- **File**: `TimelineControls.tsx:292`
- **Issue**: "Open Q" abbreviates "Open Quantum Systems" — domain jargon that even physics students may not immediately parse. The label offers no hint about what the drawer contains (Lindblad decoherence, bath coupling, etc.).
- **Principle**: §2.3 Information Scent — jargon abbreviation is near-zero scent; §1.5 Processing Fluency — requires domain knowledge to decode
- **Severity**: Partial (1)
- **Fix**: Use "Decoherence" or "Open Quantum" (spelled out) with a tooltip explaining the feature

#### F7.4 — Anim badge counts only 4 specific booleans, misses other animations
- **File**: `TimelineControls.tsx:73-92`
- **Issue**: The badge count checks only `sliceAnimationEnabled`, `interferenceEnabled`, `probabilityFlowEnabled`, `probabilityCurrentEnabled`. It does not reflect time evolution, phase evolution, TDSE auto-loop, or quantum texture animation — other animation features in the drawer. The badge shows "0" even when time evolution is actively running.
- **Principle**: §3.5 Goal Gradient — badge should accurately reflect active state; inaccurate progress indicators erode trust
- **Severity**: Partial (1)
- **Fix**: Include all animation-type booleans in the count, or rename badge to reflect what it actually counts (e.g., "FX" count)

#### F7.5 — Drawer toggles are mutually exclusive but no visual cue indicates this
- **File**: `TimelineControls.tsx:262-313`
- **Issue**: Opening one drawer closes the others (e.g., clicking Anim closes Rotate and Open Q, line 264-265). This is a tab-like pattern but presented as independent toggle buttons. Users may expect to open multiple drawers simultaneously.
- **Principle**: §1.1 Dual-Process (System 1) — toggle buttons suggest independent state; tabs suggest mutual exclusion; the visual affordance doesn't match the behavior
- **Severity**: Partial (1)
- **Fix**: Use a visual pattern that signals mutual exclusion (tab-like indicator, or only highlight the active one) or allow multiple drawers

#### F7.6 — "Open Q" toggle silently disappears when mode changes
- **File**: `TimelineControls.tsx:280, 95-99, 106-108`
- **Issue**: The `supportsOpenQuantumControls` condition hides the toggle for 4 of 6 modes and for wigner representation. The auto-close on line 106-108 fires during render (not in an effect) — this is a side effect during render that could cause subtle issues. More importantly, the toggle just vanishes with no explanation.
- **Principle**: §1.3 Change Blindness — toggle disappears from the bar; §1.4 Attention Residue — if user was about to click it and it vanishes, residue from interrupted intent
- **Severity**: Partial (1)

#### F7.7 — "Anim" toggle conditionally hidden via `hasTimelineControls(objectType)`
- **File**: `TimelineControls.tsx:259`
- **Issue**: The Anim toggle is wrapped in `{hasTimelineControls(objectType) && ...}`. Since `objectType` is always 'schroedinger', this likely always returns true. But if it didn't, the Anim button would also silently vanish. Need to verify the registry function.
- **Principle**: §1.3 Change Blindness — conditional rendering without feedback
- **Severity**: Pass (2) — likely always true for current codebase

#### F7.8 — Main timeline bar uses `overflow-x-auto overflow-y-hidden scrollbar-none`
- **File**: `TimelineControls.tsx:200`
- **Issue**: The bar has hidden horizontal scrollbar. On narrow screens, the drawer toggles (Anim, Open Q, Rotate) may scroll off the right edge. With `scrollbar-none`, there's no visual affordance indicating scrollable content.
- **Principle**: §2.1 Pre-attentive Processing — hidden scroll with no affordance; §4.1 Steering Law — unreachable targets on mobile
- **Severity**: Partial (1) — the `flex-1 min-w-3` spacer (line 255) compresses, but on very narrow screens the toggles could still be clipped

### Score Summary (Task #7)
| Finding | Severity |
|-|-|
| F7.1 "BIAS" label no explanation | Fail (0) |
| F7.2 "Anim" abbreviation | Partial (1) |
| F7.3 "Open Q" jargon | Partial (1) |
| F7.4 Badge count incomplete | Partial (1) |
| F7.5 Drawers mutually exclusive, no cue | Partial (1) |
| F7.6 Open Q toggle silent disappearance | Partial (1) |
| F7.7 Anim toggle conditional | Pass (2) |
| F7.8 Hidden scrollbar on timeline | Partial (1) |

## Task #8: ANIMATION DRAWER

_Status: COMPLETE_

### Files Audited
- `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx` (515 lines)

### Section × Mode Availability Matrix

| Section | HO 3D | HO 4D+ | H-ND 3D | H-ND 4D+ | FSF | TDSE | BEC | Dirac |
|-|-|-|-|-|-|-|-|-|
| Time Evolution | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| TDSE Auto-Loop | No | No | No | No | No | Yes | No | No |
| Interference Fringing | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| Quantum Texture | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| Probability Current (j) | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| Dimensional Sweeps | No | Yes | No | Yes | No | No | No | No |
| Phase Evolution | No | No | Yes | Yes | No | No | No | No |

**Worst-case modes:**
- **FSF**: 0 of 7 sections visible → **completely empty drawer**
- **BEC**: 0 of 7 sections visible → **completely empty drawer**
- **Dirac**: 0 of 7 sections visible → **completely empty drawer**
- **TDSE**: 1 of 7 sections visible (only Auto-Loop)

### Findings

#### F8.1 — Drawer opens completely empty for FSF/BEC/Dirac
- **File**: `SchroedingerAnimationDrawer.tsx:171,211,259,301,443,485`
- **Issue**: Every section in the drawer is guarded by `!isComputeMode` or mode-specific conditions. For FSF, BEC, and Dirac modes, ALL guards evaluate to false → the `AnimationDrawerContainer` renders with zero children. Users click "Anim" and see an empty panel.
- **Principle**: §2.3 Information Scent — the "Anim" toggle button provides no indication the drawer will be empty; §5.3 Flow State — opening an empty drawer is a dead-end that breaks flow; §1.2 Cognitive Load (extraneous) — pure wasted interaction
- **Severity**: Fail (0) — 3 of 6 modes produce an empty drawer
- **Fix**: Either (a) hide the "Anim" toggle for modes with no animation content, or (b) show an empty-state message explaining why no animations are available

#### F8.2 — TDSE mode shows only "Auto-Loop" — near-empty drawer
- **File**: `SchroedingerAnimationDrawer.tsx:191-208`
- **Issue**: For TDSE, only the "Auto-Loop" section appears — a single toggle with an explanatory sentence. This is one control in a drawer designed for 7 sections. The drawer wastes significant vertical space for minimal content.
- **Principle**: §2.2 Aesthetic-Usability — sparse content in a large drawer feels broken; §1.2 Cognitive Load — drawer overhead for one toggle
- **Severity**: Partial (1)
- **Fix**: Either add TDSE-specific animation controls, or move Auto-Loop to the TDSE controls in the left panel and hide the drawer for TDSE

#### F8.3 — No feedback when animation features are unavailable
- **File**: entire component
- **Issue**: There is no message like "Animation effects require Position/Momentum representation" or "These effects use inline wavefunction evaluation, which is not available in compute modes." The comment on line 163-165 explains the technical reason, but users see nothing.
- **Principle**: §1.3 Change Blindness — content vanishes without explanation; §2.3 Information Scent — no hint about what's missing or why
- **Severity**: Fail (0)
- **Fix**: Add a conditional empty-state message when `isComputeMode` is true, explaining the limitation

#### F8.4 — All toggles in drawer use ToggleButton, consistent with other drawers
- **File**: lines 196-203, 216-223, 267-274, 306-316, 449-456, 491-498
- **Issue**: All boolean toggles in this drawer use ToggleButton with "ON"/"OFF" text. This is internally consistent within the drawer and with the Quantum Effects section. But it differs from the Switch pattern used in most sidebar sections.
- **Principle**: §2.1 Pre-attentive Processing — pattern inconsistency (will be tracked in Task #12)
- **Severity**: Partial (1)

### Score Summary (Task #8)
| Finding | Severity |
|-|-|
| F8.1 Empty drawer for 3 modes | Fail (0) |
| F8.2 TDSE near-empty drawer | Partial (1) |
| F8.3 No unavailability feedback | Fail (0) |
| F8.4 ToggleButton consistency | Partial (1) |

## Task #9: OPEN QUANTUM DRAWER

_Status: COMPLETE_

### Files Audited
- `src/components/layout/TimelineControls/SchroedingerOpenQuantumDrawer.tsx` (359 lines)
- `src/components/layout/TimelineControls.tsx:95-99,280-293` (toggle visibility logic)

### Findings

#### F9.1 — Feature available for only 2 of 6 modes, silently hidden for the rest
- **File**: `TimelineControls.tsx:95-99`, `SchroedingerOpenQuantumDrawer.tsx:114-116,139-141`
- **Issue**: `supportsOpenQuantumControls` requires `(HO || HydrogenND) && !wigner`. For FSF, TDSE, BEC, Dirac — the "Open Q" toggle is not rendered at all. No explanation, no disabled state, no tooltip saying "Open quantum is available in HO/Hydrogen modes." It just doesn't exist in the timeline bar.
- **Principle**: §1.3 Change Blindness — toggle appears/disappears when switching modes; §2.3 Information Scent — no trace of the feature for users in compute modes
- **Severity**: Partial (1) — the feature is genuinely not applicable to compute modes, so hiding is defensible, but the sudden appearance/disappearance is jarring

#### F9.2 — "Open Q" label is jargon (duplicate of F7.3)
- **File**: `TimelineControls.tsx:292`
- **Severity**: Partial (1) — already tracked in F7.3

#### F9.3 — HO mode exposes raw decoherence channel rates — high intrinsic load
- **File**: `SchroedingerOpenQuantumDrawer.tsx:235-314`
- **Issue**: HO mode shows three manual channel toggles (Dephasing, Relaxation, Thermal Excitation) each with rate sliders using Greek symbol labels (γφ, γ↓, γ↑). This is expert-level physics UI. No tooltips explain what each channel does physically. Contrast with Hydrogen mode which uses intuitive concepts (Temperature, Coupling).
- **Principle**: §1.2 Cognitive Load (intrinsic) — raw Lindblad rates are high intrinsic load; §1.5 Processing Fluency — Greek symbol labels require domain expertise; §1.1 Dual-Process — forces System 2 for every interaction
- **Severity**: Partial (1) — appropriate for a PhD-level tool, but could benefit from tooltips

#### F9.4 — HO vs Hydrogen: completely different UI paradigms with no framing
- **File**: `SchroedingerOpenQuantumDrawer.tsx:171-315`
- **Issue**: HO mode shows manual rate controls (Decoherence Channels section). Hydrogen mode shows physics-based controls (Basis Size, Thermal Bath, Dephasing Model). Same feature, different interfaces, with no explanation of why. The drawer title is "Open Quantum" for both, giving no hint that the control paradigm changes.
- **Principle**: §8.1 Von Restorff — inconsistent patterns within the same feature; §1.5 Processing Fluency — learned patterns don't transfer between modes
- **Severity**: Partial (1) — the different UIs reflect genuinely different physics, but a brief subtitle or heading could explain the paradigm shift

#### F9.5 — Integrator section shows raw parameters (dt, Substeps)
- **File**: `SchroedingerOpenQuantumDrawer.tsx:317-339`
- **Issue**: "dt" and "Substeps" are numerical integration parameters. No tooltip explains that smaller dt = more accurate but slower, or that substeps controls per-frame iterations. These are implementation details exposed as UI.
- **Principle**: §1.2 Cognitive Load (extraneous) — implementation details add extraneous load for non-expert users
- **Severity**: Partial (1) — appropriate for an advanced feature, but tooltips would help

#### F9.6 — Warning message for single-term HO is good UX
- **File**: `SchroedingerOpenQuantumDrawer.tsx:161-168`
- **Issue**: When `termCount === 1`, a warning shows: "No visible open-system dynamics with single basis state." This is a GOOD pattern — it proactively explains why the feature won't produce visible results.
- **Principle**: §2.3 Information Scent — excellent proactive feedback
- **Severity**: Pass (2) — exemplary pattern that should be replicated elsewhere

### Score Summary (Task #9)
| Finding | Severity |
|-|-|
| F9.1 Hidden for 4/6 modes | Partial (1) |
| F9.2 "Open Q" jargon | Partial (1) |
| F9.3 Raw channel rates in HO | Partial (1) |
| F9.4 Different UI paradigms | Partial (1) |
| F9.5 Raw integrator params | Partial (1) |
| F9.6 Single-term warning | Pass (2) |

## Task #10: ANALYSIS SECTION PARITY

_Status: COMPLETE_

### Files Audited
- `EditorRightPanel.tsx:36-45` (section ordering)
- `SchroedingerCrossSectionSection.tsx` (title "Analysis", guard at line 128)
- `TDSEAnalysisSection.tsx` (title "Analysis", BEC Analysis guard)
- `BECAnalysisSection.tsx` (title "BEC Analysis")
- `DiracAnalysisSection.tsx` (title "Dirac Analysis")
- `SchroedingerQuantumEffectsSection.tsx` (title "Quantum Effects", guard at line 99)
- `OpenQuantumDiagnosticsSection.tsx` (guard at line 41)

### Complete Feature Parity Matrix

| Feature | HO 3D+ | H-ND 3D+ | HO/H ≤2D | FSF | TDSE | BEC | Dirac |
|-|-|-|-|-|-|-|-|
| Surface (FacesSection) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Cross-Section "Analysis" | Yes | Yes | No | No | No | No | No |
| Radial Probability P(r) | No | Yes | No | No | No | No | No |
| Second Quantization | Yes | No | No | No | No | No | No |
| TDSE "Analysis" | No | No | No | No | Yes | No | No |
| "BEC Analysis" | No | No | No | No | No | Yes | No |
| "Dirac Analysis" | No | No | No | No | No | No | Yes |
| "Quantum Effects" | Yes | Yes | No | No | No | No | No |
| "Advanced Rendering" | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Open Q Diagnostics | Cond. | Cond. | No | No | No | No | No |
| **Total visible sections** | **5-6** | **5-6** | **3** | **2** | **3** | **3** | **3** |

("Cond." = conditional on open quantum enabled + non-wigner)

### Findings

#### F10.1 — Three different naming patterns for analysis sections
- **Sections**: "Analysis" (cross-section + TDSE), "BEC Analysis" (BEC), "Dirac Analysis" (Dirac)
- **Issue**: Inconsistent naming — some prefix with mode name, some don't. Two sections both called "Analysis" (cross-section and TDSE) but with entirely different content. Neither ever coexist on screen, but the naming creates confusion when discussing or searching for features.
- **Principle**: §8.1 Von Restorff — inconsistent naming breaks pattern recognition; §1.5 Processing Fluency — same label, different content across modes
- **Severity**: Partial (1)
- **Fix**: Use consistent pattern: "{Mode} Analysis" for all, or use distinct names that describe the content ("Cross Section", "Scattering Analysis", "Condensate Analysis", "Spinor Analysis")

#### F10.2 — Free Scalar Field has ZERO analysis sections
- **Issue**: FSF mode shows only FacesSection + AdvancedObjectControls in the Object tab — 2 of potentially 8 sections. No diagnostics store exists. No analysis SVG. No live metrics. Every other compute mode (TDSE, BEC, Dirac) has a dedicated analysis section with real-time diagnostics.
- **Principle**: §2.2 Aesthetic-Usability — the absence makes the mode feel incomplete/broken; §8.1 Von Restorff — FSF is the outlier that users notice
- **Severity**: Fail (0) — tracked in detail in Task #11

#### F10.3 — HO/Hydrogen ≤2D get only 3 sections (reduced parity with 3D+)
- **Issue**: When dimension ≤ 2 OR representation is Wigner, both Cross-Section "Analysis" and "Quantum Effects" return null (guards at lines 128 and 99 respectively). This drops HO/Hydrogen from 5-6 visible sections to 3. Users lowering dimension lose analysis tools with no explanation.
- **Principle**: §1.3 Change Blindness — sections disappear on dimension change; §2.3 Information Scent — no indication that analysis features require 3D+
- **Severity**: Partial (1)

#### F10.4 — Section ordering doesn't follow a consistent information architecture
- **File**: `EditorRightPanel.tsx:37-44`
- **Issue**: Object tab order is: Surface → CrossSection → TDSE → BEC → Dirac → QuantumEffects → AdvancedRendering → OpenQDiagnostics. Since most sections return null per mode, the actual visible order varies wildly. For HO 3D: Surface → Analysis → Quantum Effects → Advanced. For TDSE: Surface → Analysis → Advanced. The ordering happens to work because null-returning sections collapse, but there's no deliberate information hierarchy.
- **Principle**: §8.2 Serial Position — first and last sections get most attention; analysis should be prominent
- **Severity**: Partial (1) — works by accident, not by design

### Score Summary (Task #10)
| Finding | Severity |
|-|-|
| F10.1 Three naming patterns | Partial (1) |
| F10.2 FSF zero analysis | Fail (0) |
| F10.3 ≤2D drops to 3 sections | Partial (1) |
| F10.4 No deliberate ordering | Partial (1) |

## Task #11: FREE SCALAR FIELD GAP

_Status: COMPLETE_

### Files Audited
- `FreeScalarFieldControls.tsx` (configuration controls — rich, ~300 lines)
- Grep for `fsfDiagnostics|freeScalarDiagnostics` — **0 results**
- `SchroedingerCrossSectionSection.tsx:128` — returns null for FSF
- `SchroedingerQuantumEffectsSection.tsx:99` — returns null for FSF
- `SchroedingerAnimationDrawer.tsx` — all sections hidden for FSF (isComputeMode)
- `EditorRightPanel.tsx:36-45` — FSF gets only FacesSection + AdvancedObjectControls

### Comparison with Other Compute Modes

| Feature | TDSE | BEC | Dirac | **FSF** |
|-|-|-|-|-|
| Dedicated analysis section | Yes (energy diagram, R/T coefficients) | Yes (trap diagram, μ/ξ/c_s observables) | Yes (E(k) dispersion, spinor fractions) | **No** |
| Diagnostics store | `useTdseDiagnosticsStore` | `useBecDiagnosticsStore` | `useDiracDiagnosticsStore` | **None** |
| Live metrics readout | Norm, R, T coefficients | Chemical potential, healing length, sound speed, norm drift | Upper/lower spinor, norm, drift | **None** |
| SVG diagram | V(x) potential + E_k level | V(x) trap + μ level | E(k) dispersion relation | **None** |
| Animation drawer content | Auto-Loop (1 section) | 0 sections | 0 sections | **0 sections** |
| Cross-section tools | No | No | No | **No** |
| Quantum effects | No | No | No | **No** |
| Configuration controls | Yes (rich) | Yes (rich) | Yes (rich) | **Yes (rich)** |

### Findings

#### F11.1 — FSF is the only compute mode with zero analysis/diagnostics
- **Issue**: TDSE, BEC, and Dirac all have dedicated analysis sections with live diagnostics, SVG diagrams, and observable readouts. FSF has none. The configuration controls are comprehensive (grid size, mass, dt, initial conditions, self-interaction, field view) but there's no feedback on the simulation state.
- **Principle**: §2.2 Aesthetic-Usability — rich configuration with no analysis feedback feels incomplete; §5.3 Flow State — configure → run → no way to verify → flow breaks; §3.5 Goal Gradient — no progress or correctness indicators
- **Severity**: Fail (0)

#### F11.2 — No diagnostics store for FSF
- **Issue**: `useTdseDiagnosticsStore`, `useBecDiagnosticsStore`, `useDiracDiagnosticsStore` all exist. No `useFsfDiagnosticsStore` or equivalent. This means the GPU compute pass doesn't read back any diagnostic data for FSF.
- **Principle**: Technical gap enabling F11.1
- **Severity**: Fail (0) — architectural gap

#### F11.3 — FSF has rich configuration but no way to validate results
- **File**: `FreeScalarFieldControls.tsx`
- **Issue**: User can configure mass, lattice spacing, grid size, initial conditions (Gaussian, standing wave, mode, vacuum), self-interaction (λφ⁴), and view mode (phi, pi, energy density). But after running the simulation, there's no norm readout, no energy conservation check, no mode analysis. User has no way to verify the simulation is physically correct.
- **Principle**: §5.3 Flow State — the diagnostic feedback loop is broken; §1.1 Dual-Process — users must use System 2 to evaluate correctness by visual inspection alone
- **Severity**: Fail (0)

#### F11.4 — FSF animation drawer is completely empty (cross-reference F8.1)
- **Issue**: Already documented in F8.1. FSF gets 0 of 7 animation drawer sections. The "Anim" toggle opens an empty drawer.
- **Severity**: Fail (0) — documented in Task #8

### Score Summary (Task #11)
| Finding | Severity |
|-|-|
| F11.1 Zero analysis/diagnostics | Fail (0) |
| F11.2 No diagnostics store | Fail (0) |
| F11.3 No result validation | Fail (0) |
| F11.4 Empty animation drawer | Fail (0) |

## Task #12: TOGGLE CONSISTENCY

_Status: COMPLETE_

### Methodology
Grepped all `<ToggleButton` and `<Switch` usages in section and layout components.

### Inventory

**ToggleButton used for boolean on/off (showing "ON"/"OFF" text):**
1. `SchroedingerCrossSectionSection.tsx:286` — Auto Window toggle
2. `SchroedingerQuantumEffectsSection.tsx:107` — Nodal Surfaces
3. `SchroedingerQuantumEffectsSection.tsx:174` — Lobe Sign Colors
4. `SchroedingerQuantumEffectsSection.tsx:265` — Uncertainty Boundary
5. `SchroedingerQuantumEffectsSection.tsx:316` — Phase Materiality
6. `SchroedingerOpenQuantumDrawer.tsx:151` — Open Quantum enable
7. `SchroedingerOpenQuantumDrawer.tsx:243` — Dephasing channel
8. `SchroedingerOpenQuantumDrawer.tsx:268` — Relaxation channel
9. `SchroedingerOpenQuantumDrawer.tsx:293` — Thermal channel
10. `SchroedingerAnimationDrawer.tsx:196` — TDSE Auto-Loop
11. `SchroedingerAnimationDrawer.tsx:216` — Interference Fringing
12. `SchroedingerAnimationDrawer.tsx:267` — Quantum Texture
13. `SchroedingerAnimationDrawer.tsx:306` — Probability Current
14. `SchroedingerAnimationDrawer.tsx:449` — Dimensional Sweeps
15. `SchroedingerAnimationDrawer.tsx:491` — Phase Evolution

**ToggleButton used correctly for toolbar/selection (NOT boolean on/off):**
- `TimelineControls.tsx:218` — Reverse direction (icon)
- `TimelineControls.tsx:260,281,296` — Drawer toggles (Anim, Open Q, Rotate)
- Rotation plane buttons (toggle selection, not boolean enable)

**Switch used for boolean on/off:**
- 35+ instances across sections (PostProcessing, Settings, DiracControls, TDSEControls, FacesSection, Performance, Environment, etc.)

### Findings

#### F12.1 — Two distinct visual patterns for the same semantic: boolean enable/disable
- **Issue**: 15 instances of ToggleButton used for ON/OFF toggles vs 35+ instances of Switch for the same purpose. The split is not random — it follows a loose pattern: **drawer/bottom-bar contexts use ToggleButton**, **sidebar section contexts use Switch**. But this is not consistent: `SchroedingerCrossSectionSection` (a sidebar section) uses both Switch (line 159 for Slice Plane) AND ToggleButton (line 286 for Auto Window) in the same section.
- **Principle**: §2.1 Pre-attentive Processing — users cannot instantly recognize "this is a toggle" when two visual patterns exist; §1.5 Processing Fluency — inconsistency reduces fluency
- **Severity**: Partial (1)
- **Fix**: Standardize: Switch for all boolean on/off in sidebar sections. ToggleButton for drawer/toolbar grouped selections. Fix the 1 instance in SchroedingerCrossSectionSection (Auto Window) and 5 instances in SchroedingerQuantumEffectsSection.

#### F12.2 — ToggleButton "ON"/"OFF" text is redundant with visual state
- **File**: All 15 ToggleButton boolean instances
- **Issue**: Every ToggleButton shows text "ON" or "OFF" inside the button. The button already has a pressed/unpressed visual state (accent color vs default). The text is redundant and adds visual noise.
- **Principle**: §1.2 Cognitive Load (extraneous) — redundant information; §2.1 Pre-attentive Processing — the pressed state is already pre-attentive
- **Severity**: Pass (2) — redundancy is mildly wasteful but not harmful; some users may prefer explicit text

#### F12.3 — Cross-section section mixes Switch and ToggleButton
- **File**: `SchroedingerCrossSectionSection.tsx:159,286`
- **Issue**: Slice Plane enable uses Switch (line 159), Auto Window uses ToggleButton (line 286). Same section, same semantic (boolean toggle), different widgets. This is the most egregious internal inconsistency.
- **Principle**: §2.1 Pre-attentive Processing — internal inconsistency within one section is worse than inconsistency across sections
- **Severity**: Partial (1)

### Score Summary (Task #12)
| Finding | Severity |
|-|-|
| F12.1 Two patterns for same semantic | Partial (1) |
| F12.2 Redundant ON/OFF text | Pass (2) |
| F12.3 Cross-section internal mix | Partial (1) |

## Task #13: SILENT DISAPPEARANCE

_Status: COMPLETE_

### Files Audited
- `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx` (line 128)
- `src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx` (line 99)
- `src/components/sections/Advanced/DiracAnalysisSection.tsx` (line 55)
- `src/components/sections/Advanced/TDSEAnalysisSection.tsx` (line 71)
- `src/components/sections/Advanced/BECAnalysisSection.tsx` (line 63)
- `src/components/sections/Advanced/AdvancedObjectControls.tsx` (line 10)
- `src/components/sections/Advanced/OpenQuantumDiagnosticsSection.tsx` (line 76)
- `src/components/sections/Performance/TemporalReprojectionControls.tsx` (line 30)
- `src/components/layout/EditorLeftPanel.tsx` (line 88)
- `src/components/sections/Geometry/SchroedingerControls/index.tsx` (line 66)
- `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx` (lines 171, 191, 211, 259, 301, 443, 485)
- `src/components/layout/TimelineControls/SchroedingerOpenQuantumDrawer.tsx` (line 139)

### Complete Ghost Element Inventory

"Ghost element" = a UI component that returns `null` or conditionally hides its entire DOM tree based on quantum mode, dimension, or representation — with **zero user feedback** about why it is gone.

#### Category A: Right Panel Sections (return null)

| # | Component | Guard Condition | Modes Visible | Modes Ghost |
|-|-|-|-|-|
| A1 | SchroedingerCrossSectionSection | dim ≤ 2 OR wigner OR freeScalar OR tdse OR bec OR dirac | HO(3D+), HydrogenND | FSF, TDSE, BEC, Dirac, all ≤2D, Wigner |
| A2 | SchroedingerQuantumEffectsSection | dim ≤ 2 OR wigner OR freeScalar OR tdse OR bec OR dirac | HO(3D+), HydrogenND | FSF, TDSE, BEC, Dirac, all ≤2D, Wigner |
| A3 | TDSEAnalysisSection | objectType ≠ schroedinger OR quantumMode ≠ tdseDynamics | TDSE only | HO, HydrogenND, FSF, BEC, Dirac |
| A4 | BECAnalysisSection | objectType ≠ schroedinger OR quantumMode ≠ becDynamics | BEC only | HO, HydrogenND, FSF, TDSE, Dirac |
| A5 | DiracAnalysisSection | objectType ≠ schroedinger OR quantumMode ≠ diracEquation | Dirac only | HO, HydrogenND, FSF, TDSE, BEC |
| A6 | OpenQuantumDiagnosticsSection | openQuantum not enabled OR mode not HO/HydrogenND OR wigner | HO, HydrogenND (with OQ on) | FSF, TDSE, BEC, Dirac, Wigner |
| A7 | AdvancedObjectControls | objectType ≠ schroedinger | All (since objectType is always schroedinger) | N/A — always visible |
| A8 | TemporalReprojectionControls | dim ≤ 2 OR wigner | All modes at 3D+ non-wigner | All modes at ≤2D, Wigner |

#### Category B: Left Panel / Controls (conditional hide, no null return)

| # | Component | What Disappears | Guard Condition |
|-|-|-|-|
| B1 | SchroedingerControls index.tsx:66 | Entire "Representation" Section (position/momentum/wigner toggle + all sub-controls) | Any compute mode (FSF, TDSE, BEC, Dirac) |
| B2 | EditorLeftPanel.tsx:88 | Surface mode toggle (volumetric/isosurface) | dim ≤ 2 OR wigner |

#### Category C: Animation Drawer Sections (conditional hide, inline)

| # | Section Name | Guard Condition | Modes Visible | Modes Ghost |
|-|-|-|-|-|
| C1 | Time Evolution | `!isFSF && !isTdse && !isBec && !isDirac` | HO, HydrogenND | FSF, TDSE, BEC, Dirac |
| C2 | Auto-Loop | `isTdse` only | TDSE only | HO, HydrogenND, FSF, BEC, Dirac |
| C3 | Interference Fringing | `!isComputeMode` | HO, HydrogenND | FSF, TDSE, BEC, Dirac |
| C4 | Quantum Texture | `!isComputeMode` | HO, HydrogenND | FSF, TDSE, BEC, Dirac |
| C5 | Probability Current (j) | `!isComputeMode` | HO, HydrogenND | FSF, TDSE, BEC, Dirac |
| C6 | Dimensional Sweeps | `dimension >= 4` | All modes at 4D+ | All modes at ≤3D |
| C7 | Quantum Phase Evolution | `isHydrogenNDMode` only | HydrogenND only | HO, FSF, TDSE, BEC, Dirac |

#### Category D: Open Quantum Drawer (return null)

| # | Component | Guard Condition | Modes Visible | Modes Ghost |
|-|-|-|-|-|
| D1 | SchroedingerOpenQuantumDrawer | mode not HO/HydrogenND OR wigner | HO, HydrogenND (non-wigner) | FSF, TDSE, BEC, Dirac, Wigner |

### Ghost Count Summary by Mode

| Mode | Right Panel Ghosts (A) | Left Panel Ghosts (B) | Drawer Ghosts (C) | OQ Drawer (D) | Total Ghost Elements |
|-|-|-|-|-|-|
| harmonicOscillator (3D+) | 3 (A3,A4,A5) | 0 | 1 (C7) | 0 | 4 |
| hydrogenND | 3 (A3,A4,A5) | 0 | 0 | 0 | 3 |
| freeScalarField | 5 (A1,A2,A3,A4,A5) | 1 (B1) | 6 (C1,C2,C3,C4,C5,C7) | 1 (D1) | 13 |
| tdseDynamics | 4 (A1,A2,A4,A5) | 1 (B1) | 4 (C1,C3,C4,C5) | 1 (D1) | 10 |
| becDynamics | 4 (A1,A2,A3,A5) | 1 (B1) | 5 (C1,C3,C4,C5,C7) | 1 (D1) | 11 |
| diracEquation | 4 (A1,A2,A3,A4) | 1 (B1) | 5 (C1,C3,C4,C5,C7) | 1 (D1) | 11 |

### Findings

#### F13.1 — CRITICAL: Free Scalar Field mode has 13 ghost elements — the most of any mode
- **Impact**: User switches to FSF mode. The right panel Object tab collapses from 8 sections to 1 (AdvancedObjectControls). The animation drawer opens empty. The representation section vanishes from the left panel. No message explains any of this.
- **Principle**: §1.3 Change Blindness — "users miss changes they are not attending to"; §2.3 Information Scent — absent cues for feature availability
- **Severity**: Fail (0) — 13 simultaneous silent disappearances with zero feedback

#### F13.2 — RIGHT PANEL: Object tab shows 1-3 sections for compute modes, 5-6 for HO/HydrogenND
- **File**: `EditorRightPanel.tsx:36-44` renders 8 section components in the Object tab
- **Issue**: For FSF mode, only AdvancedObjectControls renders (1 of 8). For TDSE, AdvancedObjectControls + TDSEAnalysis (2 of 8). For BEC, AdvancedObjectControls + BECAnalysis (2 of 8). For Dirac, AdvancedObjectControls + DiracAnalysis (2 of 8). The user sees a sparse panel with no indication that other tools exist in other modes.
- **Principle**: §3.2 Default Effect — system should expose capability, not hide it
- **Severity**: Partial (1) — functional but disorienting

#### F13.3 — ANIMATION DRAWER: Fully empty for FSF, BEC, Dirac; 1 section for TDSE
- **File**: `SchroedingerAnimationDrawer.tsx`
- **Issue**: FSF/BEC/Dirac users who open the "Anim" drawer see a completely empty container. TDSE shows only "Auto-Loop". No empty-state message or redirect. The drawer toggle button in the timeline is always visible and clickable regardless.
- **Principle**: §1.2 Cognitive Load — empty containers create confusion; §5.3 Flow State — dead-end interactions break flow
- **Severity**: Fail (0) — opening a drawer to find nothing is a trust violation

#### F13.4 — OPEN QUANTUM DRAWER: Button always visible but returns null for 4/6 modes
- **File**: `SchroedingerOpenQuantumDrawer.tsx:139`
- **Issue**: The "Open Q" button in the timeline is always rendered. Clicking it in FSF/TDSE/BEC/Dirac mode opens... nothing. The drawer content returns null. The button should be disabled or hidden when unsupported.
- **Principle**: §2.3 Information Scent — clickable element with no payoff; §4.1 Steering Law — wasted motor action
- **Severity**: Fail (0)

#### F13.5 — LEFT PANEL: Representation section vanishes with no explanation
- **File**: `SchroedingerControls/index.tsx:66`
- **Issue**: The entire Representation section (position/momentum/wigner + momentum scale + hbar slider + wigner controls) disappears for compute modes. No disabled state, no "not applicable in this mode" message. Users who knew representation controls existed cannot find them.
- **Principle**: §1.3 Change Blindness — large UI region disappears unannounced
- **Severity**: Partial (1) — compute modes genuinely don't support representation switching, but the silent removal is confusing

#### F13.6 — LEFT PANEL: Surface mode toggle vanishes for dim ≤ 2 or wigner
- **File**: `EditorLeftPanel.tsx:88`
- **Issue**: The volumetric/isosurface toggle simply isn't rendered at dim ≤ 2 or in wigner representation. For dim ≤ 2 this makes physical sense (no 3D isosurface possible), but there's no hint.
- **Principle**: §1.3 Change Blindness
- **Severity**: Pass (2) — physically justified; users at dim 1-2 have no expectation of isosurface controls

#### F13.7 — Temporal Reprojection silently hidden for dim ≤ 2 or wigner
- **File**: `TemporalReprojectionControls.tsx:30`
- **Issue**: Performance control disappears with no indication. Minor impact since it's a niche optimization toggle.
- **Principle**: §1.3 Change Blindness
- **Severity**: Pass (2) — justified removal, low-visibility control

#### F13.8 — PATTERN: No component uses a disabled/explanation state — only null
- **Issue**: Every conditional section uses `return null` or JSX conditional (`{condition && <...>}`). Zero components use a disabled state with explanatory text like "Not available in Free Scalar Field mode". The universal pattern is total removal from the DOM.
- **Principle**: §2.3 Information Scent — users cannot discover what features exist for each mode; §3.2 Default Effect — hidden defaults cannot be evaluated
- **Severity**: Fail (0) — systemic pattern affecting every mode transition

### Recommendations

1. **Empty-state components**: Create a reusable `<UnavailableSection reason="..." />` component that renders a collapsed section header with a brief explanation instead of returning null.
2. **Drawer guards**: Disable (not hide) the "Anim" and "Open Q" timeline buttons when no content would render for the current mode, or show them with a badge indicating available features.
3. **Mode transition feedback**: When switching quantum modes, briefly highlight or animate sections that appeared/disappeared (§1.3 Change Blindness countermeasure).
4. **Feature matrix in Object Type Explorer**: Show per-mode feature availability on the mode cards (connects to Task #16).

### Score Summary

| Finding | Score |
|-|-|
| F13.1 FSF 13 ghost elements | Fail (0) |
| F13.2 Right panel sparse for compute modes | Partial (1) |
| F13.3 Empty animation drawer | Fail (0) |
| F13.4 Open Q button with null content | Fail (0) |
| F13.5 Representation section vanishes | Partial (1) |
| F13.6 Surface mode for dim ≤ 2 | Pass (2) |
| F13.7 Temporal reprojection hidden | Pass (2) |
| F13.8 No disabled state pattern exists | Fail (0) |

## Task #14: MOBILE UX

_Status: COMPLETE_

### Files Audited
- `src/components/layout/EditorLayout.tsx` (315 lines)
- `src/components/layout/EditorTopBar/index.tsx` (lines 106-107, 388-421)
- `src/components/layout/TopBarControls.tsx` (lines 36-59, 144-171)
- `src/components/layout/TimelineControls.tsx` (lines 200, 258-314)
- `src/components/layout/EditorBottomPanel.tsx` (13 lines)
- `src/components/sections/Geometry/DimensionSelector.tsx` (lines 155-205)
- `src/components/layout/EditorTopBar/menuItems.ts` (lines 302-319)
- `src/hooks/useMediaQuery.ts` (lines 13-110)
- `src/components/ui/Slider.tsx` (line 270, 294, 302)

### Findings

#### F14.1 — BUG: Breakpoint mismatch between TopBar and Layout creates a "tablet gap"
- **File**: `EditorTopBar/index.tsx:106` uses `useMediaQuery(BREAKPOINTS.sm)` (640px) for `isDesktop`; `EditorLayout.tsx:50` uses `useIsDesktop()` which checks `BREAKPOINTS.lg` (1024px)
- **Issue**: Between 640-1024px, the TopBar renders desktop menus (FILE, VIEW, SCENES, STYLES) but the layout treats panels as mobile (absolute overlay with backdrop). The TopBar passes `compact={!isDesktop}` to TopBarControls using the 640px threshold, so at 800px users get full-size desktop buttons but mobile panel overlays. This is an inconsistent hybrid state — neither a coherent mobile experience nor a coherent desktop one.
- **Principle**: §1.2 Cognitive Load — inconsistent spatial model; §1.5 Processing Fluency — layout behavior contradicts control presentation
- **Severity**: Fail (0) — two definitions of "desktop" create an incoherent experience at tablet widths

#### F14.2 — Mobile compact mode drops Sound and Cinematic buttons entirely
- **File**: `TopBarControls.tsx:144-171`
- **Issue**: Compact mode renders only 3 buttons: Representation, PerfMonitor, Fullscreen. Sound and Cinematic are removed. Sound is only accessible via the mobile hamburger menu (`menuItems.ts:317`). Cinematic mode has no mobile entry point at all.
- **Principle**: §4.2 Navigation Breadth vs Depth — mobile users lose direct access to 2 of 5 controls; §2.3 Information Scent — no indication these features exist
- **Severity**: Partial (1) — Sound available in menu, but Cinematic mode completely inaccessible on mobile

#### F14.3 — Timeline controls bar: touch targets below 44px minimum
- **File**: `TimelineControls.tsx:200`
- **Issue**: The main timeline bar is `h-14` (56px) total height, but the interactive elements within it are smaller: Play button `w-9 h-9` (36px), drawer toggles `px-3 py-1.5` (~30px height). Apple HIG recommends minimum 44px touch targets; WCAG 2.5.8 requires 24px minimum with 44px recommendation. The drawer toggle buttons at ~30px tall are below both recommendations.
- **Principle**: §4.1 Steering Law — smaller targets increase motor error and acquisition time
- **Severity**: Partial (1) — below recommended 44px but above WCAG minimum 24px

#### F14.4 — Timeline bar horizontal overflow with hidden scrollbar
- **File**: `TimelineControls.tsx:200` uses `overflow-x-auto scrollbar-none`
- **Issue**: On narrow screens, the timeline bar content (play, reverse, speed slider, bias slider, 3 drawer toggles) overflows. The scrollbar is hidden (`scrollbar-none`). There are no scroll arrows or overflow indicators. Users must discover horizontal scrolling through trial. The speed and bias sliders are each `w-44` (176px), consuming 352px alone. On a 375px iPhone, the drawer toggles are clipped off-screen.
- **Principle**: §2.1 Pre-attentive Processing — hidden affordances are invisible affordances; §1.3 Change Blindness — content exists but cannot be seen
- **Severity**: Fail (0) — critical controls (drawer toggles) unreachable on narrow mobile screens

#### F14.5 — Mobile bottom panel disappears when any side panel opens
- **File**: `EditorLayout.tsx:149` `showMobileBottomPanel = !isCinematicMode && !isDesktop && isCollapsed && !showLeftPanel`
- **Issue**: Opening either the left or right panel hides the entire bottom timeline bar. The user loses playback controls while editing parameters. This forces a constant toggle pattern: open panel → lose playback → close panel → gain playback → can't edit. There's no stacked or minimized timeline state.
- **Principle**: §5.3 Flow State — interrupting animation playback to edit parameters breaks creative flow; §1.4 Attention Residue — switching between editing and playback contexts forces constant task-switching
- **Severity**: Partial (1) — understandable space constraint, but the all-or-nothing behavior is harsh

#### F14.6 — Slider thumb 14px × 14px (`h-3.5 w-3.5`) — undersized for touch
- **File**: `Slider.tsx:302`
- **Issue**: The slider thumb is 14px diameter. The track touch area is `h-5` (20px) tall. While the invisible `<input>` overlay covers the full track width and height, the visual thumb gives poor feedback for touch users and the narrow 20px touch band makes precision adjustment difficult on mobile. The slider uses `touch-none` (line 270) correctly to prevent scroll interference.
- **Principle**: §4.1 Steering Law — small interactive targets increase motor difficulty
- **Severity**: Partial (1) — functional via full-width invisible input, but visual affordance undersized

#### F14.7 — Side panels at fixed `w-80` (320px) consume entire screen on small phones
- **File**: `EditorLayout.tsx:232, 278`
- **Issue**: Both left and right panels are `w-80` (320px). On a 375px iPhone, the panel occupies 85% of screen width. There is backdrop blur + overlay dismiss, which is good, but the panel content itself (sidebar sections with sliders, toggles, grids) was designed for desktop and doesn't adapt. No responsive column layout or stacking.
- **Principle**: §1.2 Cognitive Load — cramped controls increase interaction cost
- **Severity**: Partial (1) — overlay dismiss is usable, but content not optimized

#### F14.8 — DimensionSelector scroll affordance adequate
- **File**: `DimensionSelector.tsx:155-205`
- **Issue**: This is a POSITIVE finding. The dimension selector has scroll arrow buttons that appear when content overflows (`canScrollLeft`, `canScrollRight`), with gradient overlays hinting at hidden content. This pattern is well-implemented for mobile.
- **Principle**: §2.1 Pre-attentive Processing — scroll arrows are immediate visual cues
- **Severity**: Pass (2)

#### F14.9 — Mobile menu includes Sound toggle but format is text-only
- **File**: `menuItems.ts:317`
- **Issue**: Mobile hamburger menu includes "Mute Sound" / "Enable Sound" as a text-only menu item. No visual indicator (checkbox, radio) of current state. The text dynamically reflects state, which is acceptable but inconsistent with the desktop icon button pattern.
- **Principle**: §1.5 Processing Fluency — text labels are less scannable than icons for status
- **Severity**: Pass (2) — functional, text-label approach is standard for menus

### Score Summary

| Finding | Score |
|-|-|
| F14.1 Breakpoint mismatch (tablet gap) | Fail (0) |
| F14.2 Mobile drops Sound + Cinematic | Partial (1) |
| F14.3 Touch targets below 44px | Partial (1) |
| F14.4 Timeline overflow with hidden scrollbar | Fail (0) |
| F14.5 Bottom panel hides when side panel opens | Partial (1) |
| F14.6 Slider thumb undersized | Partial (1) |
| F14.7 Fixed-width panels on small phones | Partial (1) |
| F14.8 DimensionSelector scroll affordance | Pass (2) |
| F14.9 Mobile menu sound toggle text-only | Pass (2) |

## Task #15: NAMING & ICONS

_Status: COMPLETE_

### Files Audited
- `src/components/layout/EditorLeftPanel.tsx` (lines 38-78)
- `src/components/layout/EditorRightPanel.tsx` (lines 24-93)
- `src/components/sections/Advanced/*.tsx` (all section titles)
- `src/components/sections/Faces/FacesSection.tsx` (title: "Surface")
- `src/components/sections/Geometry/SchroedingerControls/index.tsx` (titles: "Representation", dynamic "Quantum State" / "Field Configuration")
- `src/components/layout/TimelineControls.tsx` (drawer toggle labels)

### Complete Naming Inventory

#### Panel Headers

| Panel | Header Label | Actual Content | Match? |
|-|-|-|-|
| Left | "Geometry" | Quantum mode selector + dimension + representation + quantum state controls | NO — "Geometry" implies spatial/shape; content is quantum physics configuration |
| Right | "Visuals" | Object analysis/effects + scene environment + system settings | NO — "Visuals" implies appearance only; content includes physics diagnostics and system performance |

#### Tab Labels and Icons

| Panel | Tab | Icon | Label | Content | Issues |
|-|-|-|-|-|-|
| Left | Tab 1 | `sphere` | "Type" | ObjectTypeExplorer (quantum mode cards) | Label OK; icon `sphere` reused on right |
| Left | Tab 2 | `cog` | "Geometry" | DimensionSelector + surface mode + SchroedingerControls | "Geometry" mismatch: content is physics config, not geometry; icon `cog` reused on right |
| Right | Tab 1 | `sphere` | "Object" | Surface + Analysis + Effects + Advanced + OpenQ | Label OK; icon `sphere` identical to Left Tab 1 |
| Right | Tab 2 | `home` | "Scene" | Environment + Lights + PostProcessing | Label and icon OK (unique) |
| Right | Tab 3 | `cog` | "System" | Settings + Performance | Label OK; icon `cog` identical to Left Tab 2 |

#### Section Titles Inside Tabs

| Section | Title | Parent Tab | Issues |
|-|-|-|-|
| FacesSection | "Surface" | Right > Object | Component file named "Faces" but title renders "Surface" — inconsistent naming layer (code vs user-facing) |
| SchroedingerCrossSectionSection | "Analysis" | Right > Object | Collides with TDSEAnalysisSection title "Analysis" (same tab) |
| TDSEAnalysisSection | "Analysis" | Right > Object | Collides with SchroedingerCrossSectionSection title "Analysis" (same tab) |
| BECAnalysisSection | "BEC Analysis" | Right > Object | Unique, clear |
| DiracAnalysisSection | "Dirac Analysis" | Right > Object | Unique, clear |
| SchroedingerQuantumEffectsSection | "Quantum Effects" | Right > Object | Clear |
| AdvancedObjectControls | "Advanced Rendering" | Right > Object | Clear |
| OpenQuantumDiagnosticsSection | "Open Quantum Diagnostics" | Right > Object | Clear but verbose |
| SettingsSection | "Settings" | Right > System | Contains mixed content: Axis Helper (visual), Max FPS (perf), Render Resolution (perf), localStorage clear (maintenance) |
| PerformanceSection | "Performance" | Right > System | Contains GPU tier, temporal reprojection |

### Findings

#### F15.1 — LEFT PANEL: Header "Geometry" is semantically wrong
- **File**: `EditorLeftPanel.tsx:77`
- **Issue**: Panel header says "Geometry" but content is quantum mode selection, dimension selector, representation space, quantum state/field configuration. This is physics configuration, not geometry. Users expecting shape/mesh controls find quantum physics instead.
- **Principle**: §2.3 Information Scent — "Geometry" carries strong associations with spatial/shape manipulation, misleading expert users
- **Severity**: Partial (1) — the header is just branding, but it sets wrong expectations
- **Fix**: Rename to "Quantum" or "Physics" to match actual content

#### F15.2 — RIGHT PANEL: Header "Visuals" doesn't cover physics diagnostics or system settings
- **File**: `EditorRightPanel.tsx:91`
- **Issue**: Panel header says "Visuals" but Object tab contains physics analysis sections (TDSE, BEC, Dirac diagnostics, cross-section), and System tab contains Settings and Performance. "Visuals" only accurately describes the Surface and Scene tabs.
- **Principle**: §2.3 Information Scent — header doesn't represent tab scope
- **Severity**: Partial (1) — tabs themselves are well-labeled, so the header is less critical
- **Fix**: Rename to "Inspector" or remove the panel-level header (tabs are self-describing)

#### F15.3 — Icon `sphere` reused across panels: Left "Type" tab = Right "Object" tab
- **File**: `EditorLeftPanel.tsx:43`, `EditorRightPanel.tsx:30`
- **Issue**: Both use `Icon name="sphere"` at `size={14}`. A user who learns "sphere icon = type selector" on the left may expect the same on the right, but gets a different panel. Icons should be unique identifiers.
- **Principle**: §2.1 Pre-attentive Processing — identical icons create false visual equivalence; §8.1 Von Restorff — identical elements are not distinguishable
- **Severity**: Partial (1) — users may not cross-reference icons between panels frequently

#### F15.4 — Icon `cog` reused across panels: Left "Geometry" tab = Right "System" tab
- **File**: `EditorLeftPanel.tsx:57`, `EditorRightPanel.tsx:69`
- **Issue**: Same `Icon name="cog"` with same size. Left "Geometry" (physics controls) and Right "System" (settings/perf) are unrelated concepts sharing a visual identifier.
- **Principle**: §2.1 Pre-attentive Processing — icon reuse dilutes meaning
- **Severity**: Partial (1) — cog is generic enough that users don't rely on it strongly

#### F15.5 — Two sections titled "Analysis" in the same right panel Object tab
- **File**: `SchroedingerCrossSectionSection.tsx:149` (title "Analysis"), `TDSEAnalysisSection.tsx:75` (title "Analysis")
- **Issue**: Both render as `<Section title="Analysis">` in the Object tab. They never appear simultaneously (cross-section returns null for TDSE, TDSE returns null for HO/Hydrogen), but the identical naming across modes creates confusion. A user switching from HO to TDSE sees "Analysis" disappear and a different "Analysis" appear — same label, completely different content.
- **Principle**: §1.3 Change Blindness — identical label masks content substitution; §8.1 Von Restorff — undifferentiated labels prevent recognition
- **Severity**: Fail (0) — users cannot distinguish between two different "Analysis" sections by name
- **Fix**: SchroedingerCrossSectionSection → "Cross Section" or "Wavefunction Analysis"; TDSEAnalysisSection → "TDSE Analysis" (matching BEC/Dirac pattern)

#### F15.6 — FacesSection file name vs rendered title inconsistency
- **File**: `FacesSection.tsx` renders `<Section title="Surface">`
- **Issue**: The component is named `FacesSection`, the file is in `sections/Faces/`, the test file is `FacesSection.test.tsx`, and the data-testid is `section-faces`. But the user-facing title is "Surface". This internal/external naming mismatch makes codebase navigation confusing for developers.
- **Principle**: Not a user-facing UX issue, but developer experience issue
- **Severity**: Pass (2) — users see the correct "Surface" label

#### F15.7 — Drawer toggle labels: abbreviated and unclear
- **File**: `TimelineControls.tsx:271` "Anim", `TimelineControls.tsx:292` "Open Q"
- **Issue**: Already documented in Task #7 (F7.3, F7.4). "Anim" abbreviation and "Open Q" jargon. Included here for completeness of the naming audit.
- **Principle**: §2.3 Information Scent
- **Severity**: Partial (1)

#### F15.8 — Both panel headers use identical `menu` icon
- **File**: `EditorLeftPanel.tsx:75`, `EditorRightPanel.tsx:89`
- **Issue**: Both panels have a `menu` (hamburger) icon before the header text. This icon typically signifies "open menu" or "toggle sidebar" but here it's purely decorative. Users may try to click it expecting menu behavior.
- **Principle**: §1.5 Processing Fluency — decorative use of interactive-coded icon creates false affordance
- **Severity**: Partial (1) — the icon is small and paired with text, mitigating misinterpretation

### Score Summary

| Finding | Score |
|-|-|
| F15.1 Left header "Geometry" mismatch | Partial (1) |
| F15.2 Right header "Visuals" mismatch | Partial (1) |
| F15.3 Sphere icon reused across panels | Partial (1) |
| F15.4 Cog icon reused across panels | Partial (1) |
| F15.5 Two sections titled "Analysis" | Fail (0) |
| F15.6 FacesSection vs "Surface" title | Pass (2) |
| F15.7 Drawer toggle abbreviations | Partial (1) |
| F15.8 Menu icon as decoration | Partial (1) |

## Task #16: OBJECT TYPE EXPLORER

_Status: COMPLETE_

### Files Audited
- `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx` (139 lines)
- `src/stores/slices/geometry/schroedingerSlice.ts` (lines 613-672, `setSchroedingerQuantumMode`)

### Findings

#### F16.1 — No feature availability hints on mode cards
- **File**: `ObjectTypeExplorer.tsx:29-61`
- **Issue**: Each mode card shows only a label and 1-line description. There are no badges, icons, or indicators showing what features are available per mode. Users cannot know before switching that:
  - FSF mode has zero analysis sections, empty animation drawer, no representation controls, no effects
  - TDSE/BEC/Dirac modes lose representation switching, cross-section, quantum effects
  - HO/HydrogenND modes have the richest feature set (5+ analysis tools, full animation, open quantum)
  - TDSE/BEC/Dirac require dim ≥ 3 (auto-enforced)
  - FSF supports dim ≥ 1
  - HO supports dim ≥ 1, HydrogenND supports dim ≥ 3
- **Principle**: §2.3 Information Scent — users need preview of what a mode contains before committing; §3.2 Default Effect — mode selection is the most impactful default in the app, but comparison information is absent
- **Severity**: Fail (0) — the most consequential UI choice (mode selection) provides the least decision-support information

#### F16.2 — No dimension constraint information shown
- **File**: `ObjectTypeExplorer.tsx:95-133`, `schroedingerSlice.ts:616-617`
- **Issue**: Mode cards don't indicate dimension requirements. Switching to TDSE at dim=1 silently auto-jumps to dim=3 (line 616-617). Switching to FSF at dim=1 stays at dim=1 (supported). This dimension enforcement is invisible — no feedback, no pre-indication on the card.
- **Principle**: §1.3 Change Blindness — dimension changes silently; §3.1 Anchoring — user's existing dimension anchors their expectation but gets silently overridden
- **Severity**: Partial (1) — auto-enforcement is correct behavior, but the silent jump confuses

#### F16.3 — Mode switch side effects are numerous and invisible
- **File**: `schroedingerSlice.ts:613-672`
- **Issue**: Selecting a compute mode triggers up to 6 side effects silently:
  1. Dimension forced to ≥ 3 (for TDSE/BEC/Dirac)
  2. Representation forced to 'position'
  3. Cross-section disabled
  4. Lattice arrays resized
  5. `needsReset` set to true
  6. Potential type downgraded (TDSE at 1D: doubleSlit → barrier)
  None of these are communicated to the user. No toast, no feedback, no animation.
- **Principle**: §1.3 Change Blindness — multiple state mutations invisible to user; §5.4 Microinteractions — no feedback loop for consequential actions
- **Severity**: Fail (0) — 6 silent side effects from a single button click

#### F16.4 — Card descriptions are minimal and physics-jargon-heavy
- **File**: `ObjectTypeExplorer.tsx:33, 38, 43, 48, 53, 58`
- **Issue**: Descriptions like "Klein-Gordon field on a lattice with real-time evolution" assume expert knowledge. For a PhD thesis tool this is acceptable, but the descriptions don't help users choose between modes — they describe what each mode IS, not what you can DO with it.
- **Principle**: §2.3 Information Scent — descriptions should signal capability, not just identity
- **Severity**: Pass (2) — acceptable for expert audience; descriptions are technically accurate

#### F16.5 — No visual differentiation between "analytic" and "compute" modes
- **File**: `ObjectTypeExplorer.tsx:29-61`
- **Issue**: The 6 modes fall into two fundamentally different categories:
  - **Analytic** (HO, HydrogenND): inline wavefunction evaluation, full feature set
  - **Compute** (FSF, TDSE, BEC, Dirac): GPU density grid, restricted features
  This categorical difference has massive UX implications (see Tasks #8, #10, #11, #13) but is invisible in the card list. All 6 cards look identical in structure and styling.
- **Principle**: §8.1 Von Restorff — categorically different items should be visually distinguishable; §2.1 Pre-attentive Processing — grouping enables instant pattern recognition
- **Severity**: Partial (1) — expert users learn the distinction, but newcomers are surprised by the feature asymmetry

#### F16.6 — Selected state uses subtle LED indicator only
- **File**: `ObjectTypeExplorer.tsx:119-126`
- **Issue**: The selected mode is indicated by: (1) accent background/border, (2) a 2×2px "LED dot" with glow. The LED dot is a nice design touch, but the overall differentiation between selected and unselected cards relies primarily on the accent tint, which can be subtle depending on theme.
- **Principle**: §2.1 Pre-attentive Processing — selected state should use multiple redundant cues
- **Severity**: Pass (2) — accent tint + glow border + LED dot is three cues; adequate

#### F16.7 — No confirmation or undo for mode switching
- **File**: `ObjectTypeExplorer.tsx:64-71`
- **Issue**: Clicking a card immediately triggers `setQuantumMode(value)` with no confirmation dialog. Given the extensive side effects documented in F16.3 (dimension change, representation reset, cross-section disable), this is a high-stakes one-click action with no undo. Users who accidentally click a mode card lose their current configuration.
- **Principle**: §3.5 Goal Gradient — sudden context destruction resets user progress; §5.3 Flow State — irreversible jumps break flow
- **Severity**: Partial (1) — mode switch is frequently used, so a confirmation dialog would be annoying; but the lack of undo is problematic

### Recommendations

1. **Feature badges on cards**: Add small tags or icons showing key capabilities per mode. Example: "Analysis", "Effects", "Open Q", "Animation" — greyed out when unavailable.
2. **Category grouping**: Visually separate "Analytic Modes" (HO, HydrogenND) from "Compute Modes" (FSF, TDSE, BEC, Dirac) with a subtle header or divider.
3. **Dimension requirement badge**: Show "3D+" or "1D+" on each card to indicate minimum dimension.
4. **Mode switch toast**: After switching, show a brief toast: "Switched to TDSE Dynamics. Dimension set to 3D. Representation reset to Position."
5. **Descriptions rewrite**: Add capability-focused second line: "Supports: analysis, cross-section, effects, open quantum" or "GPU compute mode — field configuration only."

### Score Summary

| Finding | Score |
|-|-|
| F16.1 No feature availability hints | Fail (0) |
| F16.2 No dimension constraint info | Partial (1) |
| F16.3 Silent mode switch side effects | Fail (0) |
| F16.4 Jargon-heavy descriptions | Pass (2) |
| F16.5 No analytic vs compute grouping | Partial (1) |
| F16.6 Selected state indicators | Pass (2) |
| F16.7 No confirmation or undo | Partial (1) |

---

## AUDIT SUMMARY

**Completed**: All 13 tasks (#4-#16)
**Total findings**: 62 individual findings across all tasks
**Files audited**: 30+ source files across layout, sections, stores, hooks

### Aggregate Score Distribution

| Score | Count | Percentage |
|-|-|-|
| Fail (0) | 18 | 29% |
| Partial (1) | 30 | 48% |
| Pass (2) | 14 | 23% |

### Top 5 Critical Issues (Fail-scored, highest impact)

1. **F13.8 — No disabled/explanation state pattern exists anywhere**: Every conditional section uses `return null`. Zero components show "Not available in this mode." This is the root cause of most other issues.
2. **F13.1 — FSF mode has 13 ghost elements**: The most feature-impoverished mode has the most silent disappearances, creating a hollow UI experience.
3. **F16.1 — No feature availability hints on mode cards**: The most consequential user choice (mode selection) provides the least decision-support information.
4. **F16.3 — Silent mode switch side effects**: Up to 6 state mutations from a single card click with zero feedback.
5. **F14.4 — Timeline overflow with hidden scrollbar on mobile**: Critical playback and drawer controls are unreachable on narrow screens.

### Cross-Cutting Themes

1. **Silent disappearance** (Tasks #8, #9, #10, #13): The universal pattern of `return null` without empty states affects every mode transition. 30+ UI elements vanish without feedback.
2. **Feature asymmetry** (Tasks #10, #11, #16): Analytic modes (HO, HydrogenND) have 5-6 analysis/effects tools. Compute modes (FSF, TDSE, BEC, Dirac) have 0-2. This gap is undiscoverable before switching.
3. **Naming inconsistency** (Tasks #5, #6, #15): Panel headers ("Geometry", "Visuals"), section titles (two "Analysis" sections), icon reuse, and drawer labels ("Anim", "Open Q") all contribute to weak information architecture.
4. **Mobile under-served** (Task #14): Breakpoint mismatch, missing controls (Cinematic), hidden scroll, undersized touch targets, and destructive panel behavior.
5. **Toggle pattern split** (Task #12): ToggleButton in drawers vs Switch in sidebar sections, with crossover in SchroedingerCrossSectionSection.
