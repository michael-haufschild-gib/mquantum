2026-02-21: Consolidated Open Quantum UI to timeline controls.
- Added dedicated timeline drawer toggle/button `Open Q` in `src/components/layout/TimelineControls.tsx`.
- New drawer component: `src/components/layout/TimelineControls/SchroedingerOpenQuantumDrawer.tsx`.
- All Open Quantum controls are rendered via `OpenQuantumControls` in that drawer with props `{ defaultOpen: true, integratorDefaultOpen: true, showResetButton: true }`.
- Open Quantum controls were removed from the Anim drawer and removed from the left Geometry `SchroedingerControls` composition.
- Timeline/animation tests updated and new drawer tests added.